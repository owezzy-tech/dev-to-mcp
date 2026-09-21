import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../src/adapters/persistence/prisma-client.ts";
import { PrismaArticleRepository } from "../src/adapters/persistence/prisma-article-repository.ts";
import type { ForemPublisher } from "../src/core/ports/forem-publisher.ts";
import type { AppLogger } from "../src/core/ports/logger.ts";
import { ArticleManagementUseCases } from "../src/core/use-cases/article-management.ts";
import { DraftingUseCases } from "../src/core/use-cases/drafting.ts";
import { NULL_GENERATION_PROVIDER } from "../src/core/ports/generation-provider.ts";
import { ForbiddenError } from "../src/errors/api-errors.ts";

import { cleanupAuthor, createTestAuthor } from "./helpers/article-fixtures.ts";
import { DATABASE_URL } from "./helpers/infrastructure.ts";

const logger: AppLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const fakePublisher: ForemPublisher = {
  async listMyArticles() {
    return [];
  },
  async createArticleDraft() {
    return { id: 1, title: "x", url: "u", published: false, publishedAt: null };
  },
  async updateArticleDraft() {
    return { id: 1, title: "x", url: "u", published: false, publishedAt: null };
  },
  async publishArticle() {
    return { id: 1, title: "x", url: "u", published: true, publishedAt: null };
  },
};

function cleanMarkdown(): string {
  return [
    "# Angular signals",
    "Angular signals are a reactive primitive. See the [docs](https://angular.dev/guide/signals).",
    "",
    "```ts",
    "const count = signal(0);",
    "```",
  ].join("\n");
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

describe("drafting approval lifecycle", () => {
  it("invalidates approval on edit and returns the draft to review", async () => {
    const authorId = await createTestAuthor(prisma, ["DRAFT_WRITE"]);
    createdAuthors.push(authorId);
    const repository = new PrismaArticleRepository(prisma);
    const drafting = new DraftingUseCases(
      NULL_GENERATION_PROVIDER,
      repository,
      logger,
    );
    const management = new ArticleManagementUseCases(
      repository,
      fakePublisher,
      logger,
    );

    const persisted = await drafting.persistDraft({
      authorId,
      title: "Angular signals",
      tags: ["angular"],
      markdown: cleanMarkdown(),
    });
    expect(persisted.draft.state).toBe("DRAFTING");

    const reviewed = await drafting.submitForReview(persisted.draft.id, "corr");
    expect(reviewed.state).toBe("AWAITING_APPROVAL");

    await management.recordApproval(
      authorId,
      { draftId: persisted.draft.id, decision: "APPROVED", ttlSeconds: 600 },
      "corr-approve",
    );
    expect((await repository.getDraft(persisted.draft.id))?.state).toBe(
      "APPROVED",
    );

    const edited = await drafting.editDraft(authorId, {
      draftId: persisted.draft.id,
      markdown: cleanMarkdown() + "\n\nAdditional depth on signals.",
    });

    expect(edited.version.version).toBe(2);
    expect(edited.draft.state).toBe("DRAFTING");

    // The prior approval is bound to version 1; version 2 has no approval.
    const staleApproval = await repository.getApprovalForVersion(
      edited.version.id,
    );
    expect(staleApproval).toBeUndefined();

    // The draft is reviewable again.
    const reReviewed = await drafting.submitForReview(
      persisted.draft.id,
      "corr",
    );
    expect(reReviewed.state).toBe("AWAITING_APPROVAL");
  });

  it("refuses to edit a draft owned by another author", async () => {
    const owner = await createTestAuthor(prisma, ["DRAFT_WRITE"]);
    const intruder = await createTestAuthor(prisma, ["DRAFT_WRITE"]);
    createdAuthors.push(owner, intruder);
    const repository = new PrismaArticleRepository(prisma);
    const drafting = new DraftingUseCases(
      NULL_GENERATION_PROVIDER,
      repository,
      logger,
    );

    const persisted = await drafting.persistDraft({
      authorId: owner,
      title: "Owned",
      tags: ["angular"],
      markdown: cleanMarkdown(),
    });

    await expect(
      drafting.editDraft(intruder, {
        draftId: persisted.draft.id,
        markdown: "hijacked",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
