import { describe, expect, it } from "vitest";
import type {
  NotificationEvent,
  NotificationProvider,
} from "../src/core/ports/notification-provider.ts";
import type { SchedulingRepository } from "../src/core/ports/scheduling-repository.ts";
import type { WorkflowRunSummary } from "../src/core/ports/workflow-repository.ts";
import type { AppLogger } from "../src/core/ports/logger.ts";
import { SchedulingUseCases } from "../src/core/use-cases/scheduling.ts";
import {
  cadenceMs,
  isDue,
  DEFAULT_CADENCE,
} from "../src/core/policies/cadence.ts";
import type { WorkflowEngine } from "../src/core/use-cases/workflow-engine.ts";

const logger: AppLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

class RecordingNotifications implements NotificationProvider {
  readonly channel = "recording";
  readonly events: { authorId: string; event: NotificationEvent }[] = [];
  async notify(authorId: string, event: NotificationEvent): Promise<void> {
    this.events.push({ authorId, event });
  }
}

class InMemoryScheduling implements SchedulingRepository {
  topics = new Map<string, string[]>();
  cadence = "weekly";
  lastRunAtMs: number | null = null;

  async getTopics(authorId: string): Promise<readonly string[]> {
    return this.topics.get(authorId) ?? [];
  }
  async setTopics(authorId: string, topics: readonly string[]): Promise<void> {
    this.topics.set(authorId, [...topics]);
  }
  async getCadence(): Promise<string> {
    return this.cadence;
  }
  async getLastRunAtMs(): Promise<number | null> {
    return this.lastRunAtMs;
  }
}

function stubEngine(overrides: {
  started: WorkflowRunSummary[];
  noPublishCalls: { authorId: string; actor: string }[];
}): WorkflowEngine {
  return {
    async start(authorId: string, input: { idempotencyKey: string }) {
      const existing = overrides.started.find(
        (run) => run.idempotencyKey === input.idempotencyKey,
      );
      if (existing !== undefined) {
        return existing;
      }
      const run: WorkflowRunSummary = {
        id: `run-${overrides.started.length + 1}`,
        authorId,
        draftId: null,
        idempotencyKey: input.idempotencyKey,
        state: "RESEARCHING",
        attempt: 0,
        leaseUntilMs: null,
        leasedBy: null,
        lastError: null,
        result: null,
        startedAtMs: Date.now(),
        updatedAtMs: Date.now(),
      };
      overrides.started.push(run);
      return run;
    },
    async recordNoPublish(authorId: string, input: { actor: string }) {
      overrides.noPublishCalls.push({ authorId, actor: input.actor });
    },
  } as unknown as WorkflowEngine;
}

describe("cadence policy", () => {
  it("maps cadence strings to intervals", () => {
    expect(cadenceMs("daily")).toBe(24 * 60 * 60 * 1000);
    expect(cadenceMs("weekly")).toBe(7 * 24 * 60 * 60 * 1000);
    expect(cadenceMs("unknown")).toBe(cadenceMs(DEFAULT_CADENCE));
  });

  it("considers a never-run author due", () => {
    expect(isDue(null, 0, "weekly")).toBe(true);
  });

  it("defers when the last run is within the cadence window", () => {
    expect(isDue(1_000, 1_000 + cadenceMs("weekly") - 1, "weekly")).toBe(false);
    expect(isDue(1_000, 1_000 + cadenceMs("weekly"), "weekly")).toBe(true);
  });
});

describe("scheduling use cases", () => {
  it("triggers idempotently for a repeated scheduler call", async () => {
    const started: WorkflowRunSummary[] = [];
    const engine = stubEngine({ started, noPublishCalls: [] });
    const useCases = new SchedulingUseCases(
      engine,
      new InMemoryScheduling(),
      new RecordingNotifications(),
      logger,
    );

    const first = await useCases.triggerRun("author-1", {
      correlationId: "c1",
      idempotencyKey: "key-1",
    });
    const second = await useCases.triggerRun("author-1", {
      correlationId: "c2",
      idempotencyKey: "key-1",
    });

    expect(second.id).toBe(first.id);
    expect(started).toHaveLength(1);
  });

  it("records a no-topic outcome with the scheduler actor", async () => {
    const noPublishCalls: { authorId: string; actor: string }[] = [];
    const engine = stubEngine({ started: [], noPublishCalls });
    const useCases = new SchedulingUseCases(
      engine,
      new InMemoryScheduling(),
      new RecordingNotifications(),
      logger,
    );

    await useCases.recordNoTopic("author-1", {
      runId: "run-1",
      correlationId: "c1",
      topic: "angular",
      reason: "DUPLICATE",
    });

    expect(noPublishCalls).toEqual([
      { authorId: "author-1", actor: "SCHEDULER" },
    ]);
  });

  it("manages configured topics", async () => {
    const repo = new InMemoryScheduling();
    const useCases = new SchedulingUseCases(
      stubEngine({ started: [], noPublishCalls: [] }),
      repo,
      new RecordingNotifications(),
      logger,
    );

    await useCases.setTopics("author-1", ["angular", "aws"]);
    expect(await useCases.getTopics("author-1")).toEqual(["angular", "aws"]);
  });

  it("emits notifications without authorizing actions", async () => {
    const notifications = new RecordingNotifications();
    const useCases = new SchedulingUseCases(
      stubEngine({ started: [], noPublishCalls: [] }),
      new InMemoryScheduling(),
      notifications,
      logger,
    );

    await useCases.notifyDraftReady("author-1", "d1", "Signals");
    await useCases.notifyPublishSuccess("author-1", "d1", "https://dev.to/x");
    await useCases.notifyPublishFailure("author-1", "d1", "upstream error");

    expect(notifications.events.map((e) => e.event.type)).toEqual([
      "draft_ready",
      "publish_success",
      "publish_failure",
    ]);
  });

  it("reports scheduling due based on cadence and last run", async () => {
    const repo = new InMemoryScheduling();
    const useCases = new SchedulingUseCases(
      stubEngine({ started: [], noPublishCalls: [] }),
      repo,
      new RecordingNotifications(),
      logger,
      () => 1_000_000,
    );

    expect(await useCases.shouldRun("author-1")).toBe(true);

    repo.lastRunAtMs = 1_000_000;
    expect(await useCases.shouldRun("author-1")).toBe(false);
  });
});
