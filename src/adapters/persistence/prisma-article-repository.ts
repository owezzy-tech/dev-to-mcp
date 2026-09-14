import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  ApprovalDecision,
  ApprovalSummary,
  ArticleRepository,
  DraftState,
  DraftSummary,
  DraftVersionSummary,
  PublishRunSummary,
} from "../../core/ports/article-repository.ts";
import type { Capability } from "../../core/policies/authorization.ts";

type DraftRow = {
  id: string;
  authorId: string;
  title: string;
  tags: string[];
  state: string;
  foremArticleId: number | null;
  currentVersionId: string | null;
};

type VersionRow = {
  id: string;
  draftId: string;
  version: number;
  markdown: string;
  contentHash: string;
};

export class PrismaArticleRepository implements ArticleRepository {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async getCapabilities(authorId: string): Promise<readonly Capability[]> {
    const rows = await this.prisma.authorAuthorization.findMany({
      where: { authorId, revokedAt: null },
      select: { capability: true },
    });
    return rows.map((row) => row.capability as Capability);
  }

  async listDrafts(authorId: string): Promise<readonly DraftSummary[]> {
    const rows = await this.prisma.draft.findMany({ where: { authorId } });
    return rows.map(toDraftSummary);
  }

  async getDraft(draftId: string): Promise<DraftSummary | undefined> {
    const row = await this.prisma.draft.findUnique({ where: { id: draftId } });
    return row === null ? undefined : toDraftSummary(row);
  }

  async getCurrentVersion(
    draftId: string,
  ): Promise<DraftVersionSummary | undefined> {
    const draft = await this.prisma.draft.findUnique({
      where: { id: draftId },
      select: { currentVersionId: true },
    });
    if (
      draft?.currentVersionId === null ||
      draft?.currentVersionId === undefined
    ) {
      return undefined;
    }
    const version = await this.prisma.draftVersion.findUnique({
      where: { id: draft.currentVersionId },
    });
    return version === null ? undefined : toVersionSummary(version);
  }

  async createDraftWithVersion(input: {
    authorId: string;
    title: string;
    tags: readonly string[];
    markdown: string;
    contentHash: string;
    foremArticleId: number;
  }): Promise<{ draft: DraftSummary; version: DraftVersionSummary }> {
    return this.prisma.$transaction(async (tx) => {
      const draft = await tx.draft.create({
        data: {
          authorId: input.authorId,
          title: input.title,
          tags: [...input.tags],
          state: "DRAFTING",
          foremArticleId: input.foremArticleId,
        },
      });
      const version = await tx.draftVersion.create({
        data: {
          draftId: draft.id,
          version: 1,
          markdown: input.markdown,
          contentHash: input.contentHash,
        },
      });
      const updated = await tx.draft.update({
        where: { id: draft.id },
        data: { currentVersionId: version.id },
      });
      return {
        draft: toDraftSummary(updated),
        version: toVersionSummary(version),
      };
    });
  }

  async appendVersion(input: {
    draftId: string;
    markdown: string;
    contentHash: string;
    title?: string;
    state: DraftState;
  }): Promise<{ draft: DraftSummary; version: DraftVersionSummary }> {
    return this.prisma.$transaction(async (tx) => {
      const latest = await tx.draftVersion.findFirst({
        where: { draftId: input.draftId },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const nextVersion = (latest?.version ?? 0) + 1;

      const version = await tx.draftVersion.create({
        data: {
          draftId: input.draftId,
          version: nextVersion,
          markdown: input.markdown,
          contentHash: input.contentHash,
        },
      });
      const updated = await tx.draft.update({
        where: { id: input.draftId },
        data: {
          currentVersionId: version.id,
          state: input.state,
          ...(input.title === undefined ? {} : { title: input.title }),
        },
      });
      return {
        draft: toDraftSummary(updated),
        version: toVersionSummary(version),
      };
    });
  }

  async createApproval(input: {
    authorId: string;
    draftVersionId: string;
    decision: ApprovalDecision;
    contentHash: string;
    expiresAtMs: number;
    feedback?: string;
  }): Promise<ApprovalSummary> {
    const row = await this.prisma.approval.create({
      data: {
        authorId: input.authorId,
        draftVersionId: input.draftVersionId,
        decision: input.decision,
        contentHash: input.contentHash,
        expiresAt: new Date(input.expiresAtMs),
        ...(input.feedback === undefined ? {} : { feedback: input.feedback }),
      },
    });
    return {
      id: row.id,
      authorId: row.authorId,
      draftVersionId: row.draftVersionId,
      decision: row.decision as ApprovalDecision,
      contentHash: row.contentHash,
      expiresAtMs: row.expiresAt.getTime(),
    };
  }

  async getApprovalForVersion(
    draftVersionId: string,
  ): Promise<ApprovalSummary | undefined> {
    const row = await this.prisma.approval.findFirst({
      where: { draftVersionId },
      orderBy: { decidedAt: "desc" },
    });
    return row === null
      ? undefined
      : {
          id: row.id,
          authorId: row.authorId,
          draftVersionId: row.draftVersionId,
          decision: row.decision as ApprovalDecision,
          contentHash: row.contentHash,
          expiresAtMs: row.expiresAt.getTime(),
        };
  }

  async setDraftState(
    draftId: string,
    state: DraftState,
    foremArticleId?: number | null,
  ): Promise<void> {
    await this.prisma.draft.update({
      where: { id: draftId },
      data: {
        state,
        ...(foremArticleId === undefined ? {} : { foremArticleId }),
      },
    });
  }

  async findRunByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<PublishRunSummary | undefined> {
    const row = await this.prisma.workflowRun.findUnique({
      where: { idempotencyKey },
    });
    return row === null
      ? undefined
      : {
          id: row.id,
          draftId: row.draftId,
          state: row.state as DraftState,
          result: row.result,
        };
  }

  async recordRun(input: {
    authorId: string;
    draftId: string;
    idempotencyKey: string;
    state: DraftState;
    result?: unknown;
  }): Promise<void> {
    const data = {
      authorId: input.authorId,
      draftId: input.draftId,
      state: input.state,
      ...(input.result === undefined
        ? {}
        : { result: input.result as Prisma.InputJsonValue }),
    };
    await this.prisma.workflowRun.upsert({
      where: { idempotencyKey: input.idempotencyKey },
      create: { idempotencyKey: input.idempotencyKey, ...data },
      update: data,
    });
  }
}

function toDraftSummary(row: DraftRow): DraftSummary {
  return {
    id: row.id,
    authorId: row.authorId,
    title: row.title,
    tags: row.tags,
    state: row.state as DraftState,
    foremArticleId: row.foremArticleId,
    currentVersionId: row.currentVersionId,
  };
}

function toVersionSummary(row: VersionRow): DraftVersionSummary {
  return {
    id: row.id,
    draftId: row.draftId,
    version: row.version,
    markdown: row.markdown,
    contentHash: row.contentHash,
  };
}
