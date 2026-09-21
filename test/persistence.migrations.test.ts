import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../src/adapters/persistence/prisma-client.ts";

import { DATABASE_URL } from "./helpers/infrastructure.ts";

const REQUIRED_TABLES = [
  "authors",
  "author_configs",
  "author_authorizations",
  "article_snapshots",
  "embeddings",
  "drafts",
  "draft_versions",
  "draft_snapshots",
  "approvals",
  "workflow_runs",
  "workflow_transitions",
  "no_publish_reports",
  "audit_events",
  "evaluations",
  "dashboard_sessions",
] as const;

let prisma: ReturnType<typeof createPrismaClient>;

beforeAll(() => {
  prisma = createPrismaClient({ connectionString: DATABASE_URL });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("prisma migrations", () => {
  it("initializes every required table from a fresh migration set", async () => {
    const rows = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
    `;
    const tableNames = rows.map((row) => row.table_name);

    for (const table of REQUIRED_TABLES) {
      expect(tableNames).toContain(table);
    }
  });

  it("enables the pgvector extension", async () => {
    const rows = await prisma.$queryRaw<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname = 'vector'
    `;
    expect(rows.map((row) => row.extname)).toContain("vector");
  });

  it("creates the HNSW vector index and the full-text index", async () => {
    const rows = await prisma.$queryRaw<
      { indexname: string; indexdef: string }[]
    >`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE tablename IN ('embeddings', 'article_snapshots')
    `;
    const definitions = rows
      .map((row) => row.indexdef.toLowerCase())
      .join("\n");

    expect(definitions).toContain("hnsw");
    expect(definitions).toContain("vector_cosine_ops");
    expect(definitions).toContain("gin");
  });

  it("stores embeddings in a 1536-dimension vector column", async () => {
    const rows = await prisma.$queryRaw<{ udt_name: string }[]>`
      SELECT udt_name FROM information_schema.columns
      WHERE table_name = 'embeddings' AND column_name = 'vector'
    `;
    expect(rows[0]?.udt_name).toBe("vector");
  });

  it("keeps approvals bound to an exact draft version and content hash", async () => {
    const rows = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'approvals'
    `;
    const columns = rows.map((row) => row.column_name);

    expect(columns).toContain("draftVersionId");
    expect(columns).toContain("contentHash");
    expect(columns).toContain("expiresAt");
  });

  it("persists workflow transitions and lease metadata for recovery", async () => {
    const transitionColumns = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'workflow_transitions'
    `;
    const transitionNames = transitionColumns.map((row) => row.column_name);
    for (const column of [
      "runId",
      "fromState",
      "toState",
      "actorType",
      "correlationId",
      "occurredAt",
    ]) {
      expect(transitionNames).toContain(column);
    }

    const runColumns = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'workflow_runs'
    `;
    const runNames = runColumns.map((row) => row.column_name);
    expect(runNames).toContain("leaseUntil");
    expect(runNames).toContain("leasedBy");
    expect(runNames).toContain("correlationId");
  });

  it("stores no-publish reports with a durable reason", async () => {
    const rows = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'no_publish_reports'
    `;
    const columns = rows.map((row) => row.column_name);
    expect(columns).toContain("runId");
    expect(columns).toContain("reason");
    expect(columns).toContain("topic");
  });
});
