-- CreateEnum
CREATE TYPE "NoPublishReason" AS ENUM ('LOW_VALUE', 'DUPLICATE', 'INSUFFICIENT_EVIDENCE', 'POLICY');

-- AlterTable
ALTER TABLE "workflow_runs" ADD COLUMN     "correlationId" TEXT,
ADD COLUMN     "leasedBy" TEXT;

-- CreateTable
CREATE TABLE "workflow_transitions" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "draftId" TEXT,
    "fromState" "WorkflowState" NOT NULL,
    "toState" "WorkflowState" NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "correlationId" TEXT NOT NULL,
    "reason" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "no_publish_reports" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "reason" "NoPublishReason" NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "no_publish_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workflow_transitions_draftId_occurredAt_idx" ON "workflow_transitions"("draftId", "occurredAt");

-- CreateIndex
CREATE INDEX "workflow_transitions_runId_occurredAt_idx" ON "workflow_transitions"("runId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "no_publish_reports_runId_key" ON "no_publish_reports"("runId");

-- CreateIndex
CREATE INDEX "no_publish_reports_authorId_createdAt_idx" ON "no_publish_reports"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "workflow_runs_authorId_startedAt_idx" ON "workflow_runs"("authorId", "startedAt");

-- AddForeignKey
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_runId_fkey" FOREIGN KEY ("runId") REFERENCES "workflow_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "no_publish_reports" ADD CONSTRAINT "no_publish_reports_runId_fkey" FOREIGN KEY ("runId") REFERENCES "workflow_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "no_publish_reports" ADD CONSTRAINT "no_publish_reports_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "authors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
