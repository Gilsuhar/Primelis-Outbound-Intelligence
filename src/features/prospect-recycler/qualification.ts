import { z } from "zod";
import { timestamp } from "./calendar";
import type { RecyclerDecision, RecyclerInput, RecyclerReason } from "./contracts";
import { evaluateRecyclerBatch, RECYCLER_CHECK_MAX_AGE_MS, RECYCLER_VERIFICATION_MAX_AGE_MS } from "./eligibility";

const receipt = {
  hubspotId: z.string().min(1), employerDomain: z.string().min(1),
  evidenceId: z.string().min(1), source: z.string().min(1), authoritative: z.boolean(),
  checkedAt: z.string().refine(value => timestamp(value) !== null),
};
/** Server-owned receipts only. Browser input and email-provider badges are not authority. */
export const qualificationSchema = z.object({
  ownership: z.object({ ...receipt, ownerId: z.string().min(1) }).strict().optional(),
  company: z.object({ ...receipt, name: z.string().min(1), employees: z.number().int().nonnegative().nullable(), annualRevenueUsd: z.number().finite().nonnegative().nullable() }).strict().optional(),
  responsibility: z.object({ ...receipt, title: z.string().min(1), seniority: z.enum(["CMO", "VP", "HEAD", "DIRECTOR", "OTHER", "UNKNOWN"]), searchResponsibility: z.boolean().nullable(), paidSocialOnly: z.boolean().nullable() }).strict().optional(),
  opportunities: z.object({ ...receipt, coverage: z.enum(["COMPLETE", "PARTIAL", "UNKNOWN"]), activeConflict: z.boolean().nullable() }).strict().optional(),
}).strict();
export type QualificationEvidence = z.infer<typeof qualificationSchema>;

/** Final Recycler decision: adds mandatory business gates without altering the Phase 1 safety evaluator. */
function qualifyRecycler(input: RecyclerInput, raw: unknown, base: RecyclerDecision): RecyclerDecision {
  const decision = structuredClone(base);
  decision.reasons = decision.reasons.filter(reason => reason.code !== "ALL_CHECKS_PASSED");
  const add = (code: string, message: string, evidenceIds: string[] = [], status: RecyclerReason["status"] = "HOLD") =>
    decision.reasons.push({ code, message, evidenceIds, status });
  const parsed = qualificationSchema.safeParse(raw ?? {});
  const evidence = parsed.success ? parsed.data : {};
  if (!parsed.success) add("QUALIFICATION_INVALID", "Qualification receipts are malformed; none can clear eligibility.");
  const ids = input.identity.records.filter(record => record.system === "HUBSPOT").map(record => record.id);
  if (ids.length !== 1) add("HUBSPOT_OWNERSHIP_UNESTABLISHED", "Exactly one verified HubSpot identity owned by 1087915602 is required; Outreach-only contacts remain in review.");
  const now = timestamp(base.evaluatedAt)!;
  const normalized = (value: string) => value.trim().toLowerCase().replace(/^www\./, "");
  const boundKinds = new Set<string>();
  for (const kind of ["ownership", "company", "responsibility", "opportunities"] as const) {
    const proof = evidence[kind];
    if (!proof) { add(`QUALIFICATION_${kind.toUpperCase()}_MISSING`, `${kind} evidence is missing.`); continue; }
    decision.evidenceTimestamps.push({ kind: "QUALIFICATION", source: proof.source, evidenceId: proof.evidenceId, checkedAt: proof.checkedAt });
    const time = timestamp(proof.checkedAt)!;
    if (ids.length !== 1 || proof.hubspotId !== ids[0] || !input.identity.employerDomain ||
        normalized(proof.employerDomain) !== normalized(input.identity.employerDomain)) {
      add("QUALIFICATION_IDENTITY_MISMATCH", `${kind} evidence must match the exact HubSpot record and current employer.`, [proof.evidenceId]);
      continue;
    }
    const age = kind === "ownership" || kind === "opportunities" ? RECYCLER_CHECK_MAX_AGE_MS : RECYCLER_VERIFICATION_MAX_AGE_MS;
    if (!proof.authoritative || time > now || now - time > age) {
      add("QUALIFICATION_NOT_CURRENT", `${kind} requires current authoritative evidence (${age / 86400000}-day maximum age).`, [proof.evidenceId]);
      continue;
    }
    boundKinds.add(kind);
  }
  const owned = boundKinds.has("ownership") ? evidence.ownership : undefined;
  if (owned && owned.hubspotId === ids[0] && owned.ownerId !== "1087915602")
    add("OWNER_OUT_OF_SCOPE", "The HubSpot owner is outside the approved Recycler scope.", [owned.evidenceId], "EXCLUDED");
  const company = boundKinds.has("company") ? evidence.company : undefined;
  if (company) {
    if (company.employees === null || company.annualRevenueUsd === null)
      add("COMPANY_METRICS_UNKNOWN", "Both employee count and annual revenue in USD are required.", [company.evidenceId]);
    if ((company.employees !== null && company.employees < 80) || (company.annualRevenueUsd !== null && company.annualRevenueUsd < 30_000_000))
      add("COMPANY_BELOW_THRESHOLD", "Company must have both at least 80 employees and USD 30 million annual revenue.", [company.evidenceId], "EXCLUDED");
  }
  const role = boundKinds.has("responsibility") ? evidence.responsibility : undefined;
  if (role) {
    if (role.paidSocialOnly === true) add("PAID_SOCIAL_ONLY", "Paid Social-only responsibility is out of scope.", [role.evidenceId], "EXCLUDED");
    if (/paid social/i.test(role.title) && !/search|\bppc\b|\bsem\b/i.test(role.title) && role.paidSocialOnly === false)
      add("ROLE_EVIDENCE_CONFLICT", "The Paid Social title conflicts with the supplied Search responsibility receipt; resolve the scope before qualification.", [role.evidenceId]);
    if (!["CMO", "VP", "HEAD", "DIRECTOR"].includes(role.seniority) || role.searchResponsibility !== true || role.paidSocialOnly !== false)
      add("SEARCH_RESPONSIBILITY_UNVERIFIED", "Senior Search responsibility requires explicit evidence; title keywords and CMO status alone are insufficient.", [role.evidenceId]);
  }
  const opportunities = boundKinds.has("opportunities") ? evidence.opportunities : undefined;
  if (opportunities?.activeConflict === true)
    add("ACTIVE_OPPORTUNITY_CONFLICT", "A confirmed active opportunity conflicts with outbound prospecting.", [opportunities.evidenceId], "EXCLUDED");
  else if (opportunities && (opportunities.coverage !== "COMPLETE" || opportunities.activeConflict !== false))
    add("OPPORTUNITY_CONFLICT_UNRESOLVED", "Complete current opportunity clearance is required; active or unknown conflicts remain on hold.", [opportunities.evidenceId]);
  const email = input.emailVerification;
  if (email && /^(boring|hubspot|surfe|manual)(?:$|[\s:_-])/i.test(email.providerId.trim()))
    add("EMAIL_INDEPENDENT_RECEIPT_REQUIRED", "A CRM, Surfe, manual edit or Boring badge is not independent business-email validation.", [email.evidenceId]);
  decision.status = decision.reasons.some(reason => reason.status === "EXCLUDED") ? "EXCLUDED" : decision.reasons.some(reason => reason.status === "HOLD") ? "HOLD" : "ELIGIBLE";
  if (decision.status === "ELIGIBLE") add("ALL_CHECKS_PASSED", "Ownership, company, Search responsibility, opportunities and every outbound-safety and verification gate passed. Human approval is still required before any outbound action.", [], "ELIGIBLE");
  return decision;
}

export function evaluateQualifiedRecyclerBatch(inputs: RecyclerInput[], evidence: Record<string, unknown>, asOf: string) {
  const decisions = evaluateRecyclerBatch(inputs, asOf);
  return inputs.map((input, index) => qualifyRecycler(input, evidence[input.candidateId], decisions[index]));
}
