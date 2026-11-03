import "server-only";

import { z } from "zod";

import { planProspectWorkflow } from "@/features/sales-agent/orchestrator";
import { MAX_EVIDENCE_AGE_DAYS } from "@/features/sales-agent/qualification";
import { err, ok } from "./result";

const evidence = <T extends z.ZodTypeAny>(value: T) =>
  z
    .object({
      value,
      source: z.string().trim().min(1).max(500),
      verifiedAt: z.string().max(80),
    })
    .strict();

// Missing facts remain missing. Invalid payload types are never coerced into verification.
export const salesAgentInputSchema = z
  .object({
    hubspotRecordId: z.string().trim().min(1).max(200).optional(),
    hubspotOwnerId: z.string().trim().min(1).max(200).optional(),
    employeeCount: evidence(z.number().finite().int().nonnegative()).optional(),
    annualRevenueUsd: evidence(z.number().finite().nonnegative()).optional(),
    role: evidence(z.string().max(300)).optional(),
    paidSearchResponsibility: evidence(z.enum(["PROVEN", "ABSENT", "UNKNOWN"])).optional(),
    currentEmploymentVerified: evidence(z.boolean()).optional(),
    employmentIndependentlyVerified: z.boolean().optional(),
    emailVerification: evidence(
      z
        .object({
          status: z.enum(["VALID", "INVALID", "CATCH_ALL", "UNKNOWN"]),
          independentlyVerified: z.boolean(),
          emailMatchesCurrentRecord: z.boolean(),
          businessEmailVerified: z.boolean().optional(),
        })
        .strict(),
    ).optional(),
    lastOutboundAt: evidence(z.string().max(80).nullable()).optional(),
    eligibilityEvidence: evidence(z.boolean()).optional(),
    outreachHistoryComplete: z.boolean().optional(),
    unsubscribed: z.boolean().optional(),
    hardBounced: z.boolean().optional(),
    complained: z.boolean().optional(),
    activeSequence: z.boolean().optional(),
    conflictingActiveOpportunity: z.boolean().optional(),
  })
  .strict();

/** Stateless planning only: supplied evidence is evaluated, never fetched or certified here. */
export function createSalesAgentPlan(input: unknown, now = new Date()) {
  const parsed = salesAgentInputSchema.safeParse(input);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid structured prospect evidence");
  const plan = planProspectWorkflow(parsed.data, now);
  return ok({
    ...plan,
    evaluatedAt: now.toISOString(),
    evidence: parsed.data,
    evidenceMode: "CALLER_SUPPLIED" as const,
    evidenceMaxAgeDays: MAX_EVIDENCE_AGE_DAYS,
    humanApproval: {
      required: true,
      granted: false,
      requirements: [
        "Verify source provenance and current eligibility before using this plan",
        "Provide a human-verified SERP screenshot with source and timestamp",
        "Approve facts, approved proof and each of the four emails before any enrollment",
      ],
    },
    execution: { research: false, drafting: false, enrollment: false, sending: false },
  });
}
