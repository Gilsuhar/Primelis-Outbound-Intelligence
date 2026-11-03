-- CreateEnum
CREATE TYPE "GeneratedDraftStatus" AS ENUM ('DRAFT', 'SUBMITTED_FOR_REVIEW', 'ARCHIVED');

-- AlterTable
ALTER TABLE "GeneratedDraft"
ADD COLUMN "inputSnapshot" JSONB,
ADD COLUMN "alternativeContent" TEXT,
ADD COLUMN "retrievedKnowledgeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "sourceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "providerName" TEXT,
ADD COLUMN "modelName" TEXT,
ADD COLUMN "draftStatus" "GeneratedDraftStatus" NOT NULL DEFAULT 'DRAFT';

-- Backfill nullable array defaults for existing rows.
UPDATE "GeneratedDraft"
SET
  "retrievedKnowledgeIds" = COALESCE("retrievedKnowledgeIds", ARRAY[]::TEXT[]),
  "sourceIds" = COALESCE("sourceIds", ARRAY[]::TEXT[]);

-- Tighten array columns after backfill.
ALTER TABLE "GeneratedDraft"
ALTER COLUMN "retrievedKnowledgeIds" SET NOT NULL,
ALTER COLUMN "sourceIds" SET NOT NULL;

-- CreateIndex
CREATE INDEX "GeneratedDraft_workflow_idx" ON "GeneratedDraft"("workflow");

-- CreateIndex
CREATE INDEX "GeneratedDraft_draftStatus_idx" ON "GeneratedDraft"("draftStatus");
