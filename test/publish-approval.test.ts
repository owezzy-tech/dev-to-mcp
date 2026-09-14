import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaArticleRepository } from "../src/adapters/persistence/prisma-article-repository.ts";
import { createPrismaClient } from "../src/adapters/persistence/prisma-client.ts";
import type { DraftState } from "../src/core/ports/article-repository.ts";
import type { ForemRequestContext } from "../src/core/ports/forem-client.ts";
import type {
  DraftArticleInput,
  ForemArticleRecord,
  ForemArticleState,
  ForemPublisher,
  UpdateDraftArticleInput,
} from "../src/core/ports/forem-publisher.ts";
import type { AppLogger } from "../src/core/ports/logger.ts";
import { hashContent } from "../src/core/policies/content-hash.ts";
import { ArticleManagementUseCases } from "../src/core/use-cases/article-management.ts";
import {
  ApprovalInvalidError,
  ForbiddenError,
  InvalidInputError,
} from "../src/errors/api-errors.ts";

import { cleanupAuthor, createTestAuthor } from "./helpers/article-fixtures.ts";
import { DATABASE_URL } from "./helpers/infrastructure.ts";

const logger: AppLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

let nowMs = 1_800_000_000_000;
const now = () => nowMs;

const publishCalls: number[] = [];

class FakeForemPublisher implements ForemPublisher {
  async listMyArticles(
    _input: { readonly state: ForemArticleState },
    _context: ForemRequestContext,
  ): Promise<readonly ForemArticleRecord[]> {
    return [];
  }

  async createArticleDraft(
    _input: DraftArticleInput,
    _context: ForemRequestContext,
  ): Promise<ForemArticleRecord> {
    return {
      id: 42,
      title: "T",
      url: "https://dev.to/a",
      published: false,
      publishedAt: null,
    };
  }

  async updateArticleDraft(
    _input: UpdateDraftArticleInput,
    _context: ForemRequestContext,
  ): Promise<ForemArticleRecord> {
    return {
      id: 42,
      title: "T",
      url: "https://dev.to/a",
      published: false,
      publishedAt: null,
    };
  }

  async publishArticle(
    input: { readonly id: number },
    _context: ForemRequestContext,
  ): Promise<ForemArticleRecord> {
    publishCalls.push(input.id);
    return {
      id: input.id,
      title: "T",
      url: "https://dev.to/ada/typed-boundaries",
      published: true,
      publishedAt: "2026-09-15T00:00:00Z",
    };
  }
}

let prisma: ReturnType<typeof createPrismaClient>;
const createdAuthors: string[] = [];

beforeAll(() => {
  prisma = createPrismaClient({ connectionString: DATABASE_URL });
});

afterAll(async () => {
  for (const authorId of createdAuthors) {
    await cleanupAuthor(prisma, authorId);
  }
  await prisma.$disconnect();
});

async function newAuthor(
  capabilities: readonly ("READ" | "DRAFT_WRITE" | "PUBLISH")[],
): Promise<string> {
  const authorId = await createTestAuthor(prisma, capabilities);
  createdAuthors.push(authorId);
  return authorId;
}

async function newDraft(
  authorId: string,
  state: DraftState = "APPROVED",
): Promise<{
  repository: PrismaArticleRepository;
  draftId: string;
  versionId: string;
  contentHash: string;
}> {
  const repository = new PrismaArticleRepository(prisma);
  const { draft, version } = await repository.createDraftWithVersion({
    authorId,
    title: "Typed boundaries",
    tags: ["typescript"],
    markdown: "body",
    contentHash: hashContent("body"),
    foremArticleId: 42,
  });
  await repository.setDraftState(draft.id, state);
  return {
    repository,
    draftId: draft.id,
    versionId: version.id,
    contentHash: version.contentHash,
  };
}

function cases(repository: PrismaArticleRepository): ArticleManagementUseCases {
  return new ArticleManagementUseCases(
    repository,
    new FakeForemPublisher(),
    logger,
    now,
  );
}

describe("publish approval verification", () => {
  it("rejects a publish without the PUBLISH capability", async () => {
    const authorId = await newAuthor(["READ", "DRAFT_WRITE"]);
    const { repository, draftId } = await newDraft(authorId);

    await expect(
      cases(repository).publishArticle(
        authorId,
        { draftId, idempotencyKey: "key-no-cap" },
        "corr",
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects a publish with no approval", async () => {
    const authorId = await newAuthor(["PUBLISH"]);
    const { repository, draftId } = await newDraft(authorId);

    await expect(
      cases(repository).publishArticle(
        authorId,
        { draftId, idempotencyKey: "key-missing" },
        "corr",
      ),
    ).rejects.toBeInstanceOf(ApprovalInvalidError);
  });

  it("rejects a publish whose approval was rejected", async () => {
    const authorId = await newAuthor(["PUBLISH"]);
    const { repository, draftId, versionId, contentHash } =
      await newDraft(authorId);
    await repository.createApproval({
      authorId,
      draftVersionId: versionId,
      decision: "REJECTED",
      contentHash,
      expiresAtMs: nowMs + 60_000,
    });

    await expect(
      cases(repository).publishArticle(
        authorId,
        { draftId, idempotencyKey: "key-rejected" },
        "corr",
      ),
    ).rejects.toBeInstanceOf(ApprovalInvalidError);
  });

  it("rejects a publish whose approval has expired", async () => {
    const authorId = await newAuthor(["PUBLISH"]);
    const { repository, draftId, versionId, contentHash } =
      await newDraft(authorId);
    await repository.createApproval({
      authorId,
      draftVersionId: versionId,
      decision: "APPROVED",
      contentHash,
      expiresAtMs: nowMs - 1,
    });

    await expect(
      cases(repository).publishArticle(
        authorId,
        { draftId, idempotencyKey: "key-expired" },
        "corr",
      ),
    ).rejects.toBeInstanceOf(ApprovalInvalidError);
  });

  it("rejects a publish whose content changed after approval", async () => {
    const authorId = await newAuthor(["PUBLISH"]);
    const { repository, draftId, versionId } = await newDraft(authorId);
    await repository.createApproval({
      authorId,
      draftVersionId: versionId,
      decision: "APPROVED",
      contentHash: hashContent("something else entirely"),
      expiresAtMs: nowMs + 60_000,
    });

    await expect(
      cases(repository).publishArticle(
        authorId,
        { draftId, idempotencyKey: "key-changed" },
        "corr",
      ),
    ).rejects.toBeInstanceOf(ApprovalInvalidError);
  });

  it("rejects a publish whose approval belongs to a different author", async () => {
    const authorId = await newAuthor(["PUBLISH"]);
    const foreignAuthorId = await newAuthor(["PUBLISH"]);
    const { repository, draftId, versionId, contentHash } =
      await newDraft(authorId);
    await repository.createApproval({
      authorId: foreignAuthorId,
      draftVersionId: versionId,
      decision: "APPROVED",
      contentHash,
      expiresAtMs: nowMs + 60_000,
    });

    await expect(
      cases(repository).publishArticle(
        authorId,
        { draftId, idempotencyKey: "key-foreign" },
        "corr",
      ),
    ).rejects.toBeInstanceOf(ApprovalInvalidError);
  });

  it("rejects a publish from a non-publishable lifecycle state", async () => {
    const authorId = await newAuthor(["PUBLISH"]);
    const { repository, draftId, versionId, contentHash } = await newDraft(
      authorId,
      "DRAFTING",
    );
    await repository.createApproval({
      authorId,
      draftVersionId: versionId,
      decision: "APPROVED",
      contentHash,
      expiresAtMs: nowMs + 60_000,
    });

    await expect(
      cases(repository).publishArticle(
        authorId,
        { draftId, idempotencyKey: "key-state" },
        "corr",
      ),
    ).rejects.toBeInstanceOf(InvalidInputError);
  });

  it("publishes the exact approved version and records the transition", async () => {
    const authorId = await newAuthor(["PUBLISH"]);
    const { repository, draftId, versionId, contentHash } =
      await newDraft(authorId);
    await repository.createApproval({
      authorId,
      draftVersionId: versionId,
      decision: "APPROVED",
      contentHash,
      expiresAtMs: nowMs + 60_000,
    });
    publishCalls.length = 0;

    const outcome = await cases(repository).publishArticle(
      authorId,
      { draftId, idempotencyKey: "key-valid" },
      "corr",
    );

    expect(outcome.replayed).toBe(false);
    expect(outcome.article.published).toBe(true);
    expect(publishCalls).toEqual([42]);
    expect((await repository.getDraft(draftId))?.state).toBe("PUBLISHED");
  });

  it("replays a published idempotency key without publishing twice", async () => {
    const authorId = await newAuthor(["PUBLISH"]);
    const { repository, draftId, versionId, contentHash } =
      await newDraft(authorId);
    await repository.createApproval({
      authorId,
      draftVersionId: versionId,
      decision: "APPROVED",
      contentHash,
      expiresAtMs: nowMs + 60_000,
    });
    publishCalls.length = 0;
    const useCaseSet = cases(repository);

    const first = await useCaseSet.publishArticle(
      authorId,
      { draftId, idempotencyKey: "key-replay" },
      "corr",
    );
    const second = await useCaseSet.publishArticle(
      authorId,
      { draftId, idempotencyKey: "key-replay" },
      "corr",
    );

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.article.url).toBe(first.article.url);
    expect(publishCalls).toEqual([42]);
  });

  it("rejects reusing an idempotency key for a different draft", async () => {
    const authorId = await newAuthor(["PUBLISH"]);
    const first = await newDraft(authorId);
    const second = await newDraft(authorId);
    for (const target of [first, second]) {
      await target.repository.createApproval({
        authorId,
        draftVersionId: target.versionId,
        decision: "APPROVED",
        contentHash: target.contentHash,
        expiresAtMs: nowMs + 60_000,
      });
    }
    const useCaseSet = cases(first.repository);

    await useCaseSet.publishArticle(
      authorId,
      { draftId: first.draftId, idempotencyKey: "key-shared" },
      "corr",
    );

    await expect(
      useCaseSet.publishArticle(
        authorId,
        { draftId: second.draftId, idempotencyKey: "key-shared" },
        "corr",
      ),
    ).rejects.toBeInstanceOf(InvalidInputError);
  });
});
