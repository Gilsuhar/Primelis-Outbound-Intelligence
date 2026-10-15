import { z } from "zod";
import {
  agentFactSchema,
  agentSourceSchema,
  agentStrategySchema,
  personalSequenceSchema,
} from "./contracts";

const text = (max = 1000) => z.string().trim().min(1).max(max);
export const intakeSchema = z
  .object({
    companyName: text(180),
    companyDomain: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/)
      .max(240),
    prospectName: text(180),
    prospectTitle: text(180),
    linkedinUrl: z
      .string()
      .url()
      .max(500)
      .refine((value) => {
        try {
          const u = new URL(value);
          return (
            u.protocol === "https:" &&
            ["linkedin.com", "www.linkedin.com"].includes(u.hostname) &&
            u.pathname.startsWith("/in/") &&
            !u.username &&
            !u.password
          );
        } catch {
          return false;
        }
      })
      .optional(),
    targetMarket: text(120).optional(),
  })
  .strict();
export type WorkforceIntake = z.infer<typeof intakeSchema>;
export const sourceSchema = agentSourceSchema.extend({ excerpt: text(18000) });
export const groundedFactSchema = agentFactSchema.extend({
  statement: text(800),
  subject: z.enum(["ACCOUNT", "PROSPECT"]),
  category: z.enum([
    "BUSINESS_MODEL",
    "PRODUCTS",
    "MARKETS",
    "DEVELOPMENT",
    "POSITION",
    "RESPONSIBILITY",
  ]),
  quotes: z
    .array(z.object({ sourceId: text(160), text: text(1000) }).strict())
    .min(1)
    .max(4),
});
export const extractedResearchSchema = z
  .object({
    facts: z.array(groundedFactSchema).max(12),
    gaps: z.array(text()).max(12),
    assumptions: z.array(text()).max(8),
  })
  .strict();
export const researchSchema = z
  .object({
    accountDomain: text(240),
    prospectId: text(160),
    researchedAt: z.string().datetime({ offset: true }),
    sources: z.array(sourceSchema).max(8),
    facts: z.array(groundedFactSchema).max(24),
    gaps: z.array(z.string()).max(30),
    assumptions: z.array(z.string()).max(16),
  })
  .strict();
export type WorkforceResearch = z.infer<typeof researchSchema>;
export const knowledgeRecordSchema = z
  .object({
    id: text(200),
    kind: z.enum(["PRODUCT", "ICP", "CLAIM", "CASE_STUDY"]),
    title: text(300),
    text: text(4000),
    sourceIds: z.array(text(200)).min(1),
    sourceUrls: z.array(
      z
        .string()
        .url()
        .refine((value) => {
          try {
            const u = new URL(value);
            return u.protocol === "https:" && !u.username && !u.password;
          } catch {
            return false;
          }
        }),
    ),
    restrictions: z.string().max(2000),
  })
  .strict();
export type KnowledgeRecord = z.infer<typeof knowledgeRecordSchema>;
export const strategySchema = agentStrategySchema.extend({
  companyRationale: text(1600),
  prospectRationale: text(1600),
  alternatives: z
    .array(z.object({ angle: text(120), reasonNotSelected: text(800) }).strict())
    .min(1)
    .max(4),
});
const baseMessage = personalSequenceSchema.shape.messages.element;
export const messageSchema = baseMessage.extend({
  subject: text(160),
  body: text(2000),
  purpose: text(300),
  suggestedDelayDays: z.number().int().min(0).max(30),
  approvedKnowledgeIds: z.array(text(200)).min(1).max(8),
  assertions: z
    .array(
      z
        .object({ text: text(2000), factIds: z.array(text(160)), knowledgeIds: z.array(text(200)) })
        .strict(),
    )
    .min(1)
    .max(10),
});
export const sequenceSchema = personalSequenceSchema.extend({
  strategy: strategySchema,
  messages: z.array(messageSchema).length(4),
});
export type WorkforceSequence = z.infer<typeof sequenceSchema>;
export const criticSchema = z
  .object({
    verdict: z.enum(["PASS", "REVISE", "HOLD"]),
    checks: z
      .object({
        factualAccuracy: z.boolean(),
        sourceGrounding: z.boolean(),
        prospectRelevance: z.boolean(),
        nonRepetitive: z.boolean(),
        naturalLanguage: z.boolean(),
        commercialUsefulness: z.boolean(),
        approvedClaimsOnly: z.boolean(),
      })
      .strict(),
    checkedSteps: z.array(z.number().int().min(1).max(4)).length(4),
    unsupportedAssertions: z.array(text()).max(20),
    concerns: z.array(text()).max(20),
  })
  .strict();
export const groundingReviewSchema = z
  .object({
    supportedFactIds: z.array(text(160)),
    rejectedFactIds: z.array(text(160)),
    identityMatches: z.boolean(),
    concerns: z.array(text()).max(20),
  })
  .strict();
export const stages = [
  "KNOWLEDGE",
  "ACCOUNT_RESEARCH",
  "PROSPECT_INTELLIGENCE",
  "EVIDENCE_VALIDATION",
  "STRATEGY",
  "SEQUENCE",
  "QUALITY_REVIEW",
] as const;
export const runStatuses = [
  "RUNNING",
  "RESEARCH_INCOMPLETE",
  "INSUFFICIENT_EVIDENCE",
  "GENERATION_FAILED",
  "READY_FOR_REVIEW",
  "REJECTED",
] as const;
export const runSchema = z
  .object({
    id: text(100),
    version: z.number().int().min(1),
    intake: intakeSchema,
    inputHash: text(64),
    createdAt: z.string(),
    updatedAt: z.string(),
    status: z.enum(runStatuses),
    stage: z.enum(stages),
    leaseUntil: z.string().nullable(),
    events: z.array(
      z
        .object({
          stage: z.enum(stages),
          state: z.enum(["STARTED", "COMPLETED", "FAILED"]),
          at: z.string(),
        })
        .strict(),
    ),
    knowledge: z.array(knowledgeRecordSchema),
    research: researchSchema,
    brandSearch: z
      .object({
        status: z.literal("INCOMPLETE"),
        findings: z.array(z.string()).length(0),
        gaps: z.array(z.string()),
      })
      .strict(),
    strategy: strategySchema.nullable(),
    sequence: sequenceSchema.nullable(),
    critic: criticSchema.nullable(),
    revisionAttempts: z.number().int().min(0).max(1),
    eligibility: z
      .object({
        status: z.enum(["READY", "HOLD", "REJECTED"]),
        reasons: z.array(z.string()),
        blockDrafting: z.boolean(),
      })
      .strict(),
    issues: z.array(z.string()),
    usage: z.array(
      z
        .object({
          stage: z.string(),
          model: z.string(),
          attempts: z.number().int(),
          inputTokens: z.number().nonnegative(),
          outputTokens: z.number().nonnegative(),
          estimatedCostUsd: z.number().nonnegative().nullable(),
        })
        .strict(),
    ),
    approved: z.literal(false),
    canSend: z.literal(false),
    canEnroll: z.literal(false),
    contentHash: text(64).nullable(),
  })
  .strict();
export type WorkforceRun = z.infer<typeof runSchema>;
export const editSchema = z
  .object({
    action: z.literal("EDIT"),
    expectedVersion: z.number().int().min(1),
    messages: z.array(messageSchema).length(4),
  })
  .strict();
export const rejectSchema = z
  .object({ action: z.literal("REJECT"), expectedVersion: z.number().int().min(1) })
  .strict();
