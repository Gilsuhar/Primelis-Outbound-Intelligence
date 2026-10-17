import type { WorkforceIntake } from "@/features/agent-workforce/gate-a-contracts";
import { PrismaEvidenceStore, type EvidenceStore } from "@/server/sales-agent/evidence-store";
import { LocalSuppressionAdapter } from "@/server/sales-agent/local-suppression";
import { normalizeDomain } from "@/features/connected-research/url-safety";
import "server-only";
import { z } from "zod";
import { normalizeCollectedEvidence } from "@/features/sales-agent/evidence";
import { isInOwnedIntakeScope } from "@/features/sales-agent/intake-scope";
import { snapshotSchema } from "@/server/services/sales-agent-collection-service";
import { assessDraftIntake } from "./draft-intake-policy";

/** Uses the same collected evidence as send eligibility, without manufacturing clearance. */
export function draftAccessForSnapshot(snapshot: z.infer<typeof snapshotSchema>, now: Date) {
  const { input } = normalizeCollectedEvidence(snapshot.contact, snapshot.observations, now);
  const observations = snapshot.observations.filter(
    (o) => o.hubspotRecordId === snapshot.contact.hubspotRecordId,
  );
  // A positive exclusion survives stale/incomplete clearance and conflicting negative records.
  const positive = (field: string) =>
    observations.some((o) => o.field === field && o.value === true);
  const role =
    input.role?.value ?? String(observations.filter((o) => o.field === "role").at(-1)?.value ?? "");
  const excludedPersona =
    /paid social|social media|\bseo\b|organic search/i.test(role) &&
    !/paid search|\bppc\b|\bsem\b|search engine marketing/i.test(role);
  const relevant =
    /paid search|\bppc\b|\bsem\b|growth|performance|\bcmo\b|chief marketing|marketing|acquisition/i.test(
      role,
    );
  const emailInvalid = observations.some(
    (o) =>
      o.field === "emailVerification" &&
      o.subjectEmail?.toLowerCase() === snapshot.contact.email?.toLowerCase() &&
      (o.value as { status?: string })?.status === "INVALID",
  );
  const result = assessDraftIntake({
    inOwnedScope: isInOwnedIntakeScope(snapshot.contact) && !!snapshot.integrationReceipts?.HUBSPOT,
    personaRelevant:
      excludedPersona || input.paidSearchResponsibility?.value === "ABSENT"
        ? false
        : relevant
          ? true
          : role && role !== "Role unverified"
            ? false
            : null,
    emailValidity: emailInvalid ? "INVALID" : (input.emailVerification?.value.status ?? "UNKNOWN"),
    unsubscribed: positive("unsubscribed") ? true : (input.unsubscribed ?? null),
    hardBounced: positive("hardBounced") ? true : (input.hardBounced ?? null),
    complained: positive("complained") ? true : (input.complained ?? null),
    conflictingOpportunity: positive("conflictingActiveOpportunity")
      ? true
      : (input.conflictingActiveOpportunity ?? null),
    historyComplete: input.outreachHistoryComplete === true,
    employmentVerified:
      input.currentEmploymentVerified?.value === true &&
      input.employmentIndependentlyVerified === true,
    lastOutboundAtKnown: !!input.lastOutboundAt,
  });
  const extra = [
    ...(observations.some((o) => o.field === "accountSuppression" && typeof o.value === "string")
      ? ["ACCOUNT_SUPPRESSED"]
      : []),
    ...(input.employeeCount && input.employeeCount.value < 80 ? ["OUTSIDE_COMPANY_ICP"] : []),
    ...(input.annualRevenueUsd && input.annualRevenueUsd.value < 30000000
      ? ["OUTSIDE_COMPANY_ICP"]
      : []),
  ];
  result.blockers = [...new Set([...result.blockers, ...extra])];
  result.draftAllowed = !result.blockers.length;
  result.status = result.draftAllowed ? "DRAFT_ALLOWED" : "BLOCKED";
  return result;
}

export async function checkWorkforceDraftAccess(
  actor: string,
  intake: WorkforceIntake,
  now: Date,
  store: EvidenceStore = new PrismaEvidenceStore(),
) {
  const matches = (await store.list(actor)).flatMap((raw) => {
    const p = snapshotSchema.safeParse(raw);
    return p.success && p.data.contact.hubspotRecordId === intake.hubspotRecordId ? [p.data] : [];
  });
  if (matches.length !== 1)
    return {
      draftAllowed: false,
      status: "BLOCKED" as const,
      blockers: ["OWNED_IDENTITY_REQUIRED"],
      warnings: [],
    };
  const snapshot = structuredClone(matches[0]);
  if (
    normalizeDomain(snapshot.contact.companyDomain ?? "") !==
      normalizeDomain(intake.companyDomain) ||
    snapshot.contact.fullName.trim().toLowerCase() !== intake.prospectName.trim().toLowerCase()
  )
    return {
      draftAllowed: false,
      status: "BLOCKED" as const,
      blockers: ["CONTACT_IDENTITY_CHANGED"],
      warnings: [],
    };
  const local = await new LocalSuppressionAdapter(await store.suppressionRecords()).collect(
    snapshot.contact,
    now,
  );
  snapshot.observations.push(...local.observations);
  return draftAccessForSnapshot(snapshot, now);
}
