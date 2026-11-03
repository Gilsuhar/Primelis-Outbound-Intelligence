CREATE TABLE "IntegrationState" (
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "provider" TEXT NOT NULL CHECK ("provider" IN ('HUBSPOT', 'OUTREACH')),
  "state" JSONB NOT NULL, "secret" TEXT, "version" INTEGER NOT NULL DEFAULT 1,
  "leaseOwner" TEXT, "leaseUntil" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("userId", "provider")
);
CREATE TABLE "IntegrationAuditEvent" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "provider" TEXT NOT NULL, "event" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "IntegrationAuditEvent_userId_provider_createdAt_idx" ON "IntegrationAuditEvent"("userId", "provider", "createdAt");
-- No public/anon/authenticated direct table access. The existing server Prisma role manages data.
ALTER TABLE "IntegrationState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IntegrationAuditEvent" ENABLE ROW LEVEL SECURITY;

CREATE INDEX "ProspectSource_sourceLabel_createdAt_idx" ON "ProspectSource"("sourceLabel", "createdAt");
