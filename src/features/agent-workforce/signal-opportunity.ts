import { z } from "zod";
import { serpObservationSchema } from "./prospect-research-contracts";
import { cacheReceiptSchema } from "./similarweb-cache";

const publicText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (s) =>
        !/(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|\bBearer\s|\bsk-[A-Za-z0-9]|postgres(?:ql)?:\/\/|\b(?:password|api[_ -]?key|access[_ -]?token|secret)\s*[:=])/i.test(
          s,
        ),
      "Private or credential-like content is not permitted in Signal evidence",
    );
const text = publicText(800);
export const publicEvidenceUrl = z
  .string()
  .url()
  .max(2000)
  .refine((raw) => {
    const u = new URL(raw);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.hash &&
      ![...u.searchParams.keys()].some((k) => /key|token|secret|signature|credential|auth/i.test(k))
    );
  });
/** Normalized licensed export, not an invented Similarweb API response. No spend or savings metrics. */
export const searchEvidenceSchema = z
  .object({
    provider: z.literal("SIMILARWEB"),
    authorized: z.literal(true),
    recordId: text,
    sourceUrl: publicEvidenceUrl,
    companyDomain: text,
    country: z.string().regex(/^[A-Z]{2}$/),
    device: z.enum(["desktop", "mobile"]),
    periodStart: z.string().datetime(),
    periodEnd: z.string().datetime(),
    retrievedAt: z.string().datetime(),
    keyword: text,
    classification: z.literal("BRANDED"),
    classificationBasis: text,
    paidSearchVisits: z.number().finite().nonnegative(),
    brandedPaidSharePercent: z.number().finite().min(0).max(100),
    visitsDefinition: z.literal(
      "Estimated paid search visits to this domain in the specified country, device and period",
    ),
    shareDefinition: z.literal(
      "Estimated visits from branded paid keywords divided by all estimated paid search visits, multiplied by 100",
    ),
    limitations: z.array(text).min(1).max(5),
    // Trusted collector's verified attribution requirement. Absence retains provider credit.
    // This does not grant data-access or cross-application licensing rights.
    attributionRequired: z.boolean().optional(),
    // Retain the authorized source text. Deterministic projections must occur verbatim in this text.
    excerpt: publicText(18000),
  })
  .strict();
export type SearchEvidence = z.infer<typeof searchEvidenceSchema>;
export const signalEvidenceSchema = z
  .object({
    target: z
      .object({
        query: text,
        country: z.string().regex(/^[A-Z]{2}$/),
        location: text,
        device: z.enum(["desktop", "mobile"]),
      })
      .strict(),
    search: searchEvidenceSchema.optional(),
    cachedSearch: cacheReceiptSchema.optional(),
    serp: serpObservationSchema
      .extend({
        sourceUrl: publicEvidenceUrl,
        ads: z.array(z.object({ title: text, url: publicEvidenceUrl }).strict()).max(30),
        query: text,
        location: text,
        limitation: text,
        captureRecommendation: text,
      })
      .optional(),
    blockers: z.array(text).max(20),
  })
  .strict();
export type SignalEvidence = z.infer<typeof signalEvidenceSchema>;
export const signalSemanticReviewSchema = z
  .object({
    version: z.literal(1),
    mode: z.enum(["SIMULATED", "LIVE"]),
    packetHash: z.string().regex(/^[a-f0-9]{64}$/),
    reviewedAt: z.string().datetime(),
    status: z.enum(["PASS", "REVISE", "HOLD", "UNAVAILABLE"]),
    reasons: z.array(text).max(12),
  })
  .strict();
export type SignalSemanticReview = z.infer<typeof signalSemanticReviewSchema>;
export const signalReportSchema = z
  .object({
    version: z.literal(1),
    mode: z.enum(["SIMULATED", "LIVE"]),
    // Absent on historical packets; absence never means semantic approval.
    semanticReview: signalSemanticReviewSchema.optional(),
    eligibility: z.enum(["Eligible", "HOLD"]),
    blockers: z.array(text).max(40),
    insights: z
      .array(
        z
          .object({
            factId: text,
            statement: text,
            sourceIds: z.array(text),
            quotes: z.array(z.object({ sourceId: text, text: publicText(1000) }).strict()),
          })
          .strict(),
      )
      .max(3),
    hypothesis: text.nullable(),
    provenSavings: z.null(),
    contact: z
      .object({ name: text, title: text, reason: text, sourceUrl: publicEvidenceUrl })
      .strict()
      .nullable(),
    judgement: z
      .object({
        factualCoverage: z.number(),
        opportunityCoverage: z.number(),
        reasons: z.array(text),
        missingDataActions: z.array(text),
      })
      .strict(),
    emails: z
      .array(
        z
          .object({
            subject: text,
            body: publicText(1800),
            factIds: z.array(text),
            knowledgeIds: z.array(text),
          })
          .strict(),
      )
      .max(4),
    approved: z.literal(false),
    canSend: z.literal(false),
    canEnroll: z.literal(false),
  })
  .strict()
  .superRefine((r, context) => {
    if (
      (r.eligibility === "HOLD" && r.emails.length > 0) ||
      (r.eligibility === "Eligible" &&
        (r.blockers.length ||
          r.insights.length !== 3 ||
          r.emails.length !== 4 ||
          !r.contact ||
          !r.hypothesis))
    )
      context.addIssue({
        code: "custom",
        message: "Signal report eligibility and draft gates are inconsistent",
      });
  });
export type SignalReport = z.infer<typeof signalReportSchema>;
