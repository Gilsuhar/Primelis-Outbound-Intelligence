import { sameVerificationIdentity, type VerificationState } from "./verification/contracts";
import { hasHistoricalAuthority } from "./history-authority";
import {
  addCalendarMonths,
  MIN_EMPLOYEES,
  MIN_REVENUE_USD,
  SIGNAL_HUBSPOT_OWNER_ID,
  parseTimestamp,
  type QualificationDecision,
} from "./qualification";
import type { EvidenceProvenance, IntakeContact } from "./evidence";
export type EligibilityGate = {
  id: string;
  label: string;
  state: "CLEAR" | "BLOCKED" | "UNKNOWN";
  resolution: "VERIFIED" | "MISSING_EVIDENCE" | "UNRESOLVED_PROVIDER" | "STALE" | "CONFLICT";
  reason: string;
  nextAction: string;
  evidence: EvidenceProvenance[];
  checkedAt: string | null;
};
export type QualificationReport = {
  status: "ELIGIBLE" | "HOLD" | "REJECTED";
  evaluatedAt: string;
  gates: EligibilityGate[];
  holdReasons: string[];
  missingPermissions: string[];
  nextActions: string[];
  approved: false;
};
export function buildQualificationReport(
  contact: IntakeContact,
  provenance: EvidenceProvenance[],
  decision: QualificationDecision,
  now: Date,
  blockers: string[] = [],
  missingPermissions: string[] = [],
  verification: VerificationState = {},
): QualificationReport {
  const gates: EligibilityGate[] = [];
  const permissions = [...missingPermissions];
  function field(
    id: string,
    label: string,
    predicate: (value: unknown) => boolean,
    action: string,
    historical = false,
  ) {
    const evidence = provenance.filter((item) => item.field === id);
    const accepted = evidence.find((item) => item.accepted);
    const conflict =
      decision.missingVerificationRequirements.some((reason) =>
        reason.includes(`Conflicting ${id}`),
      ) || evidence.some((item) => /Conflicting evidence/.test(item.explanation));
    const positiveBlock =
      historical &&
      !["lastOutboundAt", "outreachHistoryComplete"].includes(id) &&
      evidence.some((item) => item.value === true && item.freshness !== "INVALID");
    const authoritative =
      !historical || (accepted && hasHistoricalAuthority(accepted.authority, id, now));
    const proven = !!accepted && accepted.freshness === "FRESH" && !conflict;
    let state: EligibilityGate["state"] = positiveBlock
      ? "BLOCKED"
      : !proven || !authoritative
        ? "UNKNOWN"
        : predicate(accepted.value)
          ? "CLEAR"
          : "BLOCKED";
    if (id === "outreachHistoryComplete" && accepted?.value !== true) state = "UNKNOWN";
    // An observed recent send blocks even if the provider cannot establish the absolute latest send.
    if (
      id === "lastOutboundAt" &&
      accepted &&
      typeof accepted.value === "string" &&
      Number.isFinite(Date.parse(accepted.value)) &&
      addCalendarMonths(new Date(accepted.value), 4) > now
    )
      state = "BLOCKED";
    if (
      id === "emailVerification" &&
      accepted &&
      (accepted.value as Record<string, unknown>).status === "UNKNOWN"
    )
      state = "UNKNOWN";
    if (id === "paidSearchResponsibility" && accepted?.value === "UNKNOWN") state = "UNKNOWN";
    if (
      id === "lastOutboundAt" &&
      accepted?.value !== null &&
      accepted &&
      (typeof accepted.value !== "string" ||
        parseTimestamp(accepted.value) === null ||
        parseTimestamp(accepted.value)! > now.getTime())
    )
      state = "UNKNOWN";
    const resolution: EligibilityGate["resolution"] = conflict
      ? "CONFLICT"
      : state === "UNKNOWN"
        ? historical
          ? "UNRESOLVED_PROVIDER"
          : evidence.some((item) => item.freshness === "STALE")
            ? "STALE"
            : "MISSING_EVIDENCE"
        : "VERIFIED";
    gates.push({
      id,
      label,
      state,
      resolution,
      reason:
        state === "CLEAR"
          ? "Fresh, source-backed evidence satisfies this gate"
          : state === "BLOCKED"
            ? `${label}: evidence does not satisfy the policy`
            : historical
              ? `${label}: provider coverage, permissions, identity or freshness is not authoritative`
              : `${label}: current independent/source-backed evidence is missing, conflicting or stale`,
      nextAction: state === "CLEAR" ? "Keep evidence current" : action,
      evidence,
      checkedAt: accepted?.verifiedAt ?? null,
    });
  }
  gates.push({
    id: "owner",
    label: "Authorized HubSpot owner",
    state:
      contact.ownerId !== SIGNAL_HUBSPOT_OWNER_ID
        ? "BLOCKED"
        : parseTimestamp(contact.observedAt) === null ||
            Date.parse(contact.observedAt) > now.getTime() ||
            now.getTime() - Date.parse(contact.observedAt) > 30 * 86400000
          ? "UNKNOWN"
          : "CLEAR",
    resolution: "VERIFIED",
    reason: `HubSpot owner ${contact.ownerId}`,
    nextAction: "Refresh owner-scoped HubSpot intake",
    evidence: [],
    checkedAt: contact.observedAt,
  });
  field(
    "employeeCount",
    "Company size ≥80",
    (v) => typeof v === "number" && v >= MIN_EMPLOYEES,
    "Verify current company employee count",
  );
  field(
    "annualRevenueUsd",
    "Revenue ≥USD30M",
    (v) => typeof v === "number" && v >= MIN_REVENUE_USD,
    "Verify current annual revenue and USD currency",
  );
  field(
    "role",
    "Relevant senior role",
    () => !decision.reasons.some((r) => /Role is outside|Role seniority/.test(r)),
    "Independently corroborate current role and seniority",
  );
  const cmo = provenance.some(
    (p) =>
      p.field === "role" &&
      p.accepted &&
      /\b(cmo|chief marketing officer)\b/i.test(String(p.value)),
  );
  field(
    "paidSearchResponsibility",
    "Proven Search responsibility",
    (v) => v === "PROVEN",
    "Obtain sourced responsibilities; Paid Social-only is excluded",
  );
  if (
    cmo &&
    !provenance.some(
      (p) => p.field === "paidSearchResponsibility" && p.accepted && p.value === "ABSENT",
    )
  )
    Object.assign(gates.at(-1)!, {
      state: "CLEAR",
      resolution: "VERIFIED",
      reason: "Verified CMO role satisfies the existing CMO exception",
    });
  field(
    "currentEmploymentVerified",
    "Current employment independently corroborated",
    (v) => v === true,
    "Verify current employer, role and professional evidence",
  );
  field(
    "emailVerification",
    "Independent business email",
    (v) => {
      const value = v as Record<string, unknown>;
      return (
        value.status === "VALID" &&
        value.independentlyVerified === true &&
        value.emailMatchesCurrentRecord === true &&
        value.businessEmailVerified === true
      );
    },
    "Verify the current business email independently; catch-all/unknown cannot pass",
  );
  field(
    "lastOutboundAt",
    "Four-calendar-month cooldown",
    (v) => v === null || (typeof v === "string" && addCalendarMonths(new Date(v), 4) <= now),
    "Connect authoritative all-user outbound history across HubSpot and Outreach",
    true,
  );
  for (const [id, label] of [
    ["unsubscribed", "Unsubscribe / opt-out"],
    ["hardBounced", "Hard bounce"],
    ["complained", "Spam complaint"],
    ["activeSequence", "Active sequence"],
    ["conflictingActiveOpportunity", "Conflicting active opportunity"],
  ])
    field(
      id,
      label,
      (v) => v === false,
      `Resolve ${label.toLowerCase()} with authoritative current provider evidence`,
      true,
    );
  field(
    "outreachHistoryComplete",
    "Historical coverage",
    (v) => v === true,
    "Obtain complete identity-matched history, scope, retention and all-user coverage evidence",
    true,
  );
  if (blockers.length || missingPermissions.length)
    gates.push({
      id: "integrationEvidence",
      label: "Integration / evidence consistency",
      state: "UNKNOWN",
      resolution: "UNRESOLVED_PROVIDER",
      reason: [...blockers, ...missingPermissions].join("; "),
      nextAction: "Resolve diagnostics and refresh the affected read-only synchronization",
      evidence: [],
      checkedAt: null,
    });
  for (const kind of ["EMAIL", "EMPLOYMENT"] as const) {
    const attempt = verification[kind];
    if (!attempt) continue;
    if (attempt.message === "PERMISSION_MISSING")
      permissions.push(
        `${attempt.providerId}: authorized ${kind.toLowerCase()} verification access required`,
      );
    const mismatch = !sameVerificationIdentity(attempt.identity, contact);
    const stale =
      attempt.result?.status === "STALE" ||
      (!!attempt.result &&
        now.getTime() - Date.parse(attempt.result.proof.checkedAt) > 30 * 86400000);
    if (mismatch || stale || attempt.state !== "COMPLETED") {
      for (const gate of gates.filter(
        (gate) =>
          (kind === "EMAIL"
            ? ["emailVerification"]
            : ["currentEmploymentVerified", "role", "paidSearchResponsibility"]
          ).includes(gate.id) && gate.state !== "BLOCKED",
      )) {
        gate.state = "UNKNOWN";
        if (attempt.message === "PERMISSION_MISSING")
          gate.nextAction = `Repair ${attempt.providerId} verification credentials/permissions, then retry`;

        gate.resolution = stale
          ? "STALE"
          : attempt.state === "UNRESOLVED_PROVIDER"
            ? "UNRESOLVED_PROVIDER"
            : "MISSING_EVIDENCE";
        gate.reason = `${gate.label}: ${mismatch ? "identity/source changed; reverify" : stale ? "verification is stale" : attempt.message}`;
      }
    }
  }
  const status =
    decision.status === "REJECTED"
      ? "REJECTED"
      : decision.status !== "READY" || gates.some((gate) => gate.state !== "CLEAR")
        ? "HOLD"
        : "ELIGIBLE";
  return {
    status,
    evaluatedAt: now.toISOString(),
    approved: false,
    gates,
    holdReasons: [
      ...new Set([
        ...decision.missingVerificationRequirements,
        ...gates.filter((g) => g.state !== "CLEAR").map((g) => g.reason),
      ]),
    ],
    missingPermissions: [...new Set(permissions)],
    nextActions: [...new Set(gates.filter((g) => g.state !== "CLEAR").map((g) => g.nextAction))],
  };
}
