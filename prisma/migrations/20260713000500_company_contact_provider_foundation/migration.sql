CREATE TABLE "CompanyEnrichmentRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyName" TEXT,
    "normalizedDomain" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "failureCategory" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyEnrichmentRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyEnrichmentFinding" (
    "id" TEXT NOT NULL,
    "enrichmentRunId" TEXT NOT NULL,
    "normalizedField" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "fieldOrigin" TEXT NOT NULL,
    "retrievedAt" TIMESTAMP(3) NOT NULL,
    "confidence" TEXT,
    "sourceUrl" TEXT,
    "reviewStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyEnrichmentFinding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContactEnrichmentResult" (
    "id" TEXT NOT NULL,
    "enrichmentRunId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "professionalTitle" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "companyDomain" TEXT NOT NULL,
    "countryOrRegion" TEXT,
    "department" TEXT,
    "seniority" TEXT,
    "personaTier" TEXT NOT NULL,
    "personaCategory" TEXT NOT NULL,
    "professionalProfileUrl" TEXT,
    "businessEmail" TEXT,
    "businessEmailStatus" TEXT,
    "provider" TEXT NOT NULL,
    "retrievedAt" TIMESTAMP(3) NOT NULL,
    "relevanceState" TEXT NOT NULL,
    "reviewStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactEnrichmentResult_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProviderSyncAudit" (
    "id" TEXT NOT NULL,
    "enrichmentRunId" TEXT,
    "providerOperation" TEXT NOT NULL,
    "recordCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderSyncAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CompanyEnrichmentRun_userId_idx" ON "CompanyEnrichmentRun"("userId");
CREATE INDEX "CompanyEnrichmentRun_normalizedDomain_idx" ON "CompanyEnrichmentRun"("normalizedDomain");
CREATE INDEX "CompanyEnrichmentRun_provider_idx" ON "CompanyEnrichmentRun"("provider");
CREATE INDEX "CompanyEnrichmentRun_status_idx" ON "CompanyEnrichmentRun"("status");
CREATE INDEX "CompanyEnrichmentFinding_enrichmentRunId_idx" ON "CompanyEnrichmentFinding"("enrichmentRunId");
CREATE INDEX "CompanyEnrichmentFinding_normalizedField_idx" ON "CompanyEnrichmentFinding"("normalizedField");
CREATE INDEX "CompanyEnrichmentFinding_reviewStatus_idx" ON "CompanyEnrichmentFinding"("reviewStatus");
CREATE INDEX "ContactEnrichmentResult_enrichmentRunId_idx" ON "ContactEnrichmentResult"("enrichmentRunId");
CREATE INDEX "ContactEnrichmentResult_companyDomain_idx" ON "ContactEnrichmentResult"("companyDomain");
CREATE INDEX "ContactEnrichmentResult_personaTier_idx" ON "ContactEnrichmentResult"("personaTier");
CREATE INDEX "ContactEnrichmentResult_reviewStatus_idx" ON "ContactEnrichmentResult"("reviewStatus");
CREATE INDEX "ProviderSyncAudit_enrichmentRunId_idx" ON "ProviderSyncAudit"("enrichmentRunId");
CREATE INDEX "ProviderSyncAudit_userId_idx" ON "ProviderSyncAudit"("userId");
CREATE INDEX "ProviderSyncAudit_createdAt_idx" ON "ProviderSyncAudit"("createdAt");

ALTER TABLE "CompanyEnrichmentRun" ADD CONSTRAINT "CompanyEnrichmentRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyEnrichmentFinding" ADD CONSTRAINT "CompanyEnrichmentFinding_enrichmentRunId_fkey" FOREIGN KEY ("enrichmentRunId") REFERENCES "CompanyEnrichmentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactEnrichmentResult" ADD CONSTRAINT "ContactEnrichmentResult_enrichmentRunId_fkey" FOREIGN KEY ("enrichmentRunId") REFERENCES "CompanyEnrichmentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProviderSyncAudit" ADD CONSTRAINT "ProviderSyncAudit_enrichmentRunId_fkey" FOREIGN KEY ("enrichmentRunId") REFERENCES "CompanyEnrichmentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProviderSyncAudit" ADD CONSTRAINT "ProviderSyncAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
