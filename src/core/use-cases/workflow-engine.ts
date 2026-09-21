import type {
  ArticleRepository,
  DraftState,
  DraftSummary,
} from "../ports/article-repository.ts";
import type { AuditLogger } from "../../adapters/audit/audit-log.ts";
import type { AppLogger } from "../ports/logger.ts";
import type {
  NoPublishReason,
  WorkflowAuditRepository,
  WorkflowRepository,
  WorkflowRunSummary,
} from "../ports/workflow-repository.ts";
import {
  assertPublishAuthority,
  assertTransition,
  canTransition,
  isTerminalState,
  type TransitionActor,
} from "../policies/lifecycle.ts";
import {
  LEASE_DURATION_MS,
  MAX_WORKFLOW_ATTEMPTS,
  backoffMs,
  hasAttemptsRemaining,
} from "../policies/scheduling.ts";
import { InvalidInputError } from "../../errors/api-errors.ts";

/**
 * A single unit of work for a claimed run. The engine owns lease acquisition,
 * transition validation, retries, and audit; the callback owns the actual
 * phase activity and reports the next state it wants.
 */
export interface WorkflowStep {
  /**
   * Callback invoked with the claimed run. It must return the state the run
   * should move to. Throwing is treated as a recoverable failure and retried
   * with bounded backoff until attempts are exhausted.
   */
  readonly execute: (run: WorkflowRunSummary) => Promise<WorkflowStepResult>;
}

export interface WorkflowStepResult {
  readonly to: DraftState;
  readonly actor: TransitionActor;
  readonly reason?: string;
  readonly result?: unknown;
}

export interface RunOutcome {
  readonly runId: string;
  readonly state: DraftState;
  readonly attempted: boolean;
  readonly reason?: "not-found" | "leased" | "terminal" | "attempts-exhausted";
}

/**
 * Durable, approval-aware workflow engine.
 *
 * Guarantees:
 *  - a run is only advanced while its lease is held, so duplicate execution
 *    across workers or after a restart is safe;
 *  - every state change is validated against the lifecycle table and written
 *    to the transition log plus the audit trail;
 *  - a scheduler actor can never drive a publishing transition.
 */
export class WorkflowEngine {
  private readonly workflows: WorkflowRepository;

  private readonly articles: ArticleRepository;

  private readonly audit: AuditLogger;

  private readonly auditQuery: WorkflowAuditRepository;

  private readonly logger: AppLogger;

  private readonly workerId: string;

  private readonly now: () => number;

  constructor(dependencies: {
    readonly workflows: WorkflowRepository;
    readonly articles: ArticleRepository;
    readonly audit: AuditLogger;
    readonly auditQuery: WorkflowAuditRepository;
    readonly logger: AppLogger;
    readonly workerId: string;
    readonly now?: () => number;
  }) {
    this.workflows = dependencies.workflows;
    this.articles = dependencies.articles;
    this.audit = dependencies.audit;
    this.auditQuery = dependencies.auditQuery;
    this.logger = dependencies.logger;
    this.workerId = dependencies.workerId;
    this.now = dependencies.now ?? Date.now;
  }

  async start(
    authorId: string,
    input: {
      readonly correlationId: string;
      readonly draftId?: string;
      readonly idempotencyKey?: string;
    },
  ): Promise<WorkflowRunSummary> {
    const run = await this.workflows.startRun({
      authorId,
      correlationId: input.correlationId,
      ...(input.draftId === undefined ? {} : { draftId: input.draftId }),
      ...(input.idempotencyKey === undefined
        ? {}
        : { idempotencyKey: input.idempotencyKey }),
    });
    await this.audit.record({
      authorId,
      actorType: "SYSTEM",
      correlationId: input.correlationId,
      tool: "workflow.start",
      input: { draftId: run.draftId, state: run.state },
      result: "started",
      resource: "workflow_run",
      resourceVersion: run.id,
      ...(run.draftId === null ? {} : { draftId: run.draftId }),
    });
    this.logger.info(
      { correlationId: input.correlationId, runId: run.id },
      "workflow.run.started",
    );
    return run;
  }

  /**
   * Attempt to advance a run exactly once. Returns without side effects when
   * the run is missing, already complete, or leased by another worker.
   */
  async advance(
    runId: string,
    step: WorkflowStep,
    correlationId: string,
  ): Promise<RunOutcome> {
    const nowMs = this.now();
    const claim = await this.workflows.claimRun({
      runId,
      workerId: this.workerId,
      leaseDurationMs: LEASE_DURATION_MS,
      nowMs,
    });

    if (!claim.claimed) {
      const current = await this.workflows.getRun(runId);
      return {
        runId,
        state: current?.state ?? "FAILED",
        attempted: false,
        reason: claim.reason,
      };
    }

    const { run } = claim;
    if (!hasAttemptsRemaining(run.attempt)) {
      await this.failRun(
        run,
        "Attempts exhausted before this step could run.",
        correlationId,
      );
      return {
        runId,
        state: "FAILED",
        attempted: false,
        reason: "attempts-exhausted",
      };
    }

    let outcome: WorkflowStepResult;
    try {
      outcome = await step.execute(run);
    } catch (error) {
      const message = safeErrorMessage(error);
      const attemptAfterFailure = run.attempt + 1;
      const retryAtMs = hasAttemptsRemaining(attemptAfterFailure)
        ? this.now() + backoffMs(attemptAfterFailure)
        : null;
      await this.failRun(run, message, correlationId, retryAtMs);
      this.logger.warn(
        { correlationId, runId: run.id, attempt: attemptAfterFailure },
        "workflow.run.failed",
      );
      return {
        runId: run.id,
        state: "FAILED",
        attempted: true,
        reason: retryAtMs === null ? "attempts-exhausted" : undefined,
      };
    }

    // A policy violation is not a recoverable step failure: the requested
    // transition is illegal, so the draft and run state must be left exactly
    // as they were. Release the lease and surface the rejection.
    let transition: ReturnType<typeof assertPublishAuthority>;
    try {
      transition = assertPublishAuthority(run.state, outcome.to, outcome.actor);
    } catch (error) {
      await this.releaseLease(run.id);
      await this.audit.record({
        authorId: run.authorId,
        actorType: outcome.actor,
        correlationId,
        tool: "workflow.transition.rejected",
        input: { runId: run.id, requested: outcome.to },
        result: "rejected",
        resource: "workflow_run",
        resourceVersion: run.id,
        ...(run.draftId === null ? {} : { draftId: run.draftId }),
      });
      this.logger.warn(
        { correlationId, runId: run.id, requested: outcome.to },
        "workflow.run.rejected",
      );
      throw error;
    }

    await this.workflows.recordTransition({
      runId: run.id,
      transition,
      actor: outcome.actor,
      correlationId,
      ...(outcome.reason === undefined ? {} : { reason: outcome.reason }),
      ...(run.draftId === null ? {} : { draftId: run.draftId }),
    });
    if (run.draftId !== null) {
      await this.articles.setDraftState(run.draftId, outcome.to);
    }
    const updated = await this.workflows.completeRun({
      runId: run.id,
      workerId: this.workerId,
      toState: outcome.to,
      actor: outcome.actor,
      correlationId,
      ...(outcome.reason === undefined ? {} : { reason: outcome.reason }),
      ...(outcome.result === undefined ? {} : { result: outcome.result }),
    });
    await this.audit.record({
      authorId: run.authorId,
      actorType: outcome.actor,
      correlationId,
      tool: "workflow.transition",
      input: {
        runId: run.id,
        ...(outcome.result === undefined
          ? {}
          : { resultSummary: outcome.result }),
      },
      result: `${transition.from}->${transition.to}`,
      resource: "workflow_run",
      resourceVersion: run.id,
      ...(run.draftId === null ? {} : { draftId: run.draftId }),
    });
    this.logger.info(
      {
        correlationId,
        runId: run.id,
        from: transition.from,
        to: transition.to,
      },
      "workflow.run.advanced",
    );
    return { runId: run.id, state: updated.state, attempted: true };
  }

  /**
   * Reclaim and advance every run whose lease has expired. This is the
   * restart-recovery entry point: a fresh worker can adopt work left behind.
   *
   * Each run is isolated: a policy rejection for one run (the step does not
   * apply to its current state) must not prevent recovery of the others.
   */
  async recoverAndAdvance(
    step: WorkflowStep,
    correlationId: string,
  ): Promise<readonly RunOutcome[]> {
    const resumable = await this.workflows.listResumableRuns(this.now());
    const outcomes: RunOutcome[] = [];
    for (const run of resumable) {
      try {
        outcomes.push(await this.advance(run.id, step, correlationId));
      } catch (error) {
        if (!(error instanceof InvalidInputError)) {
          throw error;
        }
        this.logger.warn(
          { correlationId, runId: run.id, state: run.state },
          "workflow.recovery.skipped",
        );
        outcomes.push({
          runId: run.id,
          state: run.state,
          attempted: false,
        });
      }
    }
    return outcomes;
  }

  /**
   * Record an intentional non-publish outcome (FR-043). The run moves to the
   * terminal NO_PUBLISH state and a durable report is stored.
   */
  async recordNoPublish(
    authorId: string,
    input: {
      readonly runId: string;
      readonly correlationId: string;
      readonly topic: string;
      readonly reason: NoPublishReason;
      readonly actor?: TransitionActor;
      readonly detail?: string;
    },
  ): Promise<void> {
    const run = await this.workflows.getRun(input.runId);
    if (run === undefined) {
      throw new InvalidInputError("Workflow run not found.");
    }
    if (run.authorId !== authorId) {
      throw new InvalidInputError("Workflow run belongs to another author.");
    }
    const actor = input.actor ?? "SCHEDULER";
    assertTransition(run.state, "NO_PUBLISH", actor);
    await this.workflows.recordNoPublishReport({
      authorId,
      runId: run.id,
      correlationId: input.correlationId,
      topic: input.topic,
      reason: input.reason,
    });
    if (run.draftId !== null) {
      await this.articles.setDraftState(run.draftId, "NO_PUBLISH");
    }
    await this.audit.record({
      authorId,
      actorType: actor,
      correlationId: input.correlationId,
      tool: "workflow.no_publish",
      input: {
        topic: input.topic,
        reason: input.reason,
        ...(input.detail === undefined ? {} : { detail: input.detail }),
      },
      result: "no-publish",
      resource: "workflow_run",
      resourceVersion: run.id,
      ...(run.draftId === null ? {} : { draftId: run.draftId }),
    });
  }

  /** Chronological audit trail for one draft (FR-073). */
  async auditHistory(
    draftId: string,
  ): Promise<Awaited<ReturnType<WorkflowAuditRepository["listForDraft"]>>> {
    return this.auditQuery.listForDraft(draftId);
  }

  /** Chronological transition history for one draft. */
  async transitionHistory(
    draftId: string,
  ): Promise<Awaited<ReturnType<WorkflowRepository["listTransitions"]>>> {
    return this.workflows.listTransitions(draftId);
  }

  /** Current lifecycle state of a draft, for callers that need a fresh read. */
  async draftState(draftId: string): Promise<DraftState | undefined> {
    const draft: DraftSummary | undefined =
      await this.articles.getDraft(draftId);
    return draft?.state;
  }

  /** Whether a transition is permitted, used by adapters for pre-checks. */
  can(from: DraftState, to: DraftState, actor: TransitionActor): boolean {
    return canTransition(from, to, actor) && !isTerminalState(from);
  }

  private async releaseLease(runId: string): Promise<void> {
    await this.workflows.releaseLease(runId, this.workerId);
  }

  private async failRun(
    run: WorkflowRunSummary,
    error: string,
    correlationId: string,
    retryAtMs: number | null = null,
  ): Promise<void> {
    await this.workflows.failRun({
      runId: run.id,
      workerId: this.workerId,
      actor: "SYSTEM",
      correlationId,
      error,
      retryAtMs:
        retryAtMs === null || run.attempt + 1 >= MAX_WORKFLOW_ATTEMPTS
          ? null
          : retryAtMs,
      nowMs: this.now(),
    });
    if (run.draftId !== null) {
      await this.articles.setDraftState(run.draftId, "FAILED");
    }
    await this.audit.record({
      authorId: run.authorId,
      actorType: "SYSTEM",
      correlationId,
      tool: "workflow.failure",
      input: { runId: run.id, error },
      result: "failed",
      resource: "workflow_run",
      resourceVersion: run.id,
      ...(run.draftId === null ? {} : { draftId: run.draftId }),
    });
  }
}

function safeErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  ) {
    // ApiError instances already carry a safe, stable public code.
    return (error as { code: string }).code;
  }
  if (error instanceof Error) {
    return error.name;
  }
  return "WorkflowStepFailed";
}
