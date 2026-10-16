/**
 * Deterministic, fail-closed qualification gate for Signal Sales Copilot.
 * This module does not fetch provider data, write to a CRM, or send messages.
 * Adapters must provide independently verified evidence and timestamps.
 */
export const SIGNAL_HUBSPOT_OWNER_ID = "1087915602";
export const MAX_EVIDENCE_AGE_DAYS = 30;
export const MIN_EMPLOYEES = 80;
export const MIN_REVENUE_USD = 30_000_000;

export type Evidence<T> = {
  value: T;
  source: string;
  verifiedAt: string;
};

export type EmailVerification = {
  status: "VALID" | "INVALID" | "CATCH_ALL" | "UNKNOWN";
  independentlyVerified: boolean;
  emailMatchesCurrentRecord: boolean;
  businessEmailVerified?: boolean;
};

export type SearchResponsibility = "PROVEN" | "ABSENT" | "UNKNOWN";

export type ProspectQualificationInput = {
  hubspotRecordId?: string;
  hubspotOwnerId?: string;
  employeeCount?: Evidence<number>;
  annualRevenueUsd?: Evidence<number>;
  role?: Evidence<string>;
  paidSearchResponsibility?: Evidence<SearchResponsibility>;
  currentEmploymentVerified?: Evidence<boolean>;
  emailVerification?: Evidence<EmailVerification>;
  lastOutboundAt?: Evidence<string | null>;
  outreachHistoryComplete?: boolean;
  eligibilityEvidence?: Evidence<boolean>;
  employmentIndependentlyVerified?: boolean;
  unsubscribed?: boolean;
  hardBounced?: boolean;
  complained?: boolean;
  activeSequence?: boolean;
  conflictingActiveOpportunity?: boolean;
};

export type QualificationDecision = {
  status: "READY" | "HOLD" | "REJECTED";
  reasons: string[];
  nextActions: string[];
  hubspotRecordId?: string;
  missingVerificationRequirements: string[];
};

/** Evidence expires after 30 days; provider adapters must refresh it before reuse. */
function isValidEvidence<T>(evidence: Evidence<T> | undefined, now: Date): evidence is Evidence<T> {
  if (!evidence || typeof evidence.source !== "string" || !evidence.source.trim()) return false;
  const timestamp = parseTimestamp(evidence.verifiedAt);
  return (
    timestamp !== null &&
    timestamp <= now.getTime() &&
    now.getTime() - timestamp <= MAX_EVIDENCE_AGE_DAYS * 86_400_000
  );
}

/** Require an explicit timezone and a real calendar date, never locale-dependent parsing. */
export function parseTimestamp(value: string): number | null {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  )
    return null;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate())
    return null;
  const [hour, minute, second] = value.slice(11, 19).split(":").map(Number);
  if (hour > 23 || minute > 59 || second > 59) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function addCalendarMonths(date: Date, months: number): Date {
  const target = new Date(date);
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return target;
}

function classifyRole(
  role: string,
): "RELEVANT" | "IRRELEVANT" | "NEEDS_SEARCH_PROOF" | "AMBIGUOUS" {
  const normalized = role.toLowerCase().replace(/[-–—/]+/g, " ");
  if (/^(unknown|n\/a|not available|not provided|tbd)$/.test(role.trim().toLowerCase()))
    return "AMBIGUOUS";
  if (/\b(assistant|intern|junior|former|fractional|consultant)\b/.test(normalized))
    return "AMBIGUOUS";
  if (
    /paid social|social media|\bseo\b|organic search/.test(normalized) &&
    !/paid search|\bppc\b|\bsem\b|search engine marketing/.test(normalized)
  ) {
    return "IRRELEVANT";
  }
  const senior = /\b(head|director|vp|vice president|chief|cmo|lead)\b/.test(normalized);
  if (
    /\b(cmo|chief marketing officer|vp (?:of )?marketing|vice president (?:of )?marketing)\b/.test(
      normalized,
    )
  ) {
    return "RELEVANT";
  }
  if (/paid search|\bppc\b|\bsem\b|search engine marketing/.test(normalized)) {
    return senior ? "RELEVANT" : "AMBIGUOUS";
  }
  if (/growth|performance|acquisition|marketing|advertising|\bsearch\b/.test(normalized)) {
    return senior && /growth|performance/.test(normalized) ? "NEEDS_SEARCH_PROOF" : "AMBIGUOUS";
  }
  return "IRRELEVANT";
}

export function qualifyProspect(
  input: ProspectQualificationInput,
  now: Date = new Date(),
): QualificationDecision {
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid qualification clock");
  const rejected: string[] = [];
  const hold: string[] = [];
  const actions = new Set<string>();
  const block = (reason: string, action: string) => {
    hold.push(reason);
    actions.add(action);
  };
  if (!input.hubspotRecordId?.trim()) block("Missing HubSpot record ID", "Verify HubSpot identity");
  if (!input.hubspotOwnerId) block("Missing HubSpot owner", "Verify contact owner");
  else if (input.hubspotOwnerId !== SIGNAL_HUBSPOT_OWNER_ID) {
    rejected.push("Contact is not owned by the authorized HubSpot owner");
  }

  if (!isValidEvidence(input.employeeCount, now))
    block("Employee count not verified", "Verify employee count");
  else if (!Number.isFinite(input.employeeCount.value))
    block("Employee count unknown", "Verify employee count");
  else if (input.employeeCount.value < MIN_EMPLOYEES) {
    rejected.push("Company has fewer than 80 verified employees");
  }
  if (!isValidEvidence(input.annualRevenueUsd, now))
    block("Annual revenue not verified", "Verify annual revenue");
  else if (!Number.isFinite(input.annualRevenueUsd.value))
    block("Annual revenue unknown", "Verify annual revenue");
  else if (input.annualRevenueUsd.value < MIN_REVENUE_USD) {
    rejected.push("Company annual revenue is below USD 30M");
  }

  if (input.paidSearchResponsibility && !isValidEvidence(input.paidSearchResponsibility, now)) {
    block(
      "Paid-search responsibility evidence is stale or invalid",
      "Verify paid-search responsibilities",
    );
  }

  if (!isValidEvidence(input.role, now)) block("Role not verified", "Verify current job title");
  else if (!input.role.value.trim()) block("Role is empty", "Verify current job title");
  else {
    const roleClass = classifyRole(input.role.value);
    if (roleClass === "IRRELEVANT") rejected.push("Role is outside the senior paid-search ICP");
    else if (roleClass === "AMBIGUOUS")
      block("Role seniority or remit is ambiguous", "Verify seniority and paid-search remit");
    else if (
      isValidEvidence(input.paidSearchResponsibility, now) &&
      input.paidSearchResponsibility.value === "ABSENT"
    ) {
      rejected.push("Role has no paid-search responsibility");
    } else if (!/\b(cmo|chief marketing officer)\b/i.test(input.role.value)) {
      if (
        !isValidEvidence(input.paidSearchResponsibility, now) ||
        !["PROVEN", "ABSENT"].includes(input.paidSearchResponsibility.value)
      ) {
        block("Paid-search ownership is not established", "Verify paid-search responsibilities");
      }
    }
  }

  if (
    input.employmentIndependentlyVerified !== true ||
    !isValidEvidence(input.currentEmploymentVerified, now) ||
    input.currentEmploymentVerified.value !== true
  ) {
    block("Current employment is not independently verified", "Verify current employment");
  }

  if (
    !isValidEvidence(input.emailVerification, now) ||
    /boring/i.test(input.emailVerification.source) ||
    input.emailVerification.value.businessEmailVerified !== true ||
    input.emailVerification.value.independentlyVerified !== true ||
    input.emailVerification.value.emailMatchesCurrentRecord !== true ||
    input.emailVerification.value.status !== "VALID"
  ) {
    block(
      "Business email lacks current independent VALID verification",
      "Independently verify current email",
    );
  }

  if (
    !isValidEvidence(input.eligibilityEvidence, now) ||
    input.eligibilityEvidence.value !== true
  ) {
    block(
      "Eligibility snapshot missing or stale",
      "Refresh suppression, sequence, opportunity and Outreach history checks",
    );
  }

  for (const [flag, reason] of [
    [input.unsubscribed, "Unsubscribed"],
    [input.hardBounced, "Hard bounce"],
    [input.complained, "Spam complaint"],
  ] as const) {
    if (flag === true) rejected.push(reason);
    else if (flag !== false) block(reason + " status unknown", "Check suppression status");
  }
  for (const [flag, reason] of [
    [input.activeSequence, "Active outreach sequence"],
    [input.conflictingActiveOpportunity, "Conflicting active opportunity"],
  ] as const) {
    if (flag === true) block(reason, "Resolve outreach/CRM conflict");
    else if (flag !== false) block(reason + " status unknown", "Verify outreach/CRM status");
  }

  if (input.outreachHistoryComplete !== true) {
    block("Outreach history incomplete", "Connect or verify full Outreach history");
  }
  if (!isValidEvidence(input.lastOutboundAt, now)) {
    block("Last outbound date unverified", "Verify last outbound date");
  } else if (input.lastOutboundAt.value !== null) {
    const timestamp = parseTimestamp(input.lastOutboundAt.value);
    const sentAt = new Date(timestamp ?? NaN);
    if (timestamp === null || sentAt.getTime() > now.getTime()) {
      block("Invalid last outbound date", "Verify last outbound timestamp");
    } else if (addCalendarMonths(sentAt, 4).getTime() > now.getTime()) {
      block(
        "Less than four calendar months since last outbound",
        "Wait until reengagement window opens",
      );
    }
  }

  const status = rejected.length ? "REJECTED" : hold.length ? "HOLD" : "READY";
  return {
    status,
    reasons:
      status === "READY"
        ? [
            "Authorized owner, company thresholds, senior role, employment, business email, suppression and Outreach eligibility checks passed",
          ]
        : [...rejected, ...hold],
    missingVerificationRequirements: [...hold],
    nextActions: [...actions],
    hubspotRecordId: input.hubspotRecordId,
  };
}
