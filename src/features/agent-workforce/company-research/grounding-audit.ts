import { z } from "zod";
import { companyConcernCodeSchema } from "./grounding-review";

export const groundingAuditReasonSchema = z.enum([
  "IDENTITY_MISMATCH",
  "REVIEWER_CONCERNS",
  "REJECTED_FACTS",
  "SUPPORTED_COUNT_MISMATCH",
  "SUPPORTED_ID_COVERAGE_MISMATCH",
  "DUPLICATE_SUPPORTED_IDS",
  "MISSING_SUPPORTED_IDS",
  "MALFORMED_REVIEW",
  "REVIEW_UNAVAILABLE",
  "INCONSISTENT_REVIEW",
]);
export const reviewerConcernCodeSchema = z.enum([
  "CLAIM_NOT_ENTAILED",
  "QUOTE_OR_SOURCE_SUPPORT",
  "IDENTITY",
  "FRESHNESS",
  "NUMERIC_OR_PERIOD_CONTEXT",
  "SOURCE_INJECTION",
  "OTHER_REVIEWER_CONCERN",
]);
const omission = z.enum([
  "SENSITIVE_CONTENT",
  "AUDIT_TEXT_LIMIT",
  "NOT_EXACT_PUBLIC_SOURCE",
  "ACCEPTED_FINDING_REFERENCE",
]);
export const groundingAuditSchema = z
  .object({
    version: z.literal(1),
    status: z.enum(["ACCEPTED", "REJECTED", "MALFORMED", "UNAVAILABLE"]),
    identityMatches: z.boolean().nullable(),
    reasonCodes: z.array(groundingAuditReasonSchema).max(10),
    reviewer: z
      .object({
        supportedCandidateIds: z.array(z.string().regex(/^candidate-\d+$/)).max(12),
        rejectedCandidateIds: z.array(z.string().regex(/^candidate-\d+$/)).max(12),
        supportedCount: z.number().int().min(0).max(10000),
        rejectedCount: z.number().int().min(0).max(10000),
        unknownSupportedCount: z.number().int().min(0).max(10000),
        unknownRejectedCount: z.number().int().min(0).max(10000),
        concernCount: z.number().int().min(0).max(20),
        concernCodes: z.array(reviewerConcernCodeSchema).max(7),
        // Absent on historical audits: never infer their severity or recover lost prose.
        concerns: z
          .array(
            z
              .object({
                severity: z.enum(["BLOCKING", "NONBLOCKING"]),
                code: companyConcernCodeSchema,
                scope: z.enum(["FACT", "SOURCE", "GLOBAL"]),
                candidateIds: z.array(z.string().regex(/^candidate-\d+$/)).max(12),
                sourceIds: z
                  .array(z.string().regex(/^(?:web:[a-f0-9]{20}|import:[A-Za-z0-9:_-]{1,100})$/))
                  .max(7),
                attributionOmitted: z.boolean(),
                reason: z.string().max(300).optional(),
                reasonOmitted: z.enum(["SENSITIVE_CONTENT", "AUDIT_TEXT_LIMIT"]).optional(),
              })
              .strict(),
          )
          .max(20)
          .optional(),
      })
      .strict()
      .optional(),
    candidates: z
      .array(
        z
          .object({
            candidateId: z.string().regex(/^candidate-\d+$/),
            factId: z
              .string()
              .regex(/^account:[A-Za-z0-9:_-]{1,140}$/)
              .optional(),
            verified: z.literal(false),
            deterministicChecks: z.literal("PASSED"),
            reviewerDecision: z.enum([
              "SUPPORTED",
              "REJECTED",
              "CONFLICT",
              "NOT_LISTED",
              "UNAVAILABLE",
            ]),
            statement: z.string().max(800).optional(),
            statementOmitted: omission.optional(),
            sourceIds: z
              .array(z.string().regex(/^(?:web:[a-f0-9]{20}|import:[A-Za-z0-9:_-]{1,100})$/))
              .max(4),
            quotes: z
              .array(
                z
                  .object({
                    sourceId: z
                      .string()
                      .regex(/^(?:web:[a-f0-9]{20}|import:[A-Za-z0-9:_-]{1,100}|unknown-source)$/),
                    exactMatch: z.boolean(),
                    text: z.string().max(1000).optional(),
                    textOmitted: omission.optional(),
                  })
                  .strict(),
              )
              .max(4),
          })
          .strict(),
      )
      .max(12),
  })
  .strict();
export type GroundingAudit = z.infer<typeof groundingAuditSchema>;
