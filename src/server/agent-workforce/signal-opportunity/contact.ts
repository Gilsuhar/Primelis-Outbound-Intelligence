import "server-only";
import { checkWorkforceEligibility } from "../safety";
import { snapshotSchema } from "@/server/services/sales-agent-collection-service";
import { verificationObservations } from "@/server/verification/service";
import type { WorkforceIntake } from "@/features/agent-workforce/gate-a-contracts";
import type { EvidenceStore } from "@/server/sales-agent/evidence-store";
import type { IntegrationStore } from "@/server/integrations/store";
import type { SignalReport } from "@/features/agent-workforce/signal-opportunity";

export type ContactDecision = {
  ready: boolean;
  blockers: string[];
  contact: SignalReport["contact"];
};
/** Server-only reads; never infer responsibility from title or count CRM enrichment as independent proof. */
export async function signalContactDecision(
  actor: string,
  input: WorkforceIntake,
  now: Date,
  deps: { evidence: EvidenceStore; integrations: IntegrationStore },
): Promise<ContactDecision> {
  const gate = await checkWorkforceEligibility(actor, input, now, deps);
  const candidates = (await deps.evidence.list(actor)).flatMap((raw) => {
    const parsed = snapshotSchema.safeParse(raw);
    return parsed.success &&
      parsed.data.contact.hubspotRecordId === input.hubspotRecordId &&
      parsed.data.contact.fullName === input.prospectName &&
      parsed.data.contact.companyDomain === input.companyDomain
      ? [parsed.data]
      : [];
  });
  const blockers =
    gate.status === "READY" && !gate.blockDrafting
      ? []
      : ["CONTACT_ELIGIBILITY_HOLD", ...gate.reasons];
  const snapshot = candidates.length === 1 ? candidates[0] : undefined;
  const employment =
    snapshot?.verification?.EMPLOYMENT?.state === "COMPLETED"
      ? snapshot.verification.EMPLOYMENT.result
      : undefined;
  const email =
    snapshot?.verification?.EMAIL?.state === "COMPLETED"
      ? snapshot.verification.EMAIL.result
      : undefined;
  const employmentObservations =
    snapshot && employment ? verificationObservations(employment, snapshot.contact, now) : [];
  const verifiedEmployment = employmentObservations.some(
    (o) => o.field === "currentEmploymentVerified" && o.value === true,
  );
  const verifiedSearch = employmentObservations.some(
    (o) => o.field === "paidSearchResponsibility" && o.value === "PROVEN",
  );
  // Reuse the existing qualification exception, never infer campaign ownership from a CMO title.
  const verifiedCmo =
    verifiedEmployment &&
    employment?.kind === "EMPLOYMENT" &&
    employment.seniority === "C_LEVEL" &&
    /\b(cmo|chief marketing officer)\b/i.test(employment.role) &&
    employment.responsibilityScope !== "PAID_SOCIAL_ONLY" &&
    employment.searchResponsibility !== "ABSENT";
  if (
    !verifiedEmployment ||
    (!verifiedSearch && !verifiedCmo) ||
    employment?.kind !== "EMPLOYMENT" ||
    employment.role !== input.prospectTitle
  )
    blockers.push("INDEPENDENT_CURRENT_EMPLOYMENT_AND_PAID_SEARCH_REMIT_REQUIRED");
  if (
    !snapshot ||
    !email ||
    email.kind !== "EMAIL" ||
    email.status !== "VERIFIED" ||
    !email.businessEmail ||
    !verificationObservations(email, snapshot.contact, now).length
  )
    blockers.push("INDEPENDENT_CURRENT_BUSINESS_EMAIL_REQUIRED");
  return {
    ready: !blockers.length,
    blockers,
    contact:
      !blockers.length && employment?.kind === "EMPLOYMENT"
        ? {
            name: input.prospectName,
            title: employment.role,
            reason: verifiedSearch
              ? "Independent current-employment evidence explicitly verifies Paid Search responsibility; owned intake, suppression, complete history and four-calendar-month cooldown gates pass."
              : "Independently verified current CMO qualifies through the existing CMO exception; campaign ownership is not inferred. Owned intake, suppression, complete history, email and four-calendar-month cooldown gates pass.",
            sourceUrl: employment.proof.sourceUrl,
          }
        : null,
  };
}
