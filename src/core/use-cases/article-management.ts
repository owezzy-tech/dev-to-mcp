import {
  ApprovalInvalidError,
  ForbiddenError,
  InvalidInputError,
} from "../../errors/api-errors.ts";
import type {
  ApprovalDecision,
  ApprovalSummary,
  ArticleRepository,
  DraftState,
  DraftSummary,
  DraftVersionSummary,
} from "../ports/article-repository.ts";
import type {
  DraftArticleInput,
  ForemArticleRecord,
  ForemArticleState,
  ForemPublisher,
  UpdateDraftArticleInput,
} from "../ports/forem-publisher.ts";
import type { AppLogger } from "../ports/logger.ts";
import {
  assertCapability,
  type Capability,
} from "../policies/authorization.ts";
import { hashContent } from "../policies/content-hash.ts";

export interface UpdateDraftCommand extends UpdateDraftArticleInput {
  readonly draftId: string;
}

export interface ApprovalCommand {
  readonly draftId: string;
  readonly decision: ApprovalDecision;
  readonly ttlSeconds: number;
  readonly feedback?: string;
}

export interface PublishCommand {
  readonly draftId: string;
  readonly idempotencyKey: string;
}

export interface PublishOutcome {
  readonly article: ForemArticleRecord;
  readonly replayed: boolean;
}

type PublishableState = "APPROVED" | "AWAITING_APPROVAL";

const PUBLISHABLE_STATES: readonly DraftState[] = [
  "APPROVED",
  "AWAITING_APPROVAL",
];

function isPublishableState(state: DraftState): state is PublishableState {
  return PUBLISHABLE_STATES.includes(state);
}

export class ArticleManagementUseCases {
  private readonly repository: ArticleRepository;

  private readonly publisher: ForemPublisher;

  private readonly logger: AppLogger;

  private readonly now: () => number;

  constructor(
    repository: ArticleRepository,
    publisher: ForemPublisher,
    logger: AppLogger,
    now: () => number = Date.now,
  ) {
    this.repository = repository;
    this.publisher = publisher;
    this.logger = logger;
    this.now = now;
  }

  async listMyArticles(
    authorId: string,
    state: ForemArticleState,
    correlationId: string,
  ): Promise<readonly ForemArticleRecord[]> {
    await this.requireCapability(authorId, "READ");
    this.logger.debug(
      { correlationId, operation: "listMyArticles" },
      "article.call",
    );
    return this.publisher.listMyArticles({ state }, { correlationId });
  }

  async createArticleDraft(
    authorId: string,
    input: DraftArticleInput,
    correlationId: string,
  ): Promise<{
    draft: DraftSummary;
    version: DraftVersionSummary;
    article: ForemArticleRecord;
  }> {
    await this.requireCapability(authorId, "DRAFT_WRITE");

    const article = await this.publisher.createArticleDraft(input, {
      correlationId,
    });

    const { draft, version } = await this.repository.createDraftWithVersion({
      authorId,
      title: input.title,
      tags: input.tags,
      markdown: input.bodyMarkdown,
      contentHash: hashContent(input.bodyMarkdown),
      foremArticleId: article.id,
    });

    this.logger.info(
      { correlationId, draftId: draft.id, foremArticleId: article.id },
      "article.draft.created",
    );
    return { draft, version, article };
  }

  async updateArticleDraft(
    authorId: string,
    command: UpdateDraftCommand,
    correlationId: string,
  ): Promise<{
    draft: DraftSummary;
    version: DraftVersionSummary | undefined;
    article: ForemArticleRecord;
  }> {
    await this.requireCapability(authorId, "DRAFT_WRITE");
    const draft = await this.requireOwnedDraft(authorId, command.draftId);

    if (draft.foremArticleId === null) {
      throw new InvalidInputError("Draft has no Forem article to update.");
    }

    const article = await this.publisher.updateArticleDraft(
      { ...command, id: draft.foremArticleId },
      { correlationId },
    );

    if (command.bodyMarkdown === undefined) {
      return {
        draft,
        version: await this.repository.getCurrentVersion(draft.id),
        article,
      };
    }

    const { draft: updated, version } = await this.repository.appendVersion({
      draftId: draft.id,
      markdown: command.bodyMarkdown,
      contentHash: hashContent(command.bodyMarkdown),
      state: "DRAFTING",
      ...(command.title === undefined ? {} : { title: command.title }),
    });

    this.logger.info(
      { correlationId, draftId: draft.id, version: version.version },
      "article.draft.updated",
    );
    return { draft: updated, version, article };
  }

  async recordApproval(
    authorId: string,
    command: ApprovalCommand,
    correlationId: string,
  ): Promise<ApprovalSummary> {
    const draft = await this.requireOwnedDraft(authorId, command.draftId);
    const version = await this.repository.getCurrentVersion(draft.id);
    if (version === undefined) {
      throw new InvalidInputError("Draft has no version to approve.");
    }

    const approval = await this.repository.createApproval({
      authorId,
      draftVersionId: version.id,
      decision: command.decision,
      contentHash: version.contentHash,
      expiresAtMs: this.now() + command.ttlSeconds * 1000,
      ...(command.feedback === undefined ? {} : { feedback: command.feedback }),
    });

    await this.repository.setDraftState(
      draft.id,
      command.decision === "APPROVED" ? "APPROVED" : "REJECTED",
    );

    this.logger.info(
      { correlationId, draftId: draft.id, decision: command.decision },
      "article.approval.recorded",
    );
    return approval;
  }

  async publishArticle(
    authorId: string,
    command: PublishCommand,
    correlationId: string,
  ): Promise<PublishOutcome> {
    await this.requireCapability(authorId, "PUBLISH");

    const replay = await this.resolveIdempotency(authorId, command);
    if (replay !== undefined) {
      return replay;
    }

    const draft = await this.requireOwnedDraft(authorId, command.draftId);
    if (draft.foremArticleId === null) {
      throw new InvalidInputError("Draft has no Forem article to publish.");
    }

    const version = await this.repository.getCurrentVersion(draft.id);
    if (version === undefined) {
      throw new InvalidInputError("Draft has no version to publish.");
    }

    this.assertApprovalValid(
      await this.repository.getApprovalForVersion(version.id),
      version,
      authorId,
    );

    if (!isPublishableState(draft.state)) {
      throw new InvalidInputError(
        `Draft cannot be published from state ${draft.state}.`,
      );
    }

    await this.repository.setDraftState(draft.id, "PUBLISHING");
    await this.repository.recordRun({
      authorId,
      draftId: draft.id,
      idempotencyKey: command.idempotencyKey,
      state: "PUBLISHING",
    });

    const article = await this.publisher.publishArticle(
      { id: draft.foremArticleId },
      { correlationId },
    );

    await this.repository.setDraftState(
      draft.id,
      "PUBLISHED",
      draft.foremArticleId,
    );
    await this.repository.recordRun({
      authorId,
      draftId: draft.id,
      idempotencyKey: command.idempotencyKey,
      state: "PUBLISHED",
      result: article,
    });

    this.logger.info(
      { correlationId, draftId: draft.id, foremArticleId: article.id },
      "article.published",
    );
    return { article, replayed: false };
  }

  private async resolveIdempotency(
    authorId: string,
    command: PublishCommand,
  ): Promise<PublishOutcome | undefined> {
    const existing = await this.repository.findRunByIdempotencyKey(
      command.idempotencyKey,
    );
    if (existing === undefined) {
      return undefined;
    }
    if (existing.draftId !== command.draftId) {
      throw new InvalidInputError(
        "Idempotency key was already used for a different draft.",
      );
    }
    if (existing.state === "PUBLISHED") {
      return { article: existing.result as ForemArticleRecord, replayed: true };
    }
    throw new InvalidInputError(
      "A publish run with this idempotency key is still in progress.",
    );
  }

  private assertApprovalValid(
    approval: ApprovalSummary | undefined,
    version: DraftVersionSummary,
    authorId: string,
  ): void {
    if (approval === undefined) {
      throw new ApprovalInvalidError(
        "No approval exists for the current draft version.",
      );
    }
    if (approval.authorId !== authorId) {
      throw new ApprovalInvalidError(
        "The approval belongs to a different author.",
      );
    }
    if (approval.decision !== "APPROVED") {
      throw new ApprovalInvalidError("The approval decision is not APPROVED.");
    }
    if (approval.expiresAtMs <= this.now()) {
      throw new ApprovalInvalidError("The approval has expired.");
    }
    if (approval.draftVersionId !== version.id) {
      throw new ApprovalInvalidError(
        "The approval belongs to a different draft version.",
      );
    }
    if (approval.contentHash !== version.contentHash) {
      throw new ApprovalInvalidError(
        "The draft content changed after it was approved.",
      );
    }
  }

  private async requireCapability(
    authorId: string,
    capability: Capability,
  ): Promise<void> {
    assertCapability(
      await this.repository.getCapabilities(authorId),
      capability,
    );
  }

  private async requireOwnedDraft(
    authorId: string,
    draftId: string,
  ): Promise<DraftSummary> {
    const draft = await this.repository.getDraft(draftId);
    if (draft === undefined) {
      throw new InvalidInputError("Draft not found.");
    }
    if (draft.authorId !== authorId) {
      throw new ForbiddenError("The draft belongs to a different author.");
    }
    return draft;
  }
}
