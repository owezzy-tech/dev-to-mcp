import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuditLogger } from "../src/adapters/audit/audit-log.ts";
import { PrismaArticleRepository } from "../src/adapters/persistence/prisma-article-repository.ts";
import { createPrismaClient } from "../src/adapters/persistence/prisma-client.ts";
import { PrismaWorkflowRepository } from "../src/adapters/persistence/prisma-workflow-repository.ts";
import type { DraftState } from "../src/core/ports/article-repository.ts";
import type { AppLogger } from "../src/core/ports/logger.ts";
import { hashContent } from "../src/core/policies/content-hash.ts";
import { LEASE_DURATION_MS } from "../src/core/policies/scheduling.ts";
import { WorkflowEngine } from "../src/core/use-cases/workflow-engine.ts";
import { InvalidInputError } from "../src/errors/api-errors.ts";

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

async function newAuthor(): Promise<string> {
  const authorId = await createTestAuthor(prisma, [
    "READ",
    "DRAFT_WRITE",
    "PUBLISH",
  ]);
  createdAuthors.push(authorId);
  return authorId;
}

async function newDraft(authorId: string): Promise<string> {
  const repository = new PrismaArticleRepository(prisma);
  const { draft } = await repository.createDraftWithVersion({
    authorId,
    title: "Durable workflows",
    tags: ["mcp"],
    markdown: "body",
    contentHash: hashContent("body"),
    foremArticleId: 99,
  });
  return draft.id;
}

function makeEngine(workerId: string): WorkflowEngine {
  const workflows = new PrismaWorkflowRepository(prisma);
  return new WorkflowEngine({
    workflows,
    articles: new PrismaArticleRepository(prisma),
    audit: createAuditLogger(prisma),
    auditQuery: workflows,
    logger,
    workerId,
    now,
  });
}

async function setDraftState(draftId: string, state: DraftState) {
  await new PrismaArticleRepository(prisma).setDraftState(draftId, state);
}

describe("durable workflow engine", () => {
  it("advances a run through valid transitions and records them", async () => {
    const authorId = await newAuthor();
    const draftId = await newDraft(authorId);
    const engine = makeEngine("worker-a");

    const run = await engine.start(authorId, {
      correlationId: "corr-start",
      draftId,
    });
    expect(run.state).toBe("RESEARCHING");

    const outcome = await engine.advance(
      run.id,
      {
        execute: async () => ({
          to: "IDEA_READY",
          actor: "AGENT",
          result: { ideaCount: 3 },
        }),
      },
      "corr-advance",
    );

    expect(outcome.attempted).toBe(true);
    expect(outcome.state).toBe("IDEA_READY");
    expect(await engine.draftState(draftId)).toBe("IDEA_READY");

    const transitions = await engine.transitionHistory(draftId);
    expect(transitions.map((t) => `${t.fromState}->${t.toState}`)).toEqual([
      "RESEARCHING->IDEA_READY",
    ]);
    expect(transitions[0]?.actorType).toBe("AGENT");
    expect(transitions[0]?.correlationId).toBe("corr-advance");
  });

  it("rejects an illegal transition without mutating the run or draft", async () => {
    const authorId = await newAuthor();
    const draftId = await newDraft(authorId);
    const engine = makeEngine("worker-a");
    const run = await engine.start(authorId, {
      correlationId: "corr-start",
      draftId,
    });

    await expect(
      engine.advance(
        run.id,
        { execute: async () => ({ to: "PUBLISHED", actor: "AGENT" }) },
        "corr-illegal",
      ),
    ).rejects.toBeInstanceOf(InvalidInputError);

    const persisted = await new PrismaWorkflowRepository(prisma).getRun(run.id);
    // The run did not advance, did not consume a retry, and released its lease.
    expect(persisted?.state).toBe("RESEARCHING");
    expect(persisted?.leasedBy).toBeNull();
    expect(persisted?.attempt).toBe(0);
    expect(await engine.draftState(draftId)).toBe("DRAFTING");
  });

  it("cannot claim a run that another worker actively holds", async () => {
    const authorId = await newAuthor();
    const draftId = await newDraft(authorId);
    const first = makeEngine("worker-a");
    const second = makeEngine("worker-b");
    const run = await first.start(authorId, {
      correlationId: "corr-start",
      draftId,
    });

    let releases: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releases = resolve;
    });
    const held = first.advance(
      run.id,
      {
        execute: async () => {
          await gate;
          return { to: "IDEA_READY", actor: "AGENT" };
        },
      },
      "corr-hold",
    );

    // Give the first worker time to acquire the lease.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const blocked = await second.advance(
      run.id,
      { execute: async () => ({ to: "DRAFTING", actor: "AGENT" }) },
      "corr-blocked",
    );
    expect(blocked.attempted).toBe(false);
    expect(blocked.reason).toBe("leased");

    releases();
    await held;
  });

  it("recovers an expired lease left behind by a crashed worker", async () => {
    const authorId = await newAuthor();
    const draftId = await newDraft(authorId);
    const crashed = makeEngine("worker-a");
    const run = await crashed.start(authorId, {
      correlationId: "corr-start",
      draftId,
    });

    // Simulate a crash: lease acquired but never released.
    await prisma.workflowRun.update({
      where: { id: run.id },
      data: {
        leasedBy: "worker-a",
        leaseUntil: new Date(nowMs + LEASE_DURATION_MS),
      },
    });

    const fresh = makeEngine("worker-b");
    const early = await fresh.advance(
      run.id,
      { execute: async () => ({ to: "IDEA_READY", actor: "AGENT" }) },
      "corr-early",
    );
    expect(early.attempted).toBe(false);
    expect(early.reason).toBe("leased");

    nowMs += LEASE_DURATION_MS + 1;
    const recovered = await fresh.recoverAndAdvance(
      { execute: async () => ({ to: "IDEA_READY", actor: "AGENT" }) },
      "corr-recover",
    );
    const thisRun = recovered.find((outcome) => outcome.runId === run.id);
    expect(thisRun?.state).toBe("IDEA_READY");
    expect(await fresh.draftState(draftId)).toBe("IDEA_READY");
  });

  it("treats duplicate execution of a terminal run as a no-op", async () => {
    const authorId = await newAuthor();
    const draftId = await newDraft(authorId);
    const engine = makeEngine("worker-a");
    const run = await engine.start(authorId, {
      correlationId: "corr-start",
      draftId,
    });

    await engine.advance(
      run.id,
      { execute: async () => ({ to: "NO_PUBLISH", actor: "SCHEDULER" }) },
      "corr-first",
    );

    let executed = false;
    const replayed = await engine.advance(
      run.id,
      {
        execute: async () => {
          executed = true;
          return { to: "DRAFTING", actor: "AGENT" };
        },
      },
      "corr-replay",
    );
    expect(replayed.attempted).toBe(false);
    expect(replayed.reason).toBe("terminal");
    expect(executed).toBe(false);
  });

  it("applies bounded retries and eventually stops", async () => {
    const authorId = await newAuthor();
    const draftId = await newDraft(authorId);
    const engine = makeEngine("worker-a");
    const run = await engine.start(authorId, {
      correlationId: "corr-start",
      draftId,
    });

    for (let i = 0; i < 5; i += 1) {
      const outcome = await engine.advance(
        run.id,
        {
          execute: async () => {
            throw new Error("upstream exploded");
          },
        },
        `corr-fail-${i}`,
      );
      expect(outcome.state).toBe("FAILED");

      // Clear the backoff window so the next attempt can proceed immediately.
      await prisma.workflowRun.update({
        where: { id: run.id },
        data: { leaseUntil: null },
      });
    }

    const exhausted = await engine.advance(
      run.id,
      { execute: async () => ({ to: "IDEA_READY", actor: "AGENT" }) },
      "corr-exhausted",
    );
    expect(exhausted.attempted).toBe(false);
    expect(exhausted.reason).toBe("attempts-exhausted");
  });

  it("records a no-publish report with a durable reason", async () => {
    const authorId = await newAuthor();
    const draftId = await newDraft(authorId);
    const engine = makeEngine("worker-a");
    const run = await engine.start(authorId, {
      correlationId: "corr-start",
      draftId,
    });

    await engine.recordNoPublish(authorId, {
      runId: run.id,
      correlationId: "corr-nopublish",
      topic: "Angular signals",
      reason: "DUPLICATE",
      actor: "SCHEDULER",
      detail: "Too similar to a recent published article.",
    });

    const workflows = new PrismaWorkflowRepository(prisma);
    const reports = await workflows.listNoPublishReports(authorId);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.topic).toBe("Angular signals");
    expect(reports[0]?.reason).toBe("DUPLICATE");
    expect(await engine.draftState(draftId)).toBe("NO_PUBLISH");
  });

  it("keeps audit history chronological for a draft", async () => {
    const authorId = await newAuthor();
    const draftId = await newDraft(authorId);
    const engine = makeEngine("worker-a");
    const run = await engine.start(authorId, {
      correlationId: "corr-1",
      draftId,
    });
    await engine.advance(
      run.id,
      { execute: async () => ({ to: "IDEA_READY", actor: "AGENT" }) },
      "corr-2",
    );
    await engine.advance(
      run.id,
      { execute: async () => ({ to: "DRAFTING", actor: "AGENT" }) },
      "corr-3",
    );

    const history = await engine.auditHistory(draftId);
    expect(history.length).toBeGreaterThanOrEqual(3);
    const timestamps = history.map((event) => event.createdAtMs);
    expect([...timestamps].sort((a, b) => a - b)).toEqual(timestamps);
    expect(history.map((event) => event.correlationId)).toEqual(
      expect.arrayContaining(["corr-1", "corr-2", "corr-3"]),
    );
  });

  it("redacts secrets in persisted audit input", async () => {
    const authorId = await newAuthor();
    const draftId = await newDraft(authorId);
    const engine = makeEngine("worker-a");
    const run = await engine.start(authorId, {
      correlationId: "corr-secret",
      draftId,
    });

    await engine.advance(
      run.id,
      {
        execute: async () => ({
          to: "IDEA_READY",
          actor: "AGENT",
          result: { apiKey: "super-secret", note: "ok" },
        }),
      },
      "corr-secret",
    );

    const history = await engine.auditHistory(draftId);
    const serialized = JSON.stringify(history);
    expect(serialized).not.toContain("super-secret");
    expect(serialized).toContain("[REDACTED]");
    expect(serialized).toContain("corr-secret");
  });

  it("keeps a scheduler from driving a publishing transition", async () => {
    const authorId = await newAuthor();
    const draftId = await newDraft(authorId);
    await setDraftState(draftId, "APPROVED");
    const engine = makeEngine("worker-a");
    const run = await engine.start(authorId, {
      correlationId: "corr-start",
      draftId,
    });
    // Move the run to APPROVED through the lifecycle before the scheduler tries.
    await prisma.workflowRun.update({
      where: { id: run.id },
      data: { state: "APPROVED" },
    });

    await expect(
      engine.advance(
        run.id,
        {
          execute: async () => ({
            to: "PUBLISHING" as const,
            actor: "SCHEDULER" as const,
          }),
        },
        "corr-scheduler",
      ),
    ).rejects.toBeInstanceOf(InvalidInputError);

    const persisted = await new PrismaWorkflowRepository(prisma).getRun(run.id);
    expect(persisted?.state).toBe("APPROVED");
    expect(persisted?.leasedBy).toBeNull();
    expect(persisted?.attempt).toBe(0);
    expect(await engine.draftState(draftId)).toBe("APPROVED");
  });

  it("refuses a no-publish report for another author's run", async () => {
    const owner = await newAuthor();
    const intruder = await newAuthor();
    const draftId = await newDraft(owner);
    const engine = makeEngine("worker-a");
    const run = await engine.start(owner, {
      correlationId: "corr-start",
      draftId,
    });

    await expect(
      engine.recordNoPublish(intruder, {
        runId: run.id,
        correlationId: "corr-intruder",
        topic: "anything",
        reason: "LOW_VALUE",
      }),
    ).rejects.toBeInstanceOf(InvalidInputError);
  });
});
