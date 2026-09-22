import type {
  ApprovalDecision,
  ApprovalSummary,
  ArticleRepository,
  DraftState,
  DraftSummary,
  DraftVersionSummary,
  PublishRunSummary,
} from "../core/ports/article-repository.ts";
import type { Capability } from "../core/policies/authorization.ts";
import type {
  ForemArticleRecord,
  ForemPublisher,
} from "../core/ports/forem-publisher.ts";
import type { AppLogger } from "../core/ports/logger.ts";
import type {
  ArticleSnapshotInput,
  RetrievalRepository,
  ScoredSnapshot,
  SnapshotRecord,
} from "../core/ports/retrieval-repository.ts";
import { hashContent } from "../core/policies/content-hash.ts";
import { ArticleManagementUseCases } from "../core/use-cases/article-management.ts";
import { RetrievalUseCases } from "../core/use-cases/retrieval.ts";
import type {
  Embedding,
  EmbeddingProvider,
} from "../core/ports/embedding-provider.ts";
import type {
  DuplicationJudgment,
  GapAnalysis,
  JudgmentProvider,
  SafetyJudgment,
} from "../core/ports/judgment-provider.ts";

export const logger: AppLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/** In-memory article repository for deterministic eval scenarios. */
export class EvalArticleRepository implements ArticleRepository {
  drafts = new Map<string, DraftSummary>();
  versions = new Map<string, DraftVersionSummary>();
  approvals: ApprovalSummary[] = [];
  capabilities: readonly Capability[] = ["READ", "DRAFT_WRITE", "PUBLISH"];
  private nextDraft = 1;
  private nextVersion = 1;

  async getCapabilities(): Promise<readonly Capability[]> {
    return this.capabilities;
  }
  async listDrafts(): Promise<readonly DraftSummary[]> {
    return [...this.drafts.values()];
  }
  async getDraft(id: string): Promise<DraftSummary | undefined> {
    return this.drafts.get(id);
  }
  async getCurrentVersion(
    id: string,
  ): Promise<DraftVersionSummary | undefined> {
    const draft = this.drafts.get(id);
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
  async appendVersion(input: {
    draftId: string;
    markdown: string;
    contentHash: string;
    title?: string;
    state: DraftState;
  }): Promise<{ draft: DraftSummary; version: DraftVersionSummary }> {
    const draft = this.drafts.get(input.draftId);
    if (draft === undefined) throw new Error("missing draft");
    const versionId = `v${this.nextVersion++}`;
    const version: DraftVersionSummary = {
      id: versionId,
      draftId: draft.id,
      version: 2,
      markdown: input.markdown,
      contentHash: input.contentHash,
    };
    this.versions.set(versionId, version);
    const updated: DraftSummary = {
      ...draft,
      state: input.state,
      currentVersionId: versionId,
      ...(input.title === undefined ? {} : { title: input.title }),
    };
    this.drafts.set(draft.id, updated);
    return { draft: updated, version };
  }
  async createApproval(input: {
    authorId: string;
    draftVersionId: string;
    decision: ApprovalDecision;
    contentHash: string;
    expiresAtMs: number;
  }): Promise<ApprovalSummary> {
    const approval: ApprovalSummary = {
      id: `a${this.approvals.length + 1}`,
      authorId: input.authorId,
      draftVersionId: input.draftVersionId,
      decision: input.decision,
      contentHash: input.contentHash,
      expiresAtMs: input.expiresAtMs,
    };
    this.approvals.push(approval);
    return approval;
  }
  async getApprovalForVersion(
    versionId: string,
  ): Promise<ApprovalSummary | undefined> {
    return this.approvals.find((a) => a.draftVersionId === versionId);
  }
  async setDraftState(id: string, state: DraftState): Promise<void> {
    const draft = this.drafts.get(id);
    if (draft !== undefined) this.drafts.set(id, { ...draft, state });
  }
  async findRunByIdempotencyKey(): Promise<PublishRunSummary | undefined> {
    return undefined;
  }
  async recordRun(): Promise<void> {}
}

/** In-memory retrieval repository for prompt-injection scenarios. */
export class EvalRetrievalRepository implements RetrievalRepository {
  snapshots: SnapshotRecord[] = [];
  private next = 1;

  async upsertSnapshot(input: ArticleSnapshotInput): Promise<SnapshotRecord> {
    const record: SnapshotRecord = {
      id: `s${this.next++}`,
      authorId: input.authorId ?? null,
      foremArticleId: input.foremArticleId,
      title: input.title,
      description: input.description,
      tagList: [...input.tagList],
      commentsCount: input.commentsCount,
      publicReactionsCount: input.publicReactionsCount,
      publishedAt: input.publishedAt,
      authorUsername: input.authorUsername,
      observedAt: new Date(),
    };
    this.snapshots.push(record);
    return record;
  }
  async storeEmbedding(): Promise<void> {}
  async hasEmbeddings(): Promise<boolean> {
    return false;
  }
  async searchByText(
    query: string,
    limit: number,
  ): Promise<readonly ScoredSnapshot[]> {
    return this.snapshots
      .filter((s) => s.title.toLowerCase().includes(query.toLowerCase()))
      .slice(0, limit)
      .map((snapshot) => ({ snapshot, score: 1 }));
  }
  async searchByVector(
    _v: readonly number[],
    limit: number,
  ): Promise<readonly ScoredSnapshot[]> {
    return this.snapshots
      .slice(0, limit)
      .map((snapshot) => ({ snapshot, score: 0.9 }));
  }
  async listSnapshots(): Promise<readonly SnapshotRecord[]> {
    return this.snapshots;
  }
  async listSnapshotsByAuthor(
    authorId: string,
  ): Promise<readonly SnapshotRecord[]> {
    return this.snapshots.filter((s) => s.authorId === authorId);
  }
  async countSnapshots(): Promise<number> {
    return this.snapshots.length;
  }
}

/** Forem publisher that records publish attempts so graders can assert none fire. */
export class RecordingPublisher implements ForemPublisher {
  publishCalls: number[] = [];

  async listMyArticles(): Promise<readonly ForemArticleRecord[]> {
    return [];
  }
  async createArticleDraft(input: {
    title: string;
  }): Promise<ForemArticleRecord> {
    return {
      id: 42,
      title: input.title,
      url: "https://dev.to/a",
      published: false,
      publishedAt: null,
    };
  }
  async updateArticleDraft(): Promise<ForemArticleRecord> {
    return {
      id: 42,
      title: "t",
      url: "https://dev.to/a",
      published: false,
      publishedAt: null,
    };
  }
  async publishArticle(input: { id: number }): Promise<ForemArticleRecord> {
    this.publishCalls.push(input.id);
    return {
      id: input.id,
      title: "t",
      url: "https://dev.to/a",
      published: true,
      publishedAt: "2026-09-01T00:00:00Z",
    };
  }
}

const nullEmbeddings: EmbeddingProvider = {
  model: "none",
  dimensions: 0,
  async embed(): Promise<readonly Embedding[]> {
    return [];
  },
};

const nullJudgments: JudgmentProvider = {
  async detectDuplication(): Promise<DuplicationJudgment> {
    return { duplicate: false, similarity: 0, rationale: null };
  },
  async analyzeGap(): Promise<GapAnalysis> {
    return {
      themes: [],
      underservedQuestions: [],
      representativeArticles: [],
      confidence: 0,
    };
  },
  async assessSafety(): Promise<SafetyJudgment> {
    return { hostile: false, severity: 0, rationale: null };
  },
};

export function buildArticleCases(): {
  repository: EvalArticleRepository;
  publisher: RecordingPublisher;
  useCases: ArticleManagementUseCases;
  now: () => number;
} {
  const repository = new EvalArticleRepository();
  const publisher = new RecordingPublisher();
  const nowMs = { value: 1_800_000_000_000 };
  const useCases = new ArticleManagementUseCases(
    repository,
    publisher,
    logger,
    () => nowMs.value,
  );
  return { repository, publisher, useCases, now: () => nowMs.value };
}

export function buildRetrievalCases(): {
  repository: EvalRetrievalRepository;
  useCases: RetrievalUseCases;
} {
  const repository = new EvalRetrievalRepository();
  const useCases = new RetrievalUseCases(
    repository,
    nullEmbeddings,
    nullJudgments,
    logger,
  );
  return { repository, useCases };
}

export async function seedApprovedDraft(authorId: string): Promise<{
  repository: EvalArticleRepository;
  draftId: string;
  versionId: string;
  contentHash: string;
}> {
  const repository = new EvalArticleRepository();
  const markdown = "# Approved\n\nBody.";
  const { draft, version } = await repository.createDraftWithVersion({
    authorId,
    title: "Approved draft",
    tags: ["angular"],
    markdown,
    contentHash: hashContent(markdown),
    foremArticleId: 42,
  });
  await repository.setDraftState(draft.id, "APPROVED");
  await repository.createApproval({
    authorId,
    draftVersionId: version.id,
    decision: "APPROVED",
    contentHash: version.contentHash,
    expiresAtMs: 1_800_000_000_000 + 60_000,
  });
  return {
    repository,
    draftId: draft.id,
    versionId: version.id,
    contentHash: version.contentHash,
  };
}
