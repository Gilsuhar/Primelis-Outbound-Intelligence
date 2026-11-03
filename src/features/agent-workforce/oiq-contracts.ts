import { z } from "zod";

export const oiqComponents = {
  companyInsight: { label: "Company-specific insight", max: 30 },
  verifiedEvidence: { label: "Verified supporting evidence", max: 25 },
  searchRelevance: { label: "Relevance to Search responsibilities", max: 20 },
  commercialAngle: { label: "Commercially interesting angle", max: 15 },
  writingAndCta: { label: "Natural writing and low-friction CTA", max: 10 },
} as const;
const text = z.string().trim().min(1).max(1500);
const component = (max: number) =>
  z.object({ score: z.number().int().min(0).max(max), reason: text }).strict();
/** The existing reviewer supplies judgments; the server computes totals, citations and decisions. */
export const oiqJudgmentSchema = z
  .object({
    components: z
      .object({
        companyInsight: component(30),
        verifiedEvidence: component(25),
        searchRelevance: component(20),
        commercialAngle: component(15),
        writingAndCta: component(10),
      })
      .strict(),
    coreInsight: z
      .object({
        summary: text,
        factIds: z.array(text).max(12),
        observationIds: z.array(text).max(6),
        messageSteps: z.array(z.number().int().min(1).max(4)).max(4),
      })
      .strict(),
    companySwapTest: z.object({ equallyRelevant: z.boolean(), reason: text }).strict(),
    unsupportedClaims: z.array(text).max(20),
    missingCoreEvidence: z.array(text).max(20),
    improvements: z.array(text).max(20),
  })
  .strict();
export const oiqAssessmentSchema = oiqJudgmentSchema
  .extend({
    version: z.literal(1),
    mode: z.enum(["EVIDENCE_LED", "INSIGHT_LED"]).optional(),
    score: z.number().int().min(0).max(100),
    decision: z.enum(["READY_FOR_HUMAN_REVIEW", "REVISE", "BLOCKED"]),
    weakPersonalization: z.boolean(),
    blockingReasons: z.array(text).max(60),
    references: z
      .array(
        z
          .object({
            kind: z.enum(["FACT", "SERP", "KNOWLEDGE"]),
            id: text,
            sourceId: text,
            url: z.string().url().nullable(),
            observedAt: z.string().datetime({ offset: true }).nullable(),
            messageSteps: z.array(z.number().int().min(1).max(4)).max(4),
          })
          .strict(),
      )
      .max(64),
    contentHash: z.string().length(64),
  })
  .strict();
export type OiqJudgment = z.infer<typeof oiqJudgmentSchema>;
export type OiqAssessment = z.infer<typeof oiqAssessmentSchema>;
