import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../src/adapters/persistence/prisma-client.ts";
import { PrismaRetrievalRepository } from "../src/adapters/persistence/prisma-retrieval-repository.ts";
import type {
  Embedding,
  EmbeddingProvider,
} from "../src/core/ports/embedding-provider.ts";
import type { AppLogger } from "../src/core/ports/logger.ts";
import { RetrievalUseCases } from "../src/core/use-cases/retrieval.ts";
import { NullJudgmentProvider } from "../src/adapters/judgment/typesafe.ts";

import { DATABASE_URL } from "./helpers/infrastructure.ts";

const logger: AppLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

let prisma: ReturnType<typeof createPrismaClient>;
const createdForemIds: number[] = [];

beforeAll(() => {
  prisma = createPrismaClient({ connectionString: DATABASE_URL });
});

afterAll(async () => {
  await prisma.embedding.deleteMany({});
  if (createdForemIds.length > 0) {
    await prisma.articleSnapshot.deleteMany({
      where: { foremArticleId: { in: createdForemIds } },
    });
  }
  await prisma.$disconnect();
});

/** A 1536-dim one-hot vector on a topic axis, to control cosine ordering. */
function axisVector(hotIndex: number): number[] {
  const vector = new Array<number>(1536).fill(0);
  vector[hotIndex] = 1;
  return vector;
}

/** Embeddings that map topic words to orthogonal axes for deterministic order. */
const axisEmbeddings: EmbeddingProvider = {
  model: "axis-test",
  dimensions: 1536,
  async embed(texts: readonly string[]): Promise<readonly Embedding[]> {
    return texts.map((text) => {
      if (text.toLowerCase().includes("signals")) return axisVector(0);
      if (text.toLowerCase().includes("ssr")) return axisVector(1);
      if (text.toLowerCase().includes("deploy")) return axisVector(2);
      return axisVector(100);
    });
  },
};

function article(
  id: number,
  title: string,
  tags: string[],
): Parameters<RetrievalUseCases["ingest"]>[0][number] {
  return {
    foremArticleId: id,
    title,
    description: null,
    tagList: tags,
    commentsCount: 0,
    publicReactionsCount: 0,
    publishedAt: null,
    authorUsername: "ada",
  };
}

describe("retrieval integration against pgvector", () => {
  it("stores embeddings and ranks vector search by cosine similarity", async () => {
    const repository = new PrismaRetrievalRepository(prisma);
    const useCases = new RetrievalUseCases(
      repository,
      axisEmbeddings,
      new NullJudgmentProvider(),
      logger,
    );

    createdForemIds.push(91001, 91002, 91003);
    await useCases.ingest(
      [
        article(91001, "Angular SSR guide", ["angular", "ssr"]),
        article(91002, "Angular signals deep dive", ["angular", "signals"]),
        article(91003, "Deploying Angular apps", ["angular", "deploy"]),
      ],
      "corr-ingest",
    );

    expect(await repository.hasEmbeddings()).toBe(true);

    const results = await useCases.hybridSearch("signals", {}, "corr");
    expect(results[0]?.snapshot.title).toBe("Angular signals deep dive");
    expect(results[0]?.components.semantic).toBeGreaterThan(0.9);
  });

  it("falls back to full-text when no embeddings are stored", async () => {
    const repository = new PrismaRetrievalRepository(prisma);
    // A provider that produces no vectors, but the repository still has text.
    const useCases = new RetrievalUseCases(
      repository,
      {
        model: "none",
        dimensions: 0,
        async embed(): Promise<readonly Embedding[]> {
          return [];
        },
      },
      new NullJudgmentProvider(),
      logger,
    );

    createdForemIds.push(91004);
    await repository.upsertSnapshot(
      article(91004, "Kubernetes operator patterns", ["k8s"]),
    );

    const results = await useCases.hybridSearch("kubernetes", {}, "corr");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]?.snapshot.title).toBe("Kubernetes operator patterns");
  });

  it("idempotently upserts a snapshot and reuses its vector", async () => {
    const repository = new PrismaRetrievalRepository(prisma);
    createdForemIds.push(91005);
    const first = await repository.upsertSnapshot(
      article(91005, "Version one", ["a"]),
    );
    const second = await repository.upsertSnapshot({
      ...article(91005, "Version two", ["a", "b"]),
      authorId: "author-x",
    });
    expect(second.id).toBe(first.id);
    expect(second.title).toBe("Version two");
    expect(second.tagList).toEqual(["a", "b"]);
    expect(await repository.countSnapshots()).toBeGreaterThanOrEqual(1);
  });
});
