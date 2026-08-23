CREATE TYPE "ProspectStatus" AS ENUM (
  'NEW',
  'CONTEXT_READY',
  'INTELLIGENCE_READY',
  'SEQUENCE_DRAFT',
  'SEQUENCE_APPROVED'
);

CREATE TYPE "ProspectSourceType" AS ENUM (
  'MANUAL_PASTE',
  'LINKEDIN_PROFILE',
  'LINKEDIN_POST',
  'SERP_EVIDENCE',
  'MANUAL_NOTE',
  'FILE_IMPORT',
  'ACCOUNT_RESEARCH'
);

CREATE TYPE "ExtractedFactCategory" AS ENUM (
  'PROSPECT',
  'COMPANY',
  'LINKEDIN',
  'SERP',
  'NOTE'
);

CREATE TABLE "Prospect" (
  id TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "firstName" TEXT,
  "lastName" TEXT,
  "fullName" TEXT,
  email TEXT,
  "jobTitle" TEXT,
  "companyName" TEXT,
  "companyDomain" TEXT,
  "linkedinUrl" TEXT,
  status "ProspectStatus" NOT NULL DEFAULT 'NEW',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Prospect_pkey" PRIMARY KEY (id)
);

CREATE TABLE "ProspectSource" (
  id TEXT NOT NULL,
  "prospectId" TEXT NOT NULL,
  type "ProspectSourceType" NOT NULL DEFAULT 'MANUAL_PASTE',
  "rawContent" TEXT NOT NULL,
  "sourceLabel" TEXT,
  "sourceUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProspectSource_pkey" PRIMARY KEY (id)
);

CREATE TABLE "ProspectFact" (
  id TEXT NOT NULL,
  "prospectId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  value TEXT NOT NULL,
  category "ExtractedFactCategory" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProspectFact_pkey" PRIMARY KEY (id)
);

ALTER TABLE "GeneratedDraft" ADD COLUMN "prospectId" TEXT;

CREATE INDEX "Prospect_userId_idx" ON "Prospect"("userId");
CREATE INDEX "Prospect_userId_email_idx" ON "Prospect"("userId", email);
CREATE INDEX "Prospect_userId_linkedinUrl_idx" ON "Prospect"("userId", "linkedinUrl");
CREATE INDEX "Prospect_userId_fullName_companyDomain_idx" ON "Prospect"("userId", "fullName", "companyDomain");
CREATE INDEX "Prospect_userId_fullName_companyName_idx" ON "Prospect"("userId", "fullName", "companyName");
CREATE UNIQUE INDEX "ProspectSource_id_prospectId_key" ON "ProspectSource"(id, "prospectId");
CREATE INDEX "ProspectSource_prospectId_idx" ON "ProspectSource"("prospectId");
CREATE INDEX "ProspectSource_type_idx" ON "ProspectSource"(type);
CREATE INDEX "ProspectSource_createdAt_idx" ON "ProspectSource"("createdAt");
CREATE INDEX "ProspectFact_prospectId_idx" ON "ProspectFact"("prospectId");
CREATE INDEX "ProspectFact_sourceId_idx" ON "ProspectFact"("sourceId");
CREATE INDEX "ProspectFact_category_idx" ON "ProspectFact"(category);
CREATE INDEX "GeneratedDraft_prospectId_idx" ON "GeneratedDraft"("prospectId");

ALTER TABLE "Prospect" ADD CONSTRAINT "Prospect_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProspectSource" ADD CONSTRAINT "ProspectSource_prospectId_fkey"
  FOREIGN KEY ("prospectId") REFERENCES "Prospect"(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProspectFact" ADD CONSTRAINT "ProspectFact_prospectId_fkey"
  FOREIGN KEY ("prospectId") REFERENCES "Prospect"(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProspectFact" ADD CONSTRAINT "ProspectFact_sourceId_fkey"
  FOREIGN KEY ("sourceId", "prospectId") REFERENCES "ProspectSource"(id, "prospectId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GeneratedDraft" ADD CONSTRAINT "GeneratedDraft_prospectId_fkey"
  FOREIGN KEY ("prospectId") REFERENCES "Prospect"(id) ON DELETE SET NULL ON UPDATE CASCADE;
