-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "Capability" AS ENUM ('READ', 'DRAFT_WRITE', 'PUBLISH');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "WorkflowState" AS ENUM ('RESEARCHING', 'IDEA_READY', 'DRAFTING', 'DRAFT_READY', 'AWAITING_APPROVAL', 'APPROVED', 'PUBLISHING', 'PUBLISHED', 'REJECTED', 'DISCARDED', 'FAILED', 'NO_PUBLISH');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('AUTHOR', 'AGENT', 'SYSTEM', 'SCHEDULER');

-- CreateEnum
CREATE TYPE "EvaluationKind" AS ENUM ('RETRIEVAL', 'DRAFTING', 'SAFETY', 'APPROVAL', 'PROTOCOL');

-- CreateTable
CREATE TABLE "authors" (
    "id" TEXT NOT NULL,
    "githubUserId" INTEGER NOT NULL,
    "githubLogin" TEXT NOT NULL,
    "email" TEXT,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "authors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "author_configs" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "weeklyCadence" TEXT NOT NULL DEFAULT 'weekly',
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "styleGuidance" TEXT,
    "maxPerPage" INTEGER NOT NULL DEFAULT 30,
    "maxRequestBytes" INTEGER NOT NULL DEFAULT 262144,
    "rateLimitPerMinute" INTEGER NOT NULL DEFAULT 60,
    "approvalTtlMinutes" INTEGER NOT NULL DEFAULT 1440,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "author_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "author_authorizations" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "capability" "Capability" NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "author_authorizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_snapshots" (
    "id" TEXT NOT NULL,
    "authorId" TEXT,
    "foremArticleId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "slug" TEXT,
    "path" TEXT,
    "url" TEXT,
    "publishedAt" TIMESTAMP(3),
    "readablePublishDate" TEXT,
    "tagList" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "commentsCount" INTEGER NOT NULL DEFAULT 0,
    "publicReactionsCount" INTEGER NOT NULL DEFAULT 0,
    "authorUsername" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "embeddings" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "dimensions" INTEGER NOT NULL,
    "vector" vector(1536) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drafts" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draft_versions" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "markdown" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "draft_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draft_snapshots" (
    "draftId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,

    CONSTRAINT "draft_snapshots_pkey" PRIMARY KEY ("draftId","snapshotId")
);

-- CreateTable
CREATE TABLE "approvals" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "draftVersionId" TEXT NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "contentHash" TEXT NOT NULL,
    "feedback" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_runs" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "draftId" TEXT,
    "idempotencyKey" TEXT,
    "state" "WorkflowState" NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "leaseUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "draftId" TEXT,
    "actorType" "ActorType" NOT NULL,
    "correlationId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "sanitizedInput" JSONB NOT NULL,
    "result" TEXT NOT NULL,
    "resource" TEXT,
    "resourceVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluations" (
    "id" TEXT NOT NULL,
    "authorId" TEXT,
    "kind" "EvaluationKind" NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_sessions" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "dashboard_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "authors_githubUserId_key" ON "authors"("githubUserId");

-- CreateIndex
CREATE UNIQUE INDEX "authors_githubLogin_key" ON "authors"("githubLogin");

-- CreateIndex
CREATE UNIQUE INDEX "author_configs_authorId_key" ON "author_configs"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "author_authorizations_authorId_capability_key" ON "author_authorizations"("authorId", "capability");

-- CreateIndex
CREATE INDEX "article_snapshots_observedAt_idx" ON "article_snapshots"("observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "article_snapshots_foremArticleId_key" ON "article_snapshots"("foremArticleId");

-- CreateIndex
CREATE UNIQUE INDEX "embeddings_snapshotId_key" ON "embeddings"("snapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "drafts_currentVersionId_key" ON "drafts"("currentVersionId");

-- CreateIndex
CREATE INDEX "drafts_authorId_idx" ON "drafts"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "draft_versions_draftId_version_key" ON "draft_versions"("draftId", "version");

-- CreateIndex
CREATE INDEX "approvals_draftVersionId_contentHash_idx" ON "approvals"("draftVersionId", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_runs_idempotencyKey_key" ON "workflow_runs"("idempotencyKey");

-- CreateIndex
CREATE INDEX "workflow_runs_state_leaseUntil_idx" ON "workflow_runs"("state", "leaseUntil");

-- CreateIndex
CREATE INDEX "audit_events_correlationId_idx" ON "audit_events"("correlationId");

-- CreateIndex
CREATE INDEX "audit_events_draftId_createdAt_idx" ON "audit_events"("draftId", "createdAt");

-- CreateIndex
CREATE INDEX "evaluations_kind_createdAt_idx" ON "evaluations"("kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_sessions_tokenHash_key" ON "dashboard_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "dashboard_sessions_expiresAt_idx" ON "dashboard_sessions"("expiresAt");

-- AddForeignKey
ALTER TABLE "author_configs" ADD CONSTRAINT "author_configs_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "authors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "author_authorizations" ADD CONSTRAINT "author_authorizations_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "authors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_snapshots" ADD CONSTRAINT "article_snapshots_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "authors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "article_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "authors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "draft_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_versions" ADD CONSTRAINT "draft_versions_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_snapshots" ADD CONSTRAINT "draft_snapshots_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_snapshots" ADD CONSTRAINT "draft_snapshots_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "article_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "authors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_draftVersionId_fkey" FOREIGN KEY ("draftVersionId") REFERENCES "draft_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "authors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "drafts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "authors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "drafts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "authors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_sessions" ADD CONSTRAINT "dashboard_sessions_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "authors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
