-- CreateEnum
CREATE TYPE "CaseStudyUsageScope" AS ENUM ('INTERNAL_ONLY', 'SALES_REPLY_ONLY', 'EMAIL_AND_LINKEDIN', 'DECK_ONLY', 'PUBLIC_MARKETING');

-- AlterTable
ALTER TABLE "KnowledgeItem"
ADD COLUMN "approvedWording" TEXT,
ADD COLUMN "reviewOwnerId" TEXT,
ADD COLUMN "lastReviewedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SourceDocument"
ADD COLUMN "approvedWording" TEXT,
ADD COLUMN "usageRestrictions" TEXT,
ADD COLUMN "reviewOwnerId" TEXT,
ADD COLUMN "lastReviewedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CaseStudy"
ADD COLUMN "usageScope" "CaseStudyUsageScope",
ADD COLUMN "reviewOwnerId" TEXT,
ADD COLUMN "lastReviewedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ReviewDecision"
ADD COLUMN "sourceDocumentId" TEXT,
ADD COLUMN "caseStudyId" TEXT;

-- CreateIndex
CREATE INDEX "KnowledgeItem_reviewOwnerId_idx" ON "KnowledgeItem"("reviewOwnerId");

-- CreateIndex
CREATE INDEX "SourceDocument_reviewOwnerId_idx" ON "SourceDocument"("reviewOwnerId");

-- CreateIndex
CREATE INDEX "CaseStudy_reviewOwnerId_idx" ON "CaseStudy"("reviewOwnerId");

-- CreateIndex
CREATE INDEX "CaseStudy_usageScope_idx" ON "CaseStudy"("usageScope");

-- AddForeignKey
ALTER TABLE "KnowledgeItem" ADD CONSTRAINT "KnowledgeItem_reviewOwnerId_fkey" FOREIGN KEY ("reviewOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_reviewOwnerId_fkey" FOREIGN KEY ("reviewOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseStudy" ADD CONSTRAINT "CaseStudy_reviewOwnerId_fkey" FOREIGN KEY ("reviewOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewDecision" ADD CONSTRAINT "ReviewDecision_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewDecision" ADD CONSTRAINT "ReviewDecision_caseStudyId_fkey" FOREIGN KEY ("caseStudyId") REFERENCES "CaseStudy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
