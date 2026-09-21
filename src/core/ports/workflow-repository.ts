import type { DraftState } from "./article-repository.ts";
import type {
  TransitionActor,
  TransitionDefinition,
} from "../policies/lifecycle.ts";

/** A workflow run as consumed by the worker and audit surface. */
export interface WorkflowRunSummary {
  readonly id: string;
  readonly authorId: string;
  readonly draftId: string | null;
  readonly idempotencyKey: string | null;
  readonly state: DraftState;
  readonly attempt: number;
  readonly leaseUntilMs: number | null;
  readonly leasedBy: string | null;
  readonly lastError: string | null;
  readonly result: unknown;
  readonly startedAtMs: number;
  readonly updatedAtMs: number;
}

/** Persisted, ordered lifecycle transition record. */
export interface WorkflowTransitionRecord {
  readonly id: string;
  readonly runId: string;
  readonly draftId: string | null;
  readonly fromState: DraftState;
  readonly toState: DraftState;
  readonly actorType: TransitionActor;
  readonly correlationId: string;
  readonly reason: string | null;
  readonly occurredAtMs: number;
}

export interface StartRunInput {
  readonly authorId: string;
  readonly draftId?: string;
  readonly idempotencyKey?: string;
  readonly correlationId: string;
}

export interface ClaimRunInput {
  readonly runId: string;
  /** Worker identity used to scope the advisory lock and lease. */
  readonly workerId: string;
  readonly leaseDurationMs: number;
  readonly nowMs: number;
}

export interface CompleteRunInput {
  readonly runId: string;
  readonly workerId: string;
  readonly toState: DraftState;
  readonly actor: TransitionActor;
  readonly correlationId: string;
  readonly reason?: string;
  readonly result?: unknown;
}

export interface FailRunInput {
  readonly runId: string;
  readonly workerId: string;
  readonly actor: TransitionActor;
  readonly correlationId: string;
  readonly error: string;
  readonly retryAtMs: number | null;
  readonly nowMs: number;
}

export type ClaimOutcome =
  | { readonly claimed: true; readonly run: WorkflowRunSummary }
  | {
      readonly claimed: false;
      readonly reason: "not-found" | "leased" | "terminal";
    };

/** Reasons a scheduled run may intentionally produce no draft (FR-043). */
export const NO_PUBLISH_REASONS = [
  "LOW_VALUE",
  "DUPLICATE",
  "INSUFFICIENT_EVIDENCE",
  "POLICY",
] as const;

export type NoPublishReason = (typeof NO_PUBLISH_REASONS)[number];

/** A durable record of a scheduled run that intentionally produced nothing. */
export interface NoPublishReportInput {
  readonly authorId: string;
  readonly runId: string;
  readonly correlationId: string;
  readonly topic: string;
  readonly reason: NoPublishReason;
}

export interface NoPublishReport {
  readonly id: string;
  readonly runId: string;
  readonly topic: string;
  readonly reason: NoPublishReason;
  readonly createdAtMs: number;
}

export interface AuditEventRecord {
  readonly id: string;
  readonly authorId: string;
  readonly draftId: string | null;
  readonly actorType: string;
  readonly correlationId: string;
  readonly tool: string;
  readonly sanitizedInput: unknown;
  readonly result: string;
  readonly resource: string | null;
  readonly resourceVersion: string | null;
  readonly createdAtMs: number;
}

/**
 * Read side of the audit trail: a chronological, per-draft history of every
 * material event (FR-073). The write side reuses the shared `AuditLogger`.
 */
export interface WorkflowAuditRepository {
  listForDraft(draftId: string): Promise<readonly AuditEventRecord[]>;
}

/**
 * Durable workflow persistence. Implementations must make claim acquisition
 * atomic so two workers cannot hold the same lease, and must retain every
 * transition so history is reconstructable after a restart.
 */
export interface WorkflowRepository {
  startRun(input: StartRunInput): Promise<WorkflowRunSummary>;
  getRun(runId: string): Promise<WorkflowRunSummary | undefined>;
  findRunByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<WorkflowRunSummary | undefined>;
  listResumableRuns(nowMs: number): Promise<readonly WorkflowRunSummary[]>;
  claimRun(input: ClaimRunInput): Promise<ClaimOutcome>;
  releaseLease(runId: string, workerId: string): Promise<void>;
  completeRun(input: CompleteRunInput): Promise<WorkflowRunSummary>;
  failRun(input: FailRunInput): Promise<WorkflowRunSummary>;
  recordTransition(input: {
    runId: string;
    draftId?: string;
    transition: TransitionDefinition;
    actor: TransitionActor;
    correlationId: string;
    reason?: string;
  }): Promise<WorkflowTransitionRecord>;
  listTransitions(
    draftId: string,
  ): Promise<readonly WorkflowTransitionRecord[]>;
  recordNoPublishReport(input: NoPublishReportInput): Promise<NoPublishReport>;
  listNoPublishReports(authorId: string): Promise<readonly NoPublishReport[]>;
}
