import type { PrismaClient } from "@prisma/client";
import type {
  ArticleSnapshotInput,
  RetrievalRepository,
  ScoredSnapshot,
  SnapshotRecord,
} from "../../core/ports/retrieval-repository.ts";
import { randomUUID } from "node:crypto";

type SnapshotRow = {
  id: string;
  authorId: string | null;
  foremArticleId: number;
  title: string;
  description: string | null;
  tagList: string[];
  commentsCount: number;
  publicReactionsCount: number;
  publishedAt: Date | null;
  authorUsername: string | null;
  observedAt: Date;
};

type ScoredRow = SnapshotRow & { score: number };

/**
 * Prisma-backed retrieval persistence. Vector store/search use raw SQL because
 * the `vector` column is `Unsupported` in Prisma; snapshot CRUD and full-text
 * search use typed Prisma calls and the existing GIN/HNSW indexes.
 */
export class PrismaRetrievalRepository implements RetrievalRepository {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async upsertSnapshot(input: ArticleSnapshotInput): Promise<SnapshotRecord> {
    const row = await this.prisma.articleSnapshot.upsert({
      where: { foremArticleId: input.foremArticleId },
      create: {
        foremArticleId: input.foremArticleId,
        title: input.title,
        description: input.description,
        tagList: [...input.tagList],
        commentsCount: input.commentsCount,
        publicReactionsCount: input.publicReactionsCount,
        publishedAt: input.publishedAt,
        authorUsername: input.authorUsername,
        authorId: input.authorId ?? null,
      },
      update: {
        title: input.title,
        description: input.description,
        tagList: [...input.tagList],
        commentsCount: input.commentsCount,
        publicReactionsCount: input.publicReactionsCount,
        publishedAt: input.publishedAt,
        authorUsername: input.authorUsername,
      },
    });
    return toSnapshotRecord(row);
  }

  async storeEmbedding(input: {
    readonly snapshotId: string;
    readonly vector: readonly number[];
    readonly model: string;
    readonly dimensions: number;
  }): Promise<void> {
    const vector = `[${input.vector.join(",")}]`;
    await this.prisma.$executeRaw`
      INSERT INTO "embeddings" ("id", "snapshotId", "model", "dimensions", "vector", "createdAt")
      VALUES (${randomUUID()}, ${input.snapshotId}, ${input.model}, ${input.dimensions}, ${vector}::vector, now())
      ON CONFLICT ("snapshotId") DO UPDATE
        SET "vector" = EXCLUDED."vector",
            "model" = EXCLUDED."model",
            "dimensions" = EXCLUDED."dimensions"
    `;
  }

  async hasEmbeddings(): Promise<boolean> {
    const count = await this.prisma.embedding.count();
    return count > 0;
  }

  async searchByText(
    query: string,
    limit: number,
  ): Promise<readonly ScoredSnapshot[]> {
    const rows = await this.prisma.$queryRaw<ScoredRow[]>`
      SELECT
        s."id",
        s."authorId",
        s."foremArticleId",
        s."title",
        s."description",
        s."tagList",
        s."commentsCount",
        s."publicReactionsCount",
        s."publishedAt",
        s."authorUsername",
        s."observedAt",
        ts_rank(
          to_tsvector('english', coalesce(s."title", '') || ' ' || coalesce(s."description", '')),
          websearch_to_tsquery('english', ${query})
        ) AS score
      FROM "article_snapshots" s
      WHERE to_tsvector('english', coalesce(s."title", '') || ' ' || coalesce(s."description", ''))
            @@ websearch_to_tsquery('english', ${query})
      ORDER BY score DESC
      LIMIT ${limit}
    `;
    return rows.map(toScoredSnapshot);
  }

  async searchByVector(
    vector: readonly number[],
    limit: number,
  ): Promise<readonly ScoredSnapshot[]> {
    const vectorLiteral = `[${vector.join(",")}]`;
    const rows = await this.prisma.$queryRaw<ScoredRow[]>`
      SELECT
        s."id",
        s."authorId",
        s."foremArticleId",
        s."title",
        s."description",
        s."tagList",
        s."commentsCount",
        s."publicReactionsCount",
        s."publishedAt",
        s."authorUsername",
        s."observedAt",
        (1 - (e."vector" <=> ${vectorLiteral}::vector)) AS score
      FROM "embeddings" e
      JOIN "article_snapshots" s ON s."id" = e."snapshotId"
      ORDER BY e."vector" <=> ${vectorLiteral}::vector
      LIMIT ${limit}
    `;
    return rows.map(toScoredSnapshot);
  }

  async listSnapshots(): Promise<readonly SnapshotRecord[]> {
    const rows = await this.prisma.articleSnapshot.findMany({
      orderBy: { observedAt: "desc" },
    });
    return rows.map(toSnapshotRecord);
  }

  async listSnapshotsByAuthor(
    authorId: string,
  ): Promise<readonly SnapshotRecord[]> {
    const rows = await this.prisma.articleSnapshot.findMany({
      where: { authorId },
      orderBy: { publishedAt: "desc" },
    });
    return rows.map(toSnapshotRecord);
  }

  async countSnapshots(): Promise<number> {
    return this.prisma.articleSnapshot.count();
  }
}

function toSnapshotRecord(row: SnapshotRow): SnapshotRecord {
  return {
    id: row.id,
    authorId: row.authorId,
    foremArticleId: row.foremArticleId,
    title: row.title,
    description: row.description,
    tagList: row.tagList,
    commentsCount: row.commentsCount,
    publicReactionsCount: row.publicReactionsCount,
    publishedAt: row.publishedAt,
    authorUsername: row.authorUsername,
    observedAt: row.observedAt,
  };
}

function toScoredSnapshot(row: ScoredRow): ScoredSnapshot {
  return {
    snapshot: toSnapshotRecord(row),
    score: Number(row.score),
  };
}
