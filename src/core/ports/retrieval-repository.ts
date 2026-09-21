/** Fields normalized from a Forem article for durable snapshot storage. */
export interface ArticleSnapshotInput {
  readonly foremArticleId: number;
  readonly title: string;
  readonly description: string | null;
  readonly tagList: readonly string[];
  readonly commentsCount: number;
  readonly publicReactionsCount: number;
  readonly publishedAt: Date | null;
  readonly authorUsername: string | null;
  readonly authorId?: string;
}

/** A persisted snapshot with its observation metadata. */
export interface SnapshotRecord {
  readonly id: string;
  readonly authorId: string | null;
  readonly foremArticleId: number;
  readonly title: string;
  readonly description: string | null;
  readonly tagList: readonly string[];
  readonly commentsCount: number;
  readonly publicReactionsCount: number;
  readonly publishedAt: Date | null;
  readonly authorUsername: string | null;
  readonly observedAt: Date;
}

/** A snapshot with a raw relevance score from one retrieval signal. */
export interface ScoredSnapshot {
  readonly snapshot: SnapshotRecord;
  readonly score: number;
}

/**
 * Durable retrieval persistence. Text search uses the existing GIN index;
 * vector search uses the pgvector HNSW index via raw SQL (the vector column is
 * `Unsupported` in Prisma).
 */
export interface RetrievalRepository {
  upsertSnapshot(input: ArticleSnapshotInput): Promise<SnapshotRecord>;
  storeEmbedding(input: {
    readonly snapshotId: string;
    readonly vector: readonly number[];
    readonly model: string;
    readonly dimensions: number;
  }): Promise<void>;
  hasEmbeddings(): Promise<boolean>;
  searchByText(
    query: string,
    limit: number,
  ): Promise<readonly ScoredSnapshot[]>;
  searchByVector(
    vector: readonly number[],
    limit: number,
  ): Promise<readonly ScoredSnapshot[]>;
  listSnapshots(): Promise<readonly SnapshotRecord[]>;
  listSnapshotsByAuthor(authorId: string): Promise<readonly SnapshotRecord[]>;
  countSnapshots(): Promise<number>;
}
