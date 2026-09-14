-- AlterTable
ALTER TABLE "drafts" ADD COLUMN     "state" "WorkflowState" NOT NULL DEFAULT 'DRAFTING',
ADD COLUMN     "foremArticleId" INTEGER;
