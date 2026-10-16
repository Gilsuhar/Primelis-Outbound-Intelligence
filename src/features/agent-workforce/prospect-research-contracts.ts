import { z } from "zod";
const text = z.string().min(1).max(2000);
export const researchStages = [
  "COMPANY",
  "SIMILARWEB",
  "SERP",
  "CONTACT",
  "ASSESSMENT",
  "REVIEW",
] as const;
export const stageResultSchema = z
  .object({
    status: z.enum(["WAITING", "RUNNING", "COMPLETE", "DATA_UNAVAILABLE", "FAILED"]),
    attempts: z.number().int().min(0).max(3),
    startedAt: z.string().datetime().nullable(),
    finishedAt: z.string().datetime().nullable(),
    retryAt: z.string().datetime().nullable(),
    code: z.string().max(80).nullable(),
    detail: z.string().max(2000),
  })
  .strict();
export const serpObservationSchema = z
  .object({
    id: text,
    query: text,
    location: text,
    country: text,
    device: z.enum(["desktop", "mobile"]),
    observedAt: z.string().datetime(),
    sourceUrl: z.string().url(),
    provider: z.literal("SERPAPI"),
    ads: z.array(z.object({ title: text, url: z.string().url() }).strict()).max(30),
    brandAdvertising: z.enum(["OBSERVED", "NOT_OBSERVED"]),
    otherAdvertiserDomains: z.array(text).max(30),
    limitation: text,
    captureRecommendation: text,
  })
  .strict();
export const opportunitySchema = z
  .object({
    hypothesis: text,
    supportingFactIds: z.array(z.string().min(1)).max(24),
    supportingObservationIds: z.array(z.string().min(1)).max(6),
    confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
    limitations: z.array(text).min(1).max(15),
    missingInformation: z.array(text).max(15),
    recommendedAngle: z.enum([
      "COMPETITOR_DEFENSE",
      "BRAND_SPEND_EFFICIENCY",
      "INCREMENTALITY",
      "OTHER_EVIDENCE_LED",
      "NO_PITCH",
    ]),
    followUp: z.array(text).max(8),
  })
  .strict();
export const prospectResearchSchema = z
  .object({
    version: z.literal(1),
    identityHash: z.string().length(64),
    status: z.enum(["RUNNING", "COMPLETE", "PARTIAL", "STALE"]),
    expiresAt: z.string().datetime(),
    stages: z
      .object({
        COMPANY: stageResultSchema,
        SIMILARWEB: stageResultSchema,
        SERP: stageResultSchema,
        CONTACT: stageResultSchema,
        ASSESSMENT: stageResultSchema,
        REVIEW: stageResultSchema,
      })
      .strict(),
    similarweb: z
      .object({
        status: z.literal("DATA_UNAVAILABLE"),
        requiredAccess: text,
        metrics: z.array(z.never()).length(0),
      })
      .strict(),
    serp: z.array(serpObservationSchema).max(6),
    opportunity: opportunitySchema.nullable(),
    reviewIssues: z.array(text).max(50),
    history: z
      .array(
        z
          .object({
            stage: z.enum(researchStages),
            state: z.enum(["RUNNING", "COMPLETE", "FAILED", "DATA_UNAVAILABLE"]),
            at: z.string().datetime(),
            code: z.string().nullable(),
          })
          .strict(),
      )
      .max(120)
      .default([]),
  })
  .strict();
export type ProspectResearch = z.infer<typeof prospectResearchSchema>;
export type ResearchStage = (typeof researchStages)[number];
export type SerpObservation = z.infer<typeof serpObservationSchema>;
