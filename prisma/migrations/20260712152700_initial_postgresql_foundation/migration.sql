-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SALES_USER', 'KNOWLEDGE_ADMIN');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('DRAFT', 'NEEDS_REVIEW', 'APPROVED', 'RESTRICTED', 'ARCHIVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "KnowledgeType" AS ENUM ('PRODUCT_TRUTH', 'ICP', 'PERSONA', 'MESSAGE_EXAMPLE', 'PROSPECT_QUESTION', 'OBJECTION', 'COMPETITOR', 'COMPETITOR_CLAIM', 'CASE_STUDY', 'SEQUENCE', 'SOURCE_DOCUMENT', 'CLAIM', 'KNOWLEDGE_SUBMISSION', 'REVIEW_DECISION', 'INTERACTION_OUTCOME');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('INTERNAL_DOCUMENT', 'CUSTOMER_CONVERSATION', 'SALES_CALL', 'EMAIL_THREAD', 'WEBSITE', 'RESEARCH_NOTE', 'OTHER');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('EMAIL', 'LINKEDIN', 'CALL', 'INTERNAL');

-- CreateEnum
CREATE TYPE "ReviewDecisionType" AS ENUM ('SUBMITTED', 'APPROVED', 'RESTRICTED', 'REJECTED', 'ARCHIVED', 'RETURNED_TO_REVIEW', 'EDITED');

-- CreateEnum
CREATE TYPE "InteractionOutcomeType" AS ENUM ('POSITIVE_REPLY', 'OBJECTION', 'MEETING_BOOKED', 'NOT_A_FIT', 'NO_RESPONSE', 'OTHER');

-- CreateEnum
CREATE TYPE "MetricDirection" AS ENUM ('INCREASE', 'DECREASE', 'NEUTRAL', 'UNKNOWN');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'SALES_USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeItem" (
    "id" TEXT NOT NULL,
    "type" "KnowledgeType" NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "body" TEXT,
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'DRAFT',
    "productScope" TEXT NOT NULL DEFAULT 'Signal',
    "productId" TEXT,
    "channels" "Channel"[],
    "usageRestrictions" TEXT,
    "internalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Industry" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Industry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Persona" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Persona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competitor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceDocument" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "externalUrl" TEXT,
    "fileReference" TEXT,
    "sourceDate" TIMESTAMP(3),
    "description" TEXT,
    "internalNotes" TEXT,
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "exactText" TEXT NOT NULL,
    "approvedWording" TEXT,
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'DRAFT',
    "productId" TEXT,
    "sourceDate" TIMESTAMP(3),
    "allowedChannels" "Channel"[],
    "usageRestrictions" TEXT,
    "reviewOwnerId" TEXT,
    "lastReviewedAt" TIMESTAMP(3),
    "internalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorClaim" (
    "id" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "knowledgeItemId" TEXT,
    "exactText" TEXT NOT NULL,
    "approvedWording" TEXT,
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'DRAFT',
    "usageRestrictions" TEXT,
    "internalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitorClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageExample" (
    "id" TEXT NOT NULL,
    "knowledgeItemId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageExample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProspectQuestion" (
    "id" TEXT NOT NULL,
    "knowledgeItemId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProspectQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Objection" (
    "id" TEXT NOT NULL,
    "knowledgeItemId" TEXT NOT NULL,
    "objection" TEXT NOT NULL,
    "response" TEXT,
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Objection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseStudy" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "geographyOrMarkets" TEXT,
    "businessModel" TEXT,
    "initialProblem" TEXT,
    "signalApproach" TEXT,
    "activationDuration" TEXT,
    "campaignTypes" TEXT[],
    "bestFitObjections" TEXT[],
    "approvedExternalWording" TEXT,
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'DRAFT',
    "usageRestrictions" TEXT,
    "internalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseStudy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseStudyMetric" (
    "id" TEXT NOT NULL,
    "caseStudyId" TEXT NOT NULL,
    "metricName" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "unit" TEXT,
    "direction" "MetricDirection" NOT NULL DEFAULT 'UNKNOWN',
    "comparison" TEXT,
    "timePeriod" TEXT,
    "approvedWording" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseStudyMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sequence" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'DRAFT',
    "usageRestrictions" TEXT,
    "internalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SequenceStep" (
    "id" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "channel" "Channel" NOT NULL,
    "purpose" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SequenceStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeSubmission" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "knowledgeItemId" TEXT,
    "title" TEXT NOT NULL,
    "submittedText" TEXT NOT NULL,
    "suggestedType" "KnowledgeType" NOT NULL,
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'DRAFT',
    "sourceNotes" TEXT,
    "sourceTitle" TEXT,
    "sourceType" "SourceType",
    "externalUrl" TEXT,
    "fileReference" TEXT,
    "channels" "Channel"[],
    "originType" TEXT NOT NULL DEFAULT 'MANUAL',
    "originDraftId" TEXT,
    "originWorkflow" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewDecision" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "decisionType" "ReviewDecisionType" NOT NULL,
    "action" TEXT,
    "fromStatus" "ApprovalStatus",
    "toStatus" "ApprovalStatus",
    "reason" TEXT,
    "internalNote" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "knowledgeItemId" TEXT,
    "claimId" TEXT,
    "knowledgeSubmissionId" TEXT,

    CONSTRAINT "ReviewDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InteractionOutcome" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "outcomeType" "InteractionOutcomeType" NOT NULL,
    "channel" "Channel" NOT NULL,
    "summary" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InteractionOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workflow" TEXT NOT NULL,
    "promptSnapshot" TEXT,
    "draftContent" TEXT NOT NULL,
    "submittedKnowledgeId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneratedDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_KnowledgeItemPersonas" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_KnowledgeItemSources" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_KnowledgeItemIndustries" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_SubmissionIndustries" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_SubmissionCompetitors" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_ClaimSources" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_ClaimIndustries" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_ClaimPersonas" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_KnowledgeItemClaims" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_CaseStudyIndustries" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_CaseStudyPersonas" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_CaseStudySources" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_SubmissionSources" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_SubmissionPersonas" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Product_name_key" ON "Product"("name");

-- CreateIndex
CREATE INDEX "KnowledgeItem_approvalStatus_idx" ON "KnowledgeItem"("approvalStatus");

-- CreateIndex
CREATE INDEX "KnowledgeItem_type_idx" ON "KnowledgeItem"("type");

-- CreateIndex
CREATE INDEX "KnowledgeItem_productScope_idx" ON "KnowledgeItem"("productScope");

-- CreateIndex
CREATE INDEX "KnowledgeItem_productId_idx" ON "KnowledgeItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Industry_name_key" ON "Industry"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Persona_name_key" ON "Persona"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Competitor_name_key" ON "Competitor"("name");

-- CreateIndex
CREATE INDEX "Claim_approvalStatus_idx" ON "Claim"("approvalStatus");

-- CreateIndex
CREATE INDEX "Claim_reviewOwnerId_idx" ON "Claim"("reviewOwnerId");

-- CreateIndex
CREATE INDEX "Claim_productId_idx" ON "Claim"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorClaim_knowledgeItemId_key" ON "CompetitorClaim"("knowledgeItemId");

-- CreateIndex
CREATE INDEX "CompetitorClaim_approvalStatus_idx" ON "CompetitorClaim"("approvalStatus");

-- CreateIndex
CREATE INDEX "CompetitorClaim_competitorId_idx" ON "CompetitorClaim"("competitorId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageExample_knowledgeItemId_key" ON "MessageExample"("knowledgeItemId");

-- CreateIndex
CREATE INDEX "MessageExample_approvalStatus_idx" ON "MessageExample"("approvalStatus");

-- CreateIndex
CREATE UNIQUE INDEX "ProspectQuestion_knowledgeItemId_key" ON "ProspectQuestion"("knowledgeItemId");

-- CreateIndex
CREATE INDEX "ProspectQuestion_approvalStatus_idx" ON "ProspectQuestion"("approvalStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Objection_knowledgeItemId_key" ON "Objection"("knowledgeItemId");

-- CreateIndex
CREATE INDEX "Objection_approvalStatus_idx" ON "Objection"("approvalStatus");

-- CreateIndex
CREATE INDEX "CaseStudy_approvalStatus_idx" ON "CaseStudy"("approvalStatus");

-- CreateIndex
CREATE UNIQUE INDEX "SequenceStep_sequenceId_stepNumber_key" ON "SequenceStep"("sequenceId", "stepNumber");

-- CreateIndex
CREATE INDEX "KnowledgeSubmission_approvalStatus_idx" ON "KnowledgeSubmission"("approvalStatus");

-- CreateIndex
CREATE INDEX "KnowledgeSubmission_authorId_idx" ON "KnowledgeSubmission"("authorId");

-- CreateIndex
CREATE INDEX "ReviewDecision_actorId_idx" ON "ReviewDecision"("actorId");

-- CreateIndex
CREATE INDEX "ReviewDecision_toStatus_idx" ON "ReviewDecision"("toStatus");

-- CreateIndex
CREATE INDEX "ReviewDecision_createdAt_idx" ON "ReviewDecision"("createdAt");

-- CreateIndex
CREATE INDEX "GeneratedDraft_userId_idx" ON "GeneratedDraft"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "_KnowledgeItemPersonas_AB_unique" ON "_KnowledgeItemPersonas"("A", "B");

-- CreateIndex
CREATE INDEX "_KnowledgeItemPersonas_B_index" ON "_KnowledgeItemPersonas"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_KnowledgeItemSources_AB_unique" ON "_KnowledgeItemSources"("A", "B");

-- CreateIndex
CREATE INDEX "_KnowledgeItemSources_B_index" ON "_KnowledgeItemSources"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_KnowledgeItemIndustries_AB_unique" ON "_KnowledgeItemIndustries"("A", "B");

-- CreateIndex
CREATE INDEX "_KnowledgeItemIndustries_B_index" ON "_KnowledgeItemIndustries"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_SubmissionIndustries_AB_unique" ON "_SubmissionIndustries"("A", "B");

-- CreateIndex
CREATE INDEX "_SubmissionIndustries_B_index" ON "_SubmissionIndustries"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_SubmissionCompetitors_AB_unique" ON "_SubmissionCompetitors"("A", "B");

-- CreateIndex
CREATE INDEX "_SubmissionCompetitors_B_index" ON "_SubmissionCompetitors"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_ClaimSources_AB_unique" ON "_ClaimSources"("A", "B");

-- CreateIndex
CREATE INDEX "_ClaimSources_B_index" ON "_ClaimSources"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_ClaimIndustries_AB_unique" ON "_ClaimIndustries"("A", "B");

-- CreateIndex
CREATE INDEX "_ClaimIndustries_B_index" ON "_ClaimIndustries"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_ClaimPersonas_AB_unique" ON "_ClaimPersonas"("A", "B");

-- CreateIndex
CREATE INDEX "_ClaimPersonas_B_index" ON "_ClaimPersonas"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_KnowledgeItemClaims_AB_unique" ON "_KnowledgeItemClaims"("A", "B");

-- CreateIndex
CREATE INDEX "_KnowledgeItemClaims_B_index" ON "_KnowledgeItemClaims"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_CaseStudyIndustries_AB_unique" ON "_CaseStudyIndustries"("A", "B");

-- CreateIndex
CREATE INDEX "_CaseStudyIndustries_B_index" ON "_CaseStudyIndustries"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_CaseStudyPersonas_AB_unique" ON "_CaseStudyPersonas"("A", "B");

-- CreateIndex
CREATE INDEX "_CaseStudyPersonas_B_index" ON "_CaseStudyPersonas"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_CaseStudySources_AB_unique" ON "_CaseStudySources"("A", "B");

-- CreateIndex
CREATE INDEX "_CaseStudySources_B_index" ON "_CaseStudySources"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_SubmissionSources_AB_unique" ON "_SubmissionSources"("A", "B");

-- CreateIndex
CREATE INDEX "_SubmissionSources_B_index" ON "_SubmissionSources"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_SubmissionPersonas_AB_unique" ON "_SubmissionPersonas"("A", "B");

-- CreateIndex
CREATE INDEX "_SubmissionPersonas_B_index" ON "_SubmissionPersonas"("B");

-- AddForeignKey
ALTER TABLE "KnowledgeItem" ADD CONSTRAINT "KnowledgeItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_reviewOwnerId_fkey" FOREIGN KEY ("reviewOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorClaim" ADD CONSTRAINT "CompetitorClaim_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorClaim" ADD CONSTRAINT "CompetitorClaim_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "KnowledgeItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageExample" ADD CONSTRAINT "MessageExample_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "KnowledgeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectQuestion" ADD CONSTRAINT "ProspectQuestion_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "KnowledgeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Objection" ADD CONSTRAINT "Objection_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "KnowledgeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseStudyMetric" ADD CONSTRAINT "CaseStudyMetric_caseStudyId_fkey" FOREIGN KEY ("caseStudyId") REFERENCES "CaseStudy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceStep" ADD CONSTRAINT "SequenceStep_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "Sequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeSubmission" ADD CONSTRAINT "KnowledgeSubmission_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeSubmission" ADD CONSTRAINT "KnowledgeSubmission_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "KnowledgeItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewDecision" ADD CONSTRAINT "ReviewDecision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewDecision" ADD CONSTRAINT "ReviewDecision_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "KnowledgeItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewDecision" ADD CONSTRAINT "ReviewDecision_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewDecision" ADD CONSTRAINT "ReviewDecision_knowledgeSubmissionId_fkey" FOREIGN KEY ("knowledgeSubmissionId") REFERENCES "KnowledgeSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractionOutcome" ADD CONSTRAINT "InteractionOutcome_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedDraft" ADD CONSTRAINT "GeneratedDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_KnowledgeItemPersonas" ADD CONSTRAINT "_KnowledgeItemPersonas_A_fkey" FOREIGN KEY ("A") REFERENCES "KnowledgeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_KnowledgeItemPersonas" ADD CONSTRAINT "_KnowledgeItemPersonas_B_fkey" FOREIGN KEY ("B") REFERENCES "Persona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_KnowledgeItemSources" ADD CONSTRAINT "_KnowledgeItemSources_A_fkey" FOREIGN KEY ("A") REFERENCES "KnowledgeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_KnowledgeItemSources" ADD CONSTRAINT "_KnowledgeItemSources_B_fkey" FOREIGN KEY ("B") REFERENCES "SourceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_KnowledgeItemIndustries" ADD CONSTRAINT "_KnowledgeItemIndustries_A_fkey" FOREIGN KEY ("A") REFERENCES "Industry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_KnowledgeItemIndustries" ADD CONSTRAINT "_KnowledgeItemIndustries_B_fkey" FOREIGN KEY ("B") REFERENCES "KnowledgeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SubmissionIndustries" ADD CONSTRAINT "_SubmissionIndustries_A_fkey" FOREIGN KEY ("A") REFERENCES "Industry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SubmissionIndustries" ADD CONSTRAINT "_SubmissionIndustries_B_fkey" FOREIGN KEY ("B") REFERENCES "KnowledgeSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SubmissionCompetitors" ADD CONSTRAINT "_SubmissionCompetitors_A_fkey" FOREIGN KEY ("A") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SubmissionCompetitors" ADD CONSTRAINT "_SubmissionCompetitors_B_fkey" FOREIGN KEY ("B") REFERENCES "KnowledgeSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClaimSources" ADD CONSTRAINT "_ClaimSources_A_fkey" FOREIGN KEY ("A") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClaimSources" ADD CONSTRAINT "_ClaimSources_B_fkey" FOREIGN KEY ("B") REFERENCES "SourceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClaimIndustries" ADD CONSTRAINT "_ClaimIndustries_A_fkey" FOREIGN KEY ("A") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClaimIndustries" ADD CONSTRAINT "_ClaimIndustries_B_fkey" FOREIGN KEY ("B") REFERENCES "Industry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClaimPersonas" ADD CONSTRAINT "_ClaimPersonas_A_fkey" FOREIGN KEY ("A") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClaimPersonas" ADD CONSTRAINT "_ClaimPersonas_B_fkey" FOREIGN KEY ("B") REFERENCES "Persona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_KnowledgeItemClaims" ADD CONSTRAINT "_KnowledgeItemClaims_A_fkey" FOREIGN KEY ("A") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_KnowledgeItemClaims" ADD CONSTRAINT "_KnowledgeItemClaims_B_fkey" FOREIGN KEY ("B") REFERENCES "KnowledgeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CaseStudyIndustries" ADD CONSTRAINT "_CaseStudyIndustries_A_fkey" FOREIGN KEY ("A") REFERENCES "CaseStudy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CaseStudyIndustries" ADD CONSTRAINT "_CaseStudyIndustries_B_fkey" FOREIGN KEY ("B") REFERENCES "Industry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CaseStudyPersonas" ADD CONSTRAINT "_CaseStudyPersonas_A_fkey" FOREIGN KEY ("A") REFERENCES "CaseStudy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CaseStudyPersonas" ADD CONSTRAINT "_CaseStudyPersonas_B_fkey" FOREIGN KEY ("B") REFERENCES "Persona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CaseStudySources" ADD CONSTRAINT "_CaseStudySources_A_fkey" FOREIGN KEY ("A") REFERENCES "CaseStudy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CaseStudySources" ADD CONSTRAINT "_CaseStudySources_B_fkey" FOREIGN KEY ("B") REFERENCES "SourceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SubmissionSources" ADD CONSTRAINT "_SubmissionSources_A_fkey" FOREIGN KEY ("A") REFERENCES "KnowledgeSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SubmissionSources" ADD CONSTRAINT "_SubmissionSources_B_fkey" FOREIGN KEY ("B") REFERENCES "SourceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SubmissionPersonas" ADD CONSTRAINT "_SubmissionPersonas_A_fkey" FOREIGN KEY ("A") REFERENCES "KnowledgeSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SubmissionPersonas" ADD CONSTRAINT "_SubmissionPersonas_B_fkey" FOREIGN KEY ("B") REFERENCES "Persona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

