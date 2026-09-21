import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaArticleRepository } from "../src/adapters/persistence/prisma-article-repository.ts";
import { createPrismaClient } from "../src/adapters/persistence/prisma-client.ts";
import type { ForemRequestContext } from "../src/core/ports/forem-client.ts";
import type {
  DraftArticleInput,
  ForemArticleRecord,
  ForemArticleState,
  ForemPublisher,
  UpdateDraftArticleInput,
} from "../src/core/ports/forem-publisher.ts";
import type { AppLogger } from "../src/core/ports/logger.ts";
import { ArticleManagementUseCases } from "../src/core/use-cases/article-management.ts";
import { ForbiddenError, InvalidInputError } from "../src/errors/api-errors.ts";

import { cleanupAuthor, createTestAuthor } from "./helpers/article-fixtures.ts";
import { DATABASE_URL } from "./helpers/infrastructure.ts";

const logger: AppLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function record(overrides: Partial<ForemArticleRecord>): ForemArticleRecord {
  return {
    id: 111,
    title: "Typed boundaries",
    url: "https://dev.to/ada/typed-boundaries",
    published: false,
    publishedAt: null,
    ...overrides,
  };
}

class FakeForemPublisher implements ForemPublisher {
  readonly calls: string[] = [];
  lastCreate: DraftArticleInput | undefined;
  lastUpdate: UpdateDraftArticleInput | undefined;

  async listMyArticles(
    input: { readonly state: ForemArticleState },
    _context: ForemRequestContext,
  ): Promise<readonly ForemArticleRecord[]> {
    this.calls.push(`list:${input.state}`);
    return [record({ published: input.state !== "unpublished" })];
  }

  async createArticleDraft(
    input: DraftArticleInput,
    _context: ForemRequestContext,
  ): Promise<ForemArticleRecord> {
    this.calls.push("create");
    this.lastCreate = input;
    return record({ id: 111, title: input.title });
  }

  async updateArticleDraft(
    input: UpdateDraftArticleInput,
    _context: ForemRequestContext,
  ): Promise<ForemArticleRecord> {
    this.calls.push("update");
    this.lastUpdate = input;
    return record({ id: input.id, title: input.title ?? "Typed boundaries" });
  }

  async publishArticle(
    input: { readonly id: number },
    _context: ForemRequestContext,
  ): Promise<ForemArticleRecord> {
    this.calls.push("publish");
    return record({
      id: input.id,
      published: true,
      publishedAt: "2026-09-15T00:00:00Z",
    });
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

async function authorWith(
  capabilities: readonly ("READ" | "DRAFT_WRITE" | "PUBLISH")[],
): Promise<string> {
  const authorId = await createTestAuthor(prisma, capabilities);
  createdAuthors.push(authorId);
  return authorId;
}

function useCases(publisher: ForemPublisher): ArticleManagementUseCases {
  return new ArticleManagementUseCases(
    new PrismaArticleRepository(prisma),
    publisher,
    logger,
  );
}

describe("authenticated article management", () => {
  it("lists the author's articles using a mocked Forem contract response", async () => {
    const authorId = await authorWith(["READ"]);
    const publisher = new FakeForemPublisher();

    const articles = await useCases(publisher).listMyArticles(
      authorId,
      "all",
      "corr-list",
    );

    expect(publisher.calls).toEqual(["list:all"]);
    expect(articles).toEqual([record({ published: true })]);
  });

  it("refuses to list without the READ capability", async () => {
    const authorId = await authorWith(["PUBLISH"]);

    await expect(
      useCases(new FakeForemPublisher()).listMyArticles(
        authorId,
        "all",
        "corr-denied",
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("creates a Forem draft and persists version 1 with a content hash", async () => {
    const authorId = await authorWith(["DRAFT_WRITE"]);
    const publisher = new FakeForemPublisher();

    const result = await useCases(publisher).createArticleDraft(
      authorId,
      {
        title: "Typed boundaries",
        bodyMarkdown: "# Hello\n",
        tags: ["typescript", "mcp"],
      },
      "corr-create",
    );

    expect(publisher.calls).toEqual(["create"]);
    expect(publisher.lastCreate?.tags).toEqual(["typescript", "mcp"]);
    expect(result.article.id).toBe(111);
    expect(result.version.version).toBe(1);
    expect(result.version.markdown).toBe("# Hello\n");
    expect(result.draft.state).toBe("DRAFTING");
    expect(result.draft.foremArticleId).toBe(111);
    expect(result.draft.currentVersionId).toBe(result.version.id);
  });

  it("appends a new version on edit and invalidates the previous approval", async () => {
    const authorId = await authorWith(["DRAFT_WRITE"]);
    const publisher = new FakeForemPublisher();
    const cases = useCases(publisher);

    const created = await cases.createArticleDraft(
      authorId,
      { title: "Typed boundaries", bodyMarkdown: "v1", tags: [] },
      "corr-create",
    );
    // Walk the draft to the review gate before deciding on it.
    const repository = new PrismaArticleRepository(prisma);
    await repository.setDraftState(created.draft.id, "AWAITING_APPROVAL");

    const approval = await cases.recordApproval(
      authorId,
      { draftId: created.draft.id, decision: "APPROVED", ttlSeconds: 600 },
      "corr-approve",
    );
    expect(approval.contentHash).toBe(created.version.contentHash);

    const updated = await cases.updateArticleDraft(
      authorId,
      {
        draftId: created.draft.id,
        id: created.article.id,
        bodyMarkdown: "v2",
        title: "Typed boundaries (revised)",
      },
      "corr-update",
    );

    expect(updated.version?.version).toBe(2);
    expect(updated.version?.contentHash).not.toBe(created.version.contentHash);
    expect(updated.version?.id).not.toBe(created.version.id);
    expect(updated.draft.currentVersionId).toBe(updated.version?.id);
    expect(updated.draft.state).toBe("DRAFTING");

    const stillValid =
      updated.version === undefined
        ? undefined
        : await repository.getApprovalForVersion(updated.version.id);
    expect(stillValid).toBeUndefined();
  });

  it("refuses to decide an approval outside the review state", async () => {
    const authorId = await authorWith(["DRAFT_WRITE"]);
    const cases = useCases(new FakeForemPublisher());

    const created = await cases.createArticleDraft(
      authorId,
      { title: "Typed boundaries", bodyMarkdown: "v1", tags: [] },
      "corr-create",
    );

    await expect(
      cases.recordApproval(
        authorId,
        { draftId: created.draft.id, decision: "APPROVED", ttlSeconds: 600 },
        "corr-approve",
      ),
    ).rejects.toBeInstanceOf(InvalidInputError);
  });

  it("allows a rejection from review and returns the draft to revision", async () => {
    const authorId = await authorWith(["DRAFT_WRITE"]);
    const cases = useCases(new FakeForemPublisher());
    const created = await cases.createArticleDraft(
      authorId,
      { title: "Typed boundaries", bodyMarkdown: "v1", tags: [] },
      "corr-create",
    );
    const repository = new PrismaArticleRepository(prisma);
    await repository.setDraftState(created.draft.id, "AWAITING_APPROVAL");

    await cases.recordApproval(
      authorId,
      { draftId: created.draft.id, decision: "REJECTED", ttlSeconds: 600 },
      "corr-reject",
    );

    expect((await repository.getDraft(created.draft.id))?.state).toBe(
      "REJECTED",
    );
  });
});
