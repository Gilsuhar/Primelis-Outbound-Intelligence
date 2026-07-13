CREATE TABLE "AccountAssessment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "domain" TEXT,
    "inputSnapshot" JSONB NOT NULL,
    "factStatuses" JSONB NOT NULL,
    "qualificationResult" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "verifiedSignals" TEXT[] NOT NULL,
    "assumptions" TEXT[] NOT NULL,
    "missingInformation" TEXT[] NOT NULL,
    "suppressionResult" JSONB NOT NULL,
    "personaRecommendation" JSONB NOT NULL,
    "angleRecommendation" JSONB NOT NULL,
    "recommendedNextAction" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountAssessment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccountAssessment_userId_idx" ON "AccountAssessment"("userId");
CREATE INDEX "AccountAssessment_companyName_idx" ON "AccountAssessment"("companyName");
CREATE INDEX "AccountAssessment_domain_idx" ON "AccountAssessment"("domain");
CREATE INDEX "AccountAssessment_qualificationResult_idx" ON "AccountAssessment"("qualificationResult");

ALTER TABLE "AccountAssessment" ADD CONSTRAINT "AccountAssessment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
