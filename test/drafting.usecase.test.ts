import { describe, expect, it } from "vitest";
import type { GenerationProvider } from "../src/core/ports/generation-provider.ts";
import type {
  ApprovalSummary,
  ArticleRepository,
  DraftSummary,
  DraftState,
  DraftVersionSummary,
  PublishRunSummary,
} from "../src/core/ports/article-repository.ts";
import type { Capability } from "../src/core/policies/authorization.ts";
import type { AppLogger } from "../src/core/ports/logger.ts";
import { DraftingUseCases } from "../src/core/use-cases/drafting.ts";
import {
  DraftQualityError,
  UpstreamPayloadError,
} from "../src/errors/api-errors.ts";

const logger: AppLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

class ScriptedGeneration implements GenerationProvider {
  model = "scripted";
  private queue: string[] = [];

  enqueue(response: string): void {
    this.queue.push(response);
  }

  async generate(): Promise<string> {
    const next = this.queue.shift();
    if (next === undefined) {
      throw new Error("No scripted response available.");
    }
    return next;
  }
}

class InMemoryArticles implements ArticleRepository {
  drafts = new Map<string, DraftSummary>();
  versions = new Map<string, DraftVersionSummary>();
  private nextDraft = 1;
  private nextVersion = 1;

  async getCapabilities(): Promise<readonly Capability[]> {
    return [];
  }
  async listDrafts(): Promise<readonly DraftSummary[]> {
    return [...this.drafts.values()];
  }
  async getDraft(draftId: string): Promise<DraftSummary | undefined> {
    return this.drafts.get(draftId);
  }
  async getCurrentVersion(
    draftId: string,
  ): Promise<DraftVersionSummary | undefined> {
    const draft = this.drafts.get(draftId);
    return draft?.currentVersionId === null ||
      draft?.currentVersionId === undefined
      ? undefined
      : this.versions.get(draft.currentVersionId);
  }
  async createDraftWithVersion(input: {
    authorId: string;
    title: string;
    tags: readonly string[];
    markdown: string;
    contentHash: string;
    foremArticleId: number | null;
  }): Promise<{ draft: DraftSummary; version: DraftVersionSummary }> {
    const draftId = `d${this.nextDraft++}`;
    const versionId = `v${this.nextVersion++}`;
    const version: DraftVersionSummary = {
      id: versionId,
      draftId,
      version: 1,
      markdown: input.markdown,
      contentHash: input.contentHash,
    };
    const draft: DraftSummary = {
      id: draftId,
      authorId: input.authorId,
      title: input.title,
      tags: input.tags,
      state: "DRAFTING",
      foremArticleId: input.foremArticleId,
      currentVersionId: versionId,
    };
    this.drafts.set(draftId, draft);
    this.versions.set(versionId, version);
    return { draft, version };
  }
  async appendVersion(): Promise<{
    draft: DraftSummary;
    version: DraftVersionSummary;
  }> {
    throw new Error("not implemented");
  }
  async createApproval(): Promise<ApprovalSummary> {
    throw new Error("not implemented");
  }
  async getApprovalForVersion(): Promise<ApprovalSummary | undefined> {
    return undefined;
  }
  async setDraftState(draftId: string, state: DraftState): Promise<void> {
    const draft = this.drafts.get(draftId);
    if (draft !== undefined) {
      this.drafts.set(draftId, { ...draft, state });
    }
  }
  async findRunByIdempotencyKey(): Promise<PublishRunSummary | undefined> {
    return undefined;
  }
  async recordRun(): Promise<void> {
    return undefined;
  }
}

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

const ideaJson = JSON.stringify([
  {
    title: "Signals in practice",
    audience: "Intermediate Angular developers",
    problem: "Confusing change detection",
    differentiation: "Concrete migration examples",
    evidence: [{ title: "Angular docs", url: "https://angular.dev" }],
    score: 0.9,
  },
  {
    title: "Signals vs observables",
    audience: "RxJS veterans",
    problem: "Choosing the right primitive",
    differentiation: "Decision framework",
    evidence: [],
    score: 0.7,
  },
]);

describe("drafting use cases", () => {
  it("generates multiple explainable ideas from cited evidence", async () => {
    const generation = new ScriptedGeneration();
    generation.enqueue(ideaJson);
    const useCases = new DraftingUseCases(
      generation,
      new InMemoryArticles(),
      logger,
    );

    const ideas = await useCases.generateIdeas(
      {
        topic: "Angular signals",
        evidence: [{ title: "Angular docs", url: "https://angular.dev" }],
        count: 2,
      },
      "corr",
    );

    expect(ideas).toHaveLength(2);
    expect(ideas[0]?.audience).toBeTruthy();
    expect(ideas[0]?.problem).toBeTruthy();
    expect(ideas[0]?.differentiation).toBeTruthy();
    expect(ideas[0]?.evidence.length).toBeGreaterThan(0);
  });

  it("rejects invalid idea output as an upstream payload error", async () => {
    const generation = new ScriptedGeneration();
    generation.enqueue("not json at all");
    const useCases = new DraftingUseCases(
      generation,
      new InMemoryArticles(),
      logger,
    );

    await expect(
      useCases.generateIdeas({ topic: "x", evidence: [], count: 2 }, "corr"),
    ).rejects.toBeInstanceOf(UpstreamPayloadError);
  });

  it("generates a draft with citations and verification markers", async () => {
    const generation = new ScriptedGeneration();
    generation.enqueue(
      "Signals are powerful [docs](https://angular.dev) but not always fastest [VERIFY].",
    );
    const useCases = new DraftingUseCases(
      generation,
      new InMemoryArticles(),
      logger,
    );

    const draft = await useCases.generateDraft(
      {
        idea: {
          title: "Signals in practice",
          audience: "devs",
          problem: "p",
          differentiation: "d",
          evidence: [],
          score: 0.8,
        },
      },
      "corr",
    );

    expect(draft.citations).toContain("https://angular.dev");
    expect(draft.verificationMarkerCount).toBeGreaterThanOrEqual(1);
  });

  it("persists a clean draft in DRAFTING state", async () => {
    const useCases = new DraftingUseCases(
      new ScriptedGeneration(),
      new InMemoryArticles(),
      logger,
    );

    const result = await useCases.persistDraft({
      authorId: "author-1",
      title: "Signals",
      tags: ["angular"],
      markdown: cleanMarkdown(),
    });

    expect(result.draft.state).toBe("DRAFTING");
    expect(result.draft.foremArticleId).toBeNull();
    expect(result.lint.passed).toBe(true);
  });

  it("blocks persistence when quality checks fail", async () => {
    const useCases = new DraftingUseCases(
      new ScriptedGeneration(),
      new InMemoryArticles(),
      logger,
    );

    await expect(
      useCases.persistDraft({
        authorId: "author-1",
        title: "Signals",
        tags: ["angular"],
        markdown: "Signals are the fastest way to manage state.",
      }),
    ).rejects.toBeInstanceOf(DraftQualityError);
  });

  it("submits a clean draft for review and blocks a failing one", async () => {
    const articles = new InMemoryArticles();
    const useCases = new DraftingUseCases(
      new ScriptedGeneration(),
      articles,
      logger,
    );

    const clean = await useCases.persistDraft({
      authorId: "author-1",
      title: "Clean",
      tags: ["angular"],
      markdown: cleanMarkdown(),
    });
    const reviewed = await useCases.submitForReview(clean.draft.id, "corr");
    expect(reviewed.state).toBe("AWAITING_APPROVAL");

    // Seed a draft with a personal-experience blocker, bypassing persistDraft.
    const seeded = await articles.createDraftWithVersion({
      authorId: "author-1",
      title: "Failing",
      tags: ["angular"],
      markdown: "We migrated our stack to signals.",
      contentHash: "hash",
      foremArticleId: null,
    });
    await expect(
      useCases.submitForReview(seeded.draft.id, "corr"),
    ).rejects.toBeInstanceOf(DraftQualityError);
  });
});
