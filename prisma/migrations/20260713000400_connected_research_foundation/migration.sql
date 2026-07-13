CREATE TABLE "SuppressionRecord" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "domain" TEXT,
    "normalizedDomain" TEXT,
    "status" TEXT NOT NULL,
    "accountOwner" TEXT,
    "reason" TEXT,
    "source" TEXT,
    "lastContactDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuppressionRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SuppressionImportBatch" (
    "id" TEXT NOT NULL,
    "importerId" TEXT NOT NULL,
    "sourceFilename" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "summary" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuppressionImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SuppressionAudit" (
    "id" TEXT NOT NULL,
    "suppressionRecordId" TEXT NOT NULL,
    "importBatchId" TEXT,
    "importerId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "previousValue" JSONB,
    "newValue" JSONB NOT NULL,
    "sourceFilename" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuppressionAudit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebsiteResearchRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "normalizedDomain" TEXT NOT NULL,
    "researchStatus" TEXT NOT NULL,
    "requestedUrls" TEXT[],
    "fetchedUrls" TEXT[],
    "failedUrls" TEXT[],
    "findings" JSONB NOT NULL,
    "acceptedFindings" JSONB,
    "rejectedFindings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebsiteResearchRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SuppressionRecord_normalizedName_idx" ON "SuppressionRecord"("normalizedName");
CREATE INDEX "SuppressionRecord_normalizedDomain_idx" ON "SuppressionRecord"("normalizedDomain");
CREATE INDEX "SuppressionRecord_status_idx" ON "SuppressionRecord"("status");
CREATE INDEX "SuppressionImportBatch_importerId_idx" ON "SuppressionImportBatch"("importerId");
CREATE INDEX "SuppressionImportBatch_createdAt_idx" ON "SuppressionImportBatch"("createdAt");
CREATE INDEX "SuppressionAudit_suppressionRecordId_idx" ON "SuppressionAudit"("suppressionRecordId");
CREATE INDEX "SuppressionAudit_importBatchId_idx" ON "SuppressionAudit"("importBatchId");
CREATE INDEX "SuppressionAudit_importerId_idx" ON "SuppressionAudit"("importerId");
CREATE INDEX "SuppressionAudit_createdAt_idx" ON "SuppressionAudit"("createdAt");
CREATE INDEX "WebsiteResearchRun_userId_idx" ON "WebsiteResearchRun"("userId");
CREATE INDEX "WebsiteResearchRun_normalizedDomain_idx" ON "WebsiteResearchRun"("normalizedDomain");
CREATE INDEX "WebsiteResearchRun_researchStatus_idx" ON "WebsiteResearchRun"("researchStatus");

ALTER TABLE "SuppressionImportBatch" ADD CONSTRAINT "SuppressionImportBatch_importerId_fkey" FOREIGN KEY ("importerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SuppressionAudit" ADD CONSTRAINT "SuppressionAudit_suppressionRecordId_fkey" FOREIGN KEY ("suppressionRecordId") REFERENCES "SuppressionRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SuppressionAudit" ADD CONSTRAINT "SuppressionAudit_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "SuppressionImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SuppressionAudit" ADD CONSTRAINT "SuppressionAudit_importerId_fkey" FOREIGN KEY ("importerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WebsiteResearchRun" ADD CONSTRAINT "WebsiteResearchRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
