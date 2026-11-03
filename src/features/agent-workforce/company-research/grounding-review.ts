import { z } from "zod";

export const companyConcernCodeSchema = z.enum([
  "CLAIM_NOT_ENTAILED",
  "QUOTE_OR_SOURCE_SUPPORT",
  "IDENTITY",
  "FRESHNESS",
  "NUMERIC_OR_PERIOD_CONTEXT",
  "SOURCE_INJECTION",
  "OTHER_REVIEWER_CONCERN",
  "CONTEXT_LIMITATION",
]);

/** Company-only contract. Existing prospect/drafting review contracts remain unchanged. */
export const companyGroundingConcernSchema = z
  .object({
    severity: z.enum(["BLOCKING", "NONBLOCKING"]),
    code: companyConcernCodeSchema,
    scope: z.enum(["FACT", "SOURCE", "GLOBAL"]),
    reason: z.string().trim().min(1).max(300),
    factIds: z.array(z.string().trim().min(1).max(160)).max(12),
    sourceIds: z.array(z.string().trim().min(1).max(160)).max(7),
  })
  .strict();

export const companyGroundingReviewSchema = z
  .object({
    supportedFactIds: z.array(z.string().trim().min(1).max(160)).max(12),
    rejectedFactIds: z.array(z.string().trim().min(1).max(160)).max(12),
    identityMatches: z.boolean(),
    concerns: z.array(companyGroundingConcernSchema).max(20),
  })
  .strict();
export type CompanyGroundingReview = z.infer<typeof companyGroundingReviewSchema>;
