/**
 * Deterministic, fail-closed qualification gate for Signal Sales Copilot.
 * This module does not fetch provider data, write to a CRM, or send messages.
 * Adapters must provide independently verified evidence and timestamps.
 */
export const SIGNAL_HUBSPOT_OWNER_ID = "1087915602";
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
};

function isValidEvidence<T>(evidence: Evidence<T> | undefined): evidence is Evidence<T> {
  return Boolean(
    evidence &&
      evidence.source.trim() &&
      evidence.verifiedAt &&
      !Number.isNaN(Date.parse(evidence.verifiedAt)),
  );
}

function subtractCalendarMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const targetFirst = new Date(Date.UTC(year, month - months, 1));
  const lastDay = new Date(
    Date.UTC(targetFirst.getUTCFullYear(), targetFirst.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return new Date(
    Date.UTC(
      targetFirst.getUTCFullYear(),
      targetFirst.getUTCMonth(),
      Math.min(day, lastDay),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

function classifyRole(role: string): "RELEVANT" | "IRRELEVANT" | "NEEDS_SEARCH_PROOF" {
  const normalized = role.toLowerCase();
  if (/paid social|social media|\bseo\b|organic search/.test(normalized) &&
      !/paid search|\bppc\b|\bsem\b|search engine marketing/.test(normalized)) {
    return "IRRELEVANT";
  }
  const senior = /\b(head|director|vp|vice president|chief|cmo|lead|senior|manager)\b/.test(normalized);
  if (/\b(cmo|chief marketing officer|vp marketing|vice president marketing)\b/.test(normalized)) {
    return "RELEVANT";
  }
  if (/paid search|\bppc\b|\bsem\b|search engine marketing/.test(normalized)) {
    return senior ? "RELEVANT" : "NEEDS_SEARCH_PROOF";
  }
  if (/growth|performance|acquisition|marketing/.test(normalized)) {
    return senior ? "NEEDS_SEARCH_PROOF" : "IRRELEVANT";
  }
  return "IRRELEVANT";
}

export function qualifyProspect(
  input: ProspectQualificationInput,
  now: Date = new Date(),
): QualificationDecision {
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

  if (!isValidEvidence(input.employeeCount)) block("Employee count not verified", "Verify employee count");
  else if (!Number.isFinite(input.employeeCount.value) || input.employeeCount.value < MIN_EMPLOYEES) {
    rejected.push("Company has fewer than 80 verified employees");
  }
  if (!isValidEvidence(input.annualRevenueUsd)) block("Annual revenue not verified", "Verify annual revenue");
  else if (!Number.isFinite(input.annualRevenueUsd.value) || input.annualRevenueUsd.value < MIN_REVENUE_USD) {
    rejected.push("Company annual revenue is below USD 30M");
  }

  if (!isValidEvidence(input.role)) block("Role not verified", "Verify current job title");
  else {
    const roleClass = classifyRole(input.role.value);
    if (roleClass === "IRRELEVANT") rejected.push("Role is outside the senior paid-search ICP");
    else if (roleClass === "NEEDS_SEARCH_PROOF") {
      if (!isValidEvidence(input.paidSearchResponsibility) ||
          input.paidSearchResponsibility.value === "UNKNOWN") {
        block("Paid-search ownership is not established", "Verify paid-search responsibilities");
      } else if (input.paidSearchResponsibility.value === "ABSENT") {
        rejected.push("Role has no paid-search responsibility");
      }
    }
  }

  if (!isValidEvidence(input.currentEmploymentVerified) ||
      input.currentEmploymentVerified.value !== true) {
    block("Current employment is not independently verified", "Verify current employment");
  }

  if (!isValidEvidence(input.emailVerification) ||
      !input.emailVerification.value.independentlyVerified ||
      !input.emailVerification.value.emailMatchesCurrentRecord ||
      input.emailVerification.value.status !== "VALID") {
    block("Business email lacks current independent VALID verification", "Independently verify current email");
  }

  for (const [flag, reason] of [
    [input.unsubscribed, "Unsubscribed"],
    [input.hardBounced, "Hard bounce"],
    [input.complained, "Spam complaint"],
  ] as const) {
    if (flag === true) rejected.push(reason);
    else if (flag === undefined) block(reason + " status unknown", "Check suppression status");
  }
  for (const [flag, reason] of [
    [input.activeSequence, "Active outreach sequence"],
    [input.conflictingActiveOpportunity, "Conflicting active opportunity"],
  ] as const) {
    if (flag === true) block(reason, "Resolve outreach/CRM conflict");
    else if (flag === undefined) block(reason + " status unknown", "Verify outreach/CRM status");
  }

  if (!input.outreachHistoryComplete) {
    block("Outreach history incomplete", "Connect or verify full Outreach history");
  }
  if (!isValidEvidence(input.lastOutboundAt)) {
    block("Last outbound date unverified", "Verify last outbound date");
  } else if (input.lastOutboundAt.value !== null) {
    const sentAt = new Date(input.lastOutboundAt.value);
    if (Number.isNaN(sentAt.getTime()) || sentAt.getTime() > now.getTime()) {
      block("Invalid last outbound date", "Verify last outbound timestamp");
    } else if (sentAt.getTime() > subtractCalendarMonths(now, 4).getTime()) {
      block("Less than four calendar months since last outbound", "Wait until reengagement window opens");
    }
  }

  const status = rejected.length ? "REJECTED" : hold.length ? "HOLD" : "READY";
  return {
    status,
    reasons: [...rejected, ...hold],
    nextActions: [...actions],
    hubspotRecordId: input.hubspotRecordId,
  };
}
