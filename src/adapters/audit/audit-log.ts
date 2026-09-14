import type { Prisma, PrismaClient } from "@prisma/client";
import { redactSecrets } from "../../errors/redaction.ts";

export type AuditActorType = "AUTHOR" | "AGENT" | "SYSTEM" | "SCHEDULER";

export interface AuditEventInput {
  readonly authorId: string;
  readonly draftId?: string;
  readonly actorType: AuditActorType;
  readonly correlationId: string;
  readonly tool: string;
  readonly input: unknown;
  readonly result: string;
  readonly resource?: string;
  readonly resourceVersion?: string;
}

export interface AuditLogger {
  record(input: AuditEventInput): Promise<void>;
}

export function createAuditLogger(prisma: PrismaClient): AuditLogger {
  return {
    async record(input: AuditEventInput): Promise<void> {
      await prisma.auditEvent.create({
        data: {
          authorId: input.authorId,
          draftId: input.draftId ?? null,
          actorType: input.actorType,
          correlationId: input.correlationId,
          tool: input.tool,
          sanitizedInput: redactSecrets(input.input) as Prisma.InputJsonValue,
          result: input.result,
          resource: input.resource ?? null,
          resourceVersion: input.resourceVersion ?? null,
        },
      });
    },
  };
}
