import express from "express";
import type { AuditLogger } from "../../src/adapters/audit/audit-log.ts";
import type {
  ApprovalDecision,
  ApprovalSummary,
  ArticleRepository,
  DraftState,
  DraftSummary,
  DraftVersionSummary,
  PublishRunSummary,
} from "../../src/core/ports/article-repository.ts";
import type { Capability } from "../../src/core/policies/authorization.ts";
import type {
  Embedding,
  EmbeddingProvider,
} from "../../src/core/ports/embedding-provider.ts";
import type {
  ForemClient,
  ForemRequestContext,
  GetArticleQuery,
  GetUserQuery,
  ListArticlesQuery,
  SearchArticlesQuery,
} from "../../src/core/ports/forem-client.ts";
import type {
  DraftArticleInput,
  ForemArticleRecord,
  ForemArticleState,
  ForemPublisher,
  UpdateDraftArticleInput,
} from "../../src/core/ports/forem-publisher.ts";
import type { GenerationProvider } from "../../src/core/ports/generation-provider.ts";
import type {
  DuplicationJudgment,
  GapAnalysis,
  JudgmentProvider,
  SafetyJudgment,
} from "../../src/core/ports/judgment-provider.ts";
import type { AppLogger } from "../../src/core/ports/logger.ts";
import type {
  ArticleSnapshotInput,
  RetrievalRepository,
  ScoredSnapshot,
  SnapshotRecord,
} from "../../src/core/ports/retrieval-repository.ts";
import type {
  AuditEventRecord,
  WorkflowAuditRepository,
  WorkflowRepository,
  WorkflowRunSummary,
  WorkflowTransitionRecord,
} from "../../src/core/ports/workflow-repository.ts";
import type { Article, Comment, Tag, User } from "../../src/core/models.ts";
import type { Pagination } from "../../src/core/policies/pagination.ts";
import { ArticleManagementUseCases } from "../../src/core/use-cases/article-management.ts";
import { DiscoveryUseCases } from "../../src/core/use-cases/discovery.ts";
import { DraftingUseCases } from "../../src/core/use-cases/drafting.ts";
import { RetrievalUseCases } from "../../src/core/use-cases/retrieval.ts";
import { WorkflowEngine } from "../../src/core/use-cases/workflow-engine.ts";
import type { AuthorResolver } from "../../src/rest/auth.ts";
import type { AppDependencies } from "../../src/rest/compose.ts";
import { buildRestRouter } from "../../src/rest/routes.ts";

export const logger: AppLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const nullEmbeddings: EmbeddingProvider = {
  model: "none",
  dimensions: 0,
  async embed(): Promise<readonly Embedding[]> {
    return [];
  },
};

const nullGeneration: GenerationProvider = {
  model: "none",
  async generate(): Promise<string> {
    throw new Error("no provider");
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

const noopAudit: AuditLogger = { async record(): Promise<void> {} };

class FakeForemClient implements ForemClient {
  async listArticles(
    _q: ListArticlesQuery,
    _c: ForemRequestContext,
  ): Promise<readonly Article[]> {
    return [article()];
  }
  async getArticle(
    _q: GetArticleQuery,
    _c: ForemRequestContext,
  ): Promise<Article> {
    return article();
  }
  async getUser(_q: GetUserQuery, _c: ForemRequestContext): Promise<User> {
    return {
      id: 1,
      username: "ada",
      name: null,
      summary: null,
      twitter_username: null,
      github_username: null,
      location: null,
      website_url: null,
      joined_at: null,
    };
  }
  async listTags(
    _q: Pagination,
    _c: ForemRequestContext,
  ): Promise<readonly Tag[]> {
    return [];
  }
  async listComments(
    _id: number,
    _c: ForemRequestContext,
  ): Promise<readonly Comment[]> {
    return [];
  }
  async searchArticles(
    _q: SearchArticlesQuery,
    _c: ForemRequestContext,
  ): Promise<readonly Article[]> {
    return [article()];
  }
}

function article(): Article {
  return {
    id: 42,
    title: "Angular signals",
    description: null,
    slug: "signals",
    path: "/ada/signals",
    url: "https://dev.to/ada/signals",
    published_at: "2026-09-01T00:00:00Z",
    readable_publish_date: "Sep 1",
    tag_list: ["angular"],
    comments_count: 1,
    public_reactions_count: 2,
    user: { user_id: 1, username: "ada", name: null },
  };
}

class FakeForemPublisher implements ForemPublisher {
  async listMyArticles(
    _i: { state: ForemArticleState },
    _c: ForemRequestContext,
  ): Promise<readonly ForemArticleRecord[]> {
    return [];
  }
  async createArticleDraft(
    _i: DraftArticleInput,
    _c: ForemRequestContext,
  ): Promise<ForemArticleRecord> {
    return {
      id: 99,
      title: "x",
      url: "u",
      published: false,
      publishedAt: null,
    };
  }
  async updateArticleDraft(
    _i: UpdateDraftArticleInput,
    _c: ForemRequestContext,
  ): Promise<ForemArticleRecord> {
    return {
      id: 99,
      title: "x",
      url: "u",
      published: false,
      publishedAt: null,
    };
  }
  async publishArticle(
    _i: { id: number },
    _c: ForemRequestContext,
  ): Promise<ForemArticleRecord> {
    return {
      id: 99,
      title: "x",
      url: "u",
      published: true,
      publishedAt: "2026-09-01T00:00:00Z",
    };
  }
}

class InMemoryArticles implements ArticleRepository {
  drafts = new Map<string, DraftSummary>();
  versions = new Map<string, DraftVersionSummary>();
  approvals: ApprovalSummary[] = [];
  private d = 1;
  private v = 1;

  async getCapabilities(_authorId: string): Promise<readonly Capability[]> {
    return ["READ", "DRAFT_WRITE", "PUBLISH"];
  }
  async listDrafts(authorId: string): Promise<readonly DraftSummary[]> {
    return [...this.drafts.values()].filter((d) => d.authorId === authorId);
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
    const draftId = `d${this.d++}`;
    const versionId = `v${this.v++}`;
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
    if (draft === undefined) throw new Error("missing");
    const versionId = `v${this.v++}`;
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

class InMemoryRetrieval implements RetrievalRepository {
  snapshots = new Map<string, SnapshotRecord>();
  private next = 1;
  async upsertSnapshot(input: ArticleSnapshotInput): Promise<SnapshotRecord> {
    const id = `s${this.next++}`;
    const record: SnapshotRecord = {
      id,
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
    this.snapshots.set(id, record);
    return record;
  }
  async storeEmbedding(): Promise<void> {}
  async hasEmbeddings(): Promise<boolean> {
    return false;
  }
  async searchByText(): Promise<readonly ScoredSnapshot[]> {
    return [];
  }
  async searchByVector(): Promise<readonly ScoredSnapshot[]> {
    return [];
  }
  async listSnapshots(): Promise<readonly SnapshotRecord[]> {
    return [...this.snapshots.values()];
  }
  async listSnapshotsByAuthor(): Promise<readonly SnapshotRecord[]> {
    return [...this.snapshots.values()];
  }
  async countSnapshots(): Promise<number> {
    return this.snapshots.size;
  }
}

class InMemoryWorkflows implements WorkflowRepository, WorkflowAuditRepository {
  async startRun(): Promise<WorkflowRunSummary> {
    throw new Error("not implemented");
  }
  async getRun(): Promise<WorkflowRunSummary | undefined> {
    return undefined;
  }
  async findRunByIdempotencyKey(): Promise<WorkflowRunSummary | undefined> {
    return undefined;
  }
  async listResumableRuns(): Promise<readonly WorkflowRunSummary[]> {
    return [];
  }
  async claimRun() {
    return { claimed: false, reason: "not-found" } as const;
  }
  async releaseLease(): Promise<void> {}
  async completeRun(): Promise<WorkflowRunSummary> {
    throw new Error("not implemented");
  }
  async failRun(): Promise<WorkflowRunSummary> {
    throw new Error("not implemented");
  }
  async recordTransition(): Promise<WorkflowTransitionRecord> {
    throw new Error("not implemented");
  }
  async listTransitions(): Promise<readonly WorkflowTransitionRecord[]> {
    return [];
  }
  async recordNoPublishReport(input: {
    authorId: string;
    runId: string;
    correlationId: string;
    topic: string;
    reason: "LOW_VALUE" | "DUPLICATE" | "INSUFFICIENT_EVIDENCE" | "POLICY";
  }) {
    return {
      id: "np1",
      runId: input.runId,
      topic: input.topic,
      reason: input.reason,
      createdAtMs: Date.now(),
    };
  }
  async listNoPublishReports() {
    return [];
  }
  async listForDraft(): Promise<readonly AuditEventRecord[]> {
    return [];
  }
}

export interface TestDeps {
  readonly deps: AppDependencies;
  readonly articles: InMemoryArticles;
  readonly authorResolver: AuthorResolver;
  start(): Promise<{ baseUrl: string; close(): Promise<void> }>;
}

export function buildTestDeps(): TestDeps {
  const articles = new InMemoryArticles();
  const retrieval = new InMemoryRetrieval();
  const workflows = new InMemoryWorkflows();

  const authorResolver: AuthorResolver = async (token) =>
    token === "valid-token" ? "author-1" : undefined;

  const discovery = new DiscoveryUseCases(new FakeForemClient(), logger);
  const articleUseCases = new ArticleManagementUseCases(
    articles,
    new FakeForemPublisher(),
    logger,
  );
  const retrievalUseCases = new RetrievalUseCases(
    retrieval,
    nullEmbeddings,
    nullJudgments,
    logger,
  );
  const drafting = new DraftingUseCases(nullGeneration, articles, logger);
  const engine = new WorkflowEngine({
    workflows,
    articles,
    audit: noopAudit,
    auditQuery: workflows,
    logger,
    workerId: "test-worker",
  });

  const deps: AppDependencies = {
    prisma: {} as never,
    redis: undefined,
    discovery,
    articles: articleUseCases,
    retrieval: retrievalUseCases,
    drafting,
    workflows: engine,
    repository: articles,
    retrievalRepository: retrieval,
    workflowRepository: workflows,
    audit: noopAudit,
    authorResolver,
    logger,
  };

  return {
    deps,
    articles,
    authorResolver,
    async start() {
      const app = express();
      app.use(express.json());
      app.use("/v1", buildRestRouter(deps));
      const server = app.listen(0);
      await new Promise<void>((resolve) => server.once("listening", resolve));
      const address = server.address();
      const port =
        typeof address === "object" && address !== null ? address.port : 0;
      return {
        baseUrl: `http://127.0.0.1:${port}/v1`,
        async close() {
          await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          );
        },
      };
    },
  };
}
