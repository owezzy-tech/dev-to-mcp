import type { AppLogger } from "../ports/logger.ts";
import type {
  NotificationEvent,
  NotificationProvider,
} from "../ports/notification-provider.ts";
import type { SchedulingRepository } from "../ports/scheduling-repository.ts";
import type { WorkflowEngine } from "./workflow-engine.ts";
import type { WorkflowRunSummary } from "../ports/workflow-repository.ts";
import { isDue } from "../policies/cadence.ts";

export interface TriggerRunInput {
  readonly correlationId: string;
  readonly idempotencyKey: string;
}

export interface NoTopicInput {
  readonly runId: string;
  readonly correlationId: string;
  readonly topic: string;
  readonly reason:
    "LOW_VALUE" | "DUPLICATE" | "INSUFFICIENT_EVIDENCE" | "POLICY";
}

/**
 * Scheduling and notification orchestration (FR-040..FR-044).
 *
 * A scheduler may trigger research and draft preparation through the durable
 * workflow engine, but it operates as the `SCHEDULER` actor, which the
 * lifecycle table bars from every publishing transition (FR-041). Notifications
 * are informational and never authorize an action.
 */
export class SchedulingUseCases {
  private readonly workflows: WorkflowEngine;

  private readonly repository: SchedulingRepository;

  private readonly notifications: NotificationProvider;

  private readonly logger: AppLogger;

  private readonly now: () => number;

  constructor(
    workflows: WorkflowEngine,
    repository: SchedulingRepository,
    notifications: NotificationProvider,
    logger: AppLogger,
    now: () => number = Date.now,
  ) {
    this.workflows = workflows;
    this.repository = repository;
    this.notifications = notifications;
    this.logger = logger;
    this.now = now;
  }

  /**
   * Trigger a scheduled research run. Idempotent: the same idempotency key
   * returns the same run, so duplicate scheduler invocations are safe.
   */
  async triggerRun(
    authorId: string,
    input: TriggerRunInput,
  ): Promise<WorkflowRunSummary> {
    const run = await this.workflows.start(authorId, {
      correlationId: input.correlationId,
      idempotencyKey: input.idempotencyKey,
    });
    this.logger.info(
      { correlationId: input.correlationId, authorId, runId: run.id },
      "scheduling.triggered",
    );
    return run;
  }

  /** Whether the author is due for another scheduled run. */
  async shouldRun(authorId: string): Promise<boolean> {
    const lastRunAtMs = await this.repository.getLastRunAtMs(authorId);
    const cadence = await this.repository.getCadence(authorId);
    return isDue(lastRunAtMs, this.now(), cadence);
  }

  async getTopics(authorId: string): Promise<readonly string[]> {
    return this.repository.getTopics(authorId);
  }

  async setTopics(authorId: string, topics: readonly string[]): Promise<void> {
    await this.repository.setTopics(authorId, topics);
  }

  /** Record a no-topic outcome for a scheduled run (FR-043). */
  async recordNoTopic(authorId: string, input: NoTopicInput): Promise<void> {
    await this.workflows.recordNoPublish(authorId, {
      runId: input.runId,
      correlationId: input.correlationId,
      topic: input.topic,
      reason: input.reason,
      actor: "SCHEDULER",
    });
  }

  async notifyDraftReady(
    authorId: string,
    draftId: string,
    title: string,
  ): Promise<void> {
    await this.emit(authorId, { type: "draft_ready", draftId, title });
  }

  async notifyPublishSuccess(
    authorId: string,
    draftId: string,
    url: string,
  ): Promise<void> {
    await this.emit(authorId, { type: "publish_success", draftId, url });
  }

  async notifyPublishFailure(
    authorId: string,
    draftId: string,
    reason: string,
  ): Promise<void> {
    await this.emit(authorId, { type: "publish_failure", draftId, reason });
  }

  private async emit(
    authorId: string,
    event: NotificationEvent,
  ): Promise<void> {
    await this.notifications.notify(authorId, event);
    this.logger.debug(
      { authorId, event: event.type, channel: this.notifications.channel },
      "scheduling.notified",
    );
  }
}
