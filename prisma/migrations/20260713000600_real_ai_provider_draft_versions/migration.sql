CREATE TABLE "DraftVersion" (
    "id" TEXT NOT NULL,
    "generatedDraftId" TEXT NOT NULL,
    "draftFamilyId" TEXT NOT NULL,
    "parentVersionId" TEXT,
    "versionNumber" INTEGER NOT NULL,
    "workflow" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "refinementCommand" TEXT,
    "userInstruction" TEXT,
    "generatedContent" TEXT NOT NULL,
    "alternativeContent" TEXT,
    "sourceReferences" JSONB,
    "knowledgeReferences" TEXT[],
    "providerName" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "providerStatus" TEXT NOT NULL,
    "safetyFlags" JSONB,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "isPreferred" BOOLEAN NOT NULL DEFAULT false,
    "manualEdit" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DraftVersion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DraftVersion_generatedDraftId_idx" ON "DraftVersion"("generatedDraftId");
CREATE INDEX "DraftVersion_draftFamilyId_idx" ON "DraftVersion"("draftFamilyId");
CREATE INDEX "DraftVersion_workflow_idx" ON "DraftVersion"("workflow");
CREATE INDEX "DraftVersion_createdBy_idx" ON "DraftVersion"("createdBy");
CREATE INDEX "DraftVersion_isCurrent_idx" ON "DraftVersion"("isCurrent");

ALTER TABLE "DraftVersion" ADD CONSTRAINT "DraftVersion_generatedDraftId_fkey" FOREIGN KEY ("generatedDraftId") REFERENCES "GeneratedDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DraftVersion" ADD CONSTRAINT "DraftVersion_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
