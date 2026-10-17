/**
 * Editorial draft access is deliberately separate from outbound eligibility.
 *
 * This policy never grants permission to send, enroll, export as send-ready,
 * or change CRM records. The existing strict eligibility gate remains the
 * sole authority for those operations.
 */
export type DraftIntakeDecision = {
  draftAllowed: boolean;
  status: "DRAFT_ALLOWED" | "BLOCKED";
  blockers: string[];
  warnings: string[];
};

export type DraftIntakeEvidence = {
  inOwnedScope: boolean;
  personaRelevant: boolean | null;
  emailValidity: "VALID" | "INVALID" | "UNKNOWN" | "CATCH_ALL";
  unsubscribed: boolean | null;
  hardBounced: boolean | null;
  complained: boolean | null;
  historyComplete: boolean;
  employmentVerified: boolean;
  conflictingOpportunity: boolean | null;
  lastOutboundAtKnown: boolean;
};

/**
 * Only positive evidence of a hard exclusion blocks *draft creation*.
 * Unknown evidence remains an explicit warning and must NEVER be converted
 * to outbound clearance. The UI must label all such drafts NOT SEND READY.
 */
export function assessDraftIntake(e: DraftIntakeEvidence): DraftIntakeDecision {
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (!e.inOwnedScope) blockers.push("OUTSIDE_OWNED_SCOPE");
  if (e.personaRelevant === false) blockers.push("IRRELEVANT_PERSONA");
  if (e.emailValidity === "INVALID") blockers.push("INVALID_EMAIL");
  if (e.unsubscribed === true) blockers.push("UNSUBSCRIBED");
  if (e.hardBounced === true) blockers.push("HARD_BOUNCE");
  if (e.complained === true) blockers.push("SPAM_COMPLAINT");
  if (e.conflictingOpportunity === true) blockers.push("CONFLICTING_OPPORTUNITY");

  if (e.personaRelevant === null) warnings.push("PERSONA_NOT_VERIFIED");
  if (e.emailValidity === "UNKNOWN" || e.emailValidity === "CATCH_ALL")
    warnings.push("EMAIL_NOT_VERIFIED");
  if (e.unsubscribed === null) warnings.push("UNSUBSCRIBE_STATUS_UNKNOWN");
  if (e.hardBounced === null) warnings.push("BOUNCE_STATUS_UNKNOWN");
  if (e.complained === null) warnings.push("COMPLAINT_STATUS_UNKNOWN");
  if (!e.historyComplete) warnings.push("OUTREACH_HISTORY_INCOMPLETE");
  if (!e.employmentVerified) warnings.push("EMPLOYMENT_NOT_VERIFIED");
  if (e.conflictingOpportunity === null) warnings.push("OPPORTUNITY_STATUS_UNKNOWN");
  if (!e.lastOutboundAtKnown) warnings.push("LAST_OUTBOUND_UNKNOWN");

  return {
    draftAllowed: blockers.length === 0,
    status: blockers.length ? "BLOCKED" : "DRAFT_ALLOWED",
    blockers,
    warnings,
  };
}
