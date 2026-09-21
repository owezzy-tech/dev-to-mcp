import type { Prisma, PrismaClient } from "@prisma/client";
import { NoPublishReason as PrismaNoPublishReason } from "@prisma/client";
import type { DraftState } from "../../core/ports/article-repository.ts";
import type {
  AuditEventRecord,
  ClaimOutcome,
  ClaimRunInput,
  CompleteRunInput,
  FailRunInput,
  NoPublishReason,
  NoPublishReport,
  NoPublishReportInput,
  StartRunInput,
  WorkflowAuditRepository,
  WorkflowRepository,
  WorkflowRunSummary,
  WorkflowTransitionRecord,
} from "../../core/ports/workflow-repository.ts";
import type {
  TransitionActor,
  TransitionDefinition,
} from "../../core/policies/lifecycle.ts";
import { isTerminalState } from "../../core/policies/lifecycle.ts";

/** States that may still be advanced by a worker. */
const NON_TERMINAL_CLAIMABLE: readonly DraftState[] = [
  "RESEARCHING",
  "IDEA_READY",
  "DRAFTING",
  "DRAFT_READY",
  "AWAITING_APPROVAL",
  "APPROVED",
  "PUBLISHING",
  "REJECTED",
  "FAILED",
];

type RunRow = {
  id: string;
  authorId: string;
  draftId: string | null;
  idempotencyKey: string | null;
  state: string;
  attempt: number;
  leaseUntil: Date | null;
  leasedBy: string | null;
  correlationId: string | null;
  lastError: string | null;
  result: unknown;
  startedAt: Date;
  updatedAt: Date;
};

function toRunSummary(row: RunRow): WorkflowRunSummary {
  return {
    id: row.id,
    authorId: row.authorId,
    draftId: row.draftId,
    idempotencyKey: row.idempotencyKey,
    state: row.state as DraftState,
    attempt: row.attempt,
    leaseUntilMs: row.leaseUntil?.getTime() ?? null,
    leasedBy: row.leasedBy,
    lastError: row.lastError,
    result: row.result,
    startedAtMs: row.startedAt.getTime(),
    updatedAtMs: row.updatedAt.getTime(),
  };
}

export class PrismaWorkflowRepository
  implements WorkflowRepository, WorkflowAuditRepository
{
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async startRun(input: StartRunInput): Promise<WorkflowRunSummary> {
    if (input.idempotencyKey !== undefined) {
      const existing = await this.findRunByIdempotencyKey(input.idempotencyKey);
      if (existing !== undefined) {
        return existing;
      }
    }
    const row = await this.prisma.workflowRun.create({
      data: {
        authorId: input.authorId,
        draftId: input.draftId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        correlationId: input.correlationId,
        state: "RESEARCHING",
      },
    });
    return toRunSummary(row);
  }

  async getRun(runId: string): Promise<WorkflowRunSummary | undefined> {
    const row = await this.prisma.workflowRun.findUnique({
      where: { id: runId },
    });
    return row === null ? undefined : toRunSummary(row);
  }

  async findRunByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<WorkflowRunSummary | undefined> {
    const row = await this.prisma.workflowRun.findUnique({
      where: { idempotencyKey },
    });
    return row === null ? undefined : toRunSummary(row);
  }

  async listResumableRuns(
    nowMs: number,
  ): Promise<readonly WorkflowRunSummary[]> {
    const rows = await this.prisma.workflowRun.findMany({
      where: {
        state: { in: [...NON_TERMINAL_CLAIMABLE] },
        OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date(nowMs) } }],
      },
      orderBy: { startedAt: "asc" },
    });
    return rows.map(toRunSummary);
  }

  /**
   * Atomically acquire the lease for a run. The conditional update guarantees
   * only one writer transitions the row, and the Postgres advisory lock held
   * for the transaction prevents a competing worker from interleaving under a
   * different connection.
   */
  async claimRun(input: ClaimRunInput): Promise<ClaimOutcome> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.runId}))`;

      const existing = await tx.workflowRun.findUnique({
        where: { id: input.runId },
      });
      if (existing === null) {
        return { claimed: false, reason: "not-found" } as const;
      }
      if (isTerminalState(existing.state as DraftState)) {
        return { claimed: false, reason: "terminal" } as const;
      }
      if (
        existing.leaseUntil !== null &&
        existing.leaseUntil.getTime() > input.nowMs &&
        existing.leasedBy !== input.workerId
      ) {
        return { claimed: false, reason: "leased" } as const;
      }

      const updated = await tx.workflowRun.update({
        where: {
          id: input.runId,
          leaseUntil: existing.leaseUntil,
          state: existing.state,
        },
        data: {
          leasedBy: input.workerId,
          leaseUntil: new Date(input.nowMs + input.leaseDurationMs),
        },
      });
      return { claimed: true, run: toRunSummary(updated) } as const;
    });
  }

  async releaseLease(runId: string, workerId: string): Promise<void> {
    await this.prisma.workflowRun.updateMany({
      where: { id: runId, leasedBy: workerId },
      data: { leasedBy: null, leaseUntil: null },
    });
  }

  async completeRun(input: CompleteRunInput): Promise<WorkflowRunSummary> {
    const row = await this.prisma.workflowRun.update({
      where: { id: input.runId },
      data: {
        state: input.toState,
        leasedBy: null,
        leaseUntil: null,
        lastError: null,
        ...(input.result === undefined
          ? {}
          : { result: input.result as Prisma.InputJsonValue }),
      },
    });
    return toRunSummary(row);
  }

  async failRun(input: FailRunInput): Promise<WorkflowRunSummary> {
    const retryAtMs = input.retryAtMs;
    const row = await this.prisma.workflowRun.update({
      where: { id: input.runId },
      data: {
        attempt: { increment: 1 },
        lastError: input.error,
        leasedBy: null,
        leaseUntil:
          retryAtMs === null
            ? null
            : new Date(Math.max(retryAtMs, input.nowMs)),
      },
    });
    return toRunSummary(row);
  }

  async recordTransition(input: {
    runId: string;
    draftId?: string;
    transition: TransitionDefinition;
    actor: TransitionActor;
    correlationId: string;
    reason?: string;
  }): Promise<WorkflowTransitionRecord> {
    const row = await this.prisma.workflowTransition.create({
      data: {
        runId: input.runId,
        draftId: input.draftId ?? null,
        fromState: input.transition.from,
        toState: input.transition.to,
        actorType: input.actor,
        correlationId: input.correlationId,
        reason: input.reason ?? null,
      },
    });
    return {
      id: row.id,
      runId: row.runId,
      draftId: row.draftId,
      fromState: row.fromState as DraftState,
      toState: row.toState as DraftState,
      actorType: row.actorType as TransitionActor,
      correlationId: row.correlationId,
      reason: row.reason,
      occurredAtMs: row.occurredAt.getTime(),
    };
  }

  async listTransitions(
    draftId: string,
  ): Promise<readonly WorkflowTransitionRecord[]> {
    const rows = await this.prisma.workflowTransition.findMany({
      where: { draftId },
      orderBy: { occurredAt: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      runId: row.runId,
      draftId: row.draftId,
      fromState: row.fromState as DraftState,
      toState: row.toState as DraftState,
      actorType: row.actorType as TransitionActor,
      correlationId: row.correlationId,
      reason: row.reason,
      occurredAtMs: row.occurredAt.getTime(),
    }));
  }

  async recordNoPublishReport(
    input: NoPublishReportInput,
  ): Promise<NoPublishReport> {
    const row = await this.prisma.noPublishReport.upsert({
      where: { runId: input.runId },
      create: {
        authorId: input.authorId,
        runId: input.runId,
        correlationId: input.correlationId,
        topic: input.topic,
        reason: input.reason as PrismaNoPublishReason,
      },
      update: {
        topic: input.topic,
        reason: input.reason as PrismaNoPublishReason,
      },
    });
    return {
      id: row.id,
      runId: row.runId,
      topic: row.topic,
      reason: row.reason as NoPublishReason,
      createdAtMs: row.createdAt.getTime(),
    };
  }

  async listNoPublishReports(
    authorId: string,
  ): Promise<readonly NoPublishReport[]> {
    const rows = await this.prisma.noPublishReport.findMany({
      where: { authorId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      runId: row.runId,
      topic: row.topic,
      reason: row.reason,
      createdAtMs: row.createdAt.getTime(),
    }));
  }

  async listForDraft(draftId: string): Promise<readonly AuditEventRecord[]> {
    const rows = await this.prisma.auditEvent.findMany({
      where: { draftId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      authorId: row.authorId,
      draftId: row.draftId,
      actorType: row.actorType,
      correlationId: row.correlationId,
      tool: row.tool,
      sanitizedInput: row.sanitizedInput,
      result: row.result,
      resource: row.resource,
      resourceVersion: row.resourceVersion,
      createdAtMs: row.createdAt.getTime(),
    }));
  }
}
