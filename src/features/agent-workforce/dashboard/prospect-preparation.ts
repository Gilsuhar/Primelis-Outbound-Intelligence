import { z } from "zod";
import type { DailyReviewRow } from "@/server/services/sales-agent-collection-service";
import type { AutomaticCompanyResult } from "../company-research/internal-review";
import {
  internalContactDraftContextSchema,
  type InternalContactDraftContext,
} from "../company-research/internal-review";
import { isInOwnedIntakeScope } from "@/features/sales-agent/intake-scope";
import { addCalendarMonths } from "@/features/sales-agent/qualification";
import { sameVerificationIdentity } from "@/features/sales-agent/verification/contracts";

// Stored in the existing evidence snapshot; never contact/outbound approval.
export const preparationReceiptSchema = z
  .object({
    batchId: z.string().uuid(),
    companyDomain: z.string().min(1).max(240),
    state: z.enum(["PREPARING", "REVIEW_REQUIRED", "BLOCKED"]),
    startedAt: z.string().datetime(),
    finishedAt: z.string().datetime().optional(),
    documentId: z.string().uuid().optional(),
    reason: z.string().max(500),
  })
  .strict();
export type PreparationReceipt = z.infer<typeof preparationReceiptSchema>;

export const preparationAttemptSchema = z
  .object({
    attemptId: z.string().uuid(),
    companyDomain: z.string().min(1).max(240),
    paidAuthorized: z.boolean(),
    stage: z.enum(["PLAN", "PREFLIGHT", "OUTREACH_CHECK", "CLAIM", "WRITING_REVIEW", "COMPLETE"]),
    outcome: z.enum(["STARTED", "NOT AUTHORIZED", "BLOCKED", "COMPLETED"]),
    submittedAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    failureCode: z
      .enum([
        "PREPARATION_AI_NOT_READY",
        "PREPARATION_ALREADY_ATTEMPTED",
        "PREPARATION_CLAIM_FAILED",
        "PREPARATION_CONTACT_NOT_AVAILABLE",
        "PREPARATION_EVIDENCE_UNAVAILABLE",
        "PREPARATION_IDENTITY_CHANGED",
        "PREPARATION_INCOMPLETE",
        "PREPARATION_INCREMENTAL_ESTIMATE_UNAVAILABLE",
        "PREPARATION_INTAKE_FAILED",
        "PREPARATION_UNAVAILABLE",
      ])
      .nullable(),
    actualCalls: z.number().int().nonnegative().nullable(),
    actualEstimatedUsd: z.number().finite().nonnegative().nullable(),
    documentId: z.string().uuid().optional(),
  })
  .strict();
export type PreparationAttempt = z.infer<typeof preparationAttemptSchema>;

export type PreparationItem = {
  contactId: string;
  name: string;
  company: string;
  domain: string;
  priorityReason: string;
  eligibility: string;
  holdReasons: string[];
  eligibilityChecks: Array<{
    id: string;
    label: string;
    state: "CLEAR" | "BLOCKED" | "UNKNOWN";
    reason: string;
    evidence?: Array<{
      provider: string;
      sourceRecordId: string;
      freshness: string;
      accepted: boolean;
      observedAt: string;
      verifiedAt: string | null;
      value: string | boolean | null;
      coverage?: {
        state: string;
        checkedAt: string;
        through: string;
        identityMatched: boolean;
        permissionsVerified: boolean;
        allUserHistory: boolean;
        retentionComplete: boolean;
      };
    }>;
  }>;
  lastOutbound: string;
  outreach: string;
  contactDraftContext: InternalContactDraftContext;
  action: "REUSE_PACKET" | "REUSE_RESEARCH" | "RESEARCH" | "BLOCKED";
  maxCalls: number;
  /** Prior writer + reviewer usage, used only as an incremental estimate for a REVISE continuation. */
  estimatedIncrementalUsd?: number | null;
  /** When true, paid confirmation requires a usable historical estimate. */
  requiresIncrementalEstimate?: boolean;
  reason: string;
  documentId?: string;
  createdAt?: string;
  result?: AutomaticCompanyResult;
  receipt?: PreparationReceipt;
  latestAttempt?: PreparationAttempt;
};

export type PreparationActionOutcome = "NOT AUTHORIZED" | "STARTED" | "BLOCKED" | "COMPLETED";
export type PreparationActionReport = {
  paidAuthorized: boolean;
  outcome: PreparationActionOutcome;
  companies: string[];
  maxCalls: number;
  maxEstimatedUsd: number | null;
  actualCalls: number | null;
  actualEstimatedUsd: number | null;
};

function redactContactDetails(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email withheld]")
    .replace(/(?<!\w)\+?\d[\d\s().-]{7,}\d(?!\w)/g, "[phone withheld]")
    .slice(0, 1000);
}

/** Minimal contact context for internal drafting; never includes an email address. */
export function buildInternalContactDraftContext(row: DailyReviewRow): InternalContactDraftContext {
  const contact = row.contact;
  const gates = row.qualification.gates;
  const isClear = (id: string) => gates.find((gate) => gate.id === id)?.state === "CLEAR";
  const acceptedFresh = row.provenance.filter(
    (item) =>
      item.hubspotRecordId === contact.hubspotRecordId &&
      item.accepted &&
      item.freshness === "FRESH" &&
      !!item.sourceRecordId,
  );
  const employment = acceptedFresh.find(
    (item) =>
      item.field === "currentEmploymentVerified" &&
      item.value === true &&
      item.independent &&
      ["ZOOMINFO", "INDEPENDENT_VERIFICATION"].includes(item.provider) &&
      item.subjectCompanyDomain?.toLowerCase() === contact.companyDomain?.toLowerCase(),
  );
  const employmentResult = row.verification.EMPLOYMENT?.result;
  const employmentVerification = employmentResult?.kind === "EMPLOYMENT" ? employmentResult : null;
  const checkedAt = employmentVerification?.proof.checkedAt;
  const checkedMillis = checkedAt ? Date.parse(checkedAt) : NaN;
  const reviewMillis = Date.parse(row.evaluatedAt);
  const verifiedEmploymentResult =
    row.verification.EMPLOYMENT?.state === "COMPLETED" &&
    employmentVerification &&
    employmentVerification.status === "VERIFIED" &&
    employmentVerification.current &&
    employmentVerification.proof.independent &&
    employmentVerification.employerDomain.toLowerCase() === contact.companyDomain?.toLowerCase() &&
    sameVerificationIdentity(employmentVerification.identity, contact) &&
    Number.isFinite(checkedMillis) &&
    reviewMillis >= checkedMillis &&
    reviewMillis - checkedMillis <= 30 * 86400000
      ? employmentVerification
      : null;
  const employmentVerified =
    isClear("currentEmploymentVerified") && (!!employment || !!verifiedEmploymentResult);
  const facts: InternalContactDraftContext["verifiedPersonalizationFacts"] = [];
  const role = acceptedFresh.find(
    (item) => item.field === "role" && typeof item.value === "string",
  );
  if (employmentVerified && role && isClear("role"))
    facts.push({
      evidenceId: role.sourceRecordId,
      field: "role",
      statement: `Current role: ${String(role.value).slice(0, 300)}`,
      source: role.provider,
      observedAt: role.observedAt,
      supportingEvidence: role.supportingEvidence.map(redactContactDetails),
    });
  else if (employmentVerified && verifiedEmploymentResult && isClear("role"))
    facts.push({
      evidenceId: verifiedEmploymentResult.proof.sourceRecordId,
      field: "role",
      statement: `Current role: ${verifiedEmploymentResult.role}`,
      source: verifiedEmploymentResult.proof.providerId,
      observedAt: verifiedEmploymentResult.proof.checkedAt,
      supportingEvidence: verifiedEmploymentResult.proof.evidence.map(redactContactDetails),
    });
  const responsibility = acceptedFresh.find(
    (item) => item.field === "paidSearchResponsibility" && item.value === "PROVEN",
  );
  if (employmentVerified && responsibility && isClear("paidSearchResponsibility"))
    facts.push({
      evidenceId: responsibility.sourceRecordId,
      field: "paidSearchResponsibility",
      statement: "Paid Search responsibility is independently supported.",
      source: responsibility.provider,
      observedAt: responsibility.observedAt,
      supportingEvidence: responsibility.supportingEvidence.map(redactContactDetails),
    });
  else if (
    employmentVerified &&
    verifiedEmploymentResult?.searchResponsibility === "PROVEN" &&
    verifiedEmploymentResult.responsibilityScope !== "PAID_SOCIAL_ONLY" &&
    isClear("paidSearchResponsibility")
  )
    facts.push({
      evidenceId: verifiedEmploymentResult.proof.sourceRecordId,
      field: "paidSearchResponsibility",
      statement: "Paid Search responsibility is independently supported.",
      source: verifiedEmploymentResult.proof.providerId,
      observedAt: verifiedEmploymentResult.proof.checkedAt,
      supportingEvidence: verifiedEmploymentResult.responsibilityEvidence.map(redactContactDetails),
    });
  const unresolved: string[] = [];
  if (!employmentVerified)
    unresolved.push("Current employment at this company is not independently verified.");
  if (!role || !isClear("role")) unresolved.push("Current title and role are unresolved.");
  if (!responsibility || !isClear("paidSearchResponsibility"))
    unresolved.push("Actual Paid Search responsibility is unresolved.");
  if (isClear("emailVerification") === false)
    unresolved.push(
      "Business email validity is unresolved; no email address is supplied to the writer.",
    );
  const displayName = redactContactDetails(contact.fullName)
    .replace(/\[email withheld\]|\[phone withheld\]/g, "")
    .trim()
    .slice(0, 180);
  return internalContactDraftContextSchema.parse({
    contactId: contact.hubspotRecordId,
    displayName: displayName || "HubSpot contact",
    companyName: contact.companyName ?? contact.companyDomain ?? "Unknown company",
    companyDomain: contact.companyDomain ?? "",
    verifiedPersonalizationFacts: facts,
    unresolved,
    eligibility: "HOLD",
    outboundReady: false,
  });
}

/** Compact display of existing verified gates; this never changes qualification. */
export function summarizePreparationEligibility(row: DailyReviewRow) {
  const gates = row.qualification.gates;
  const historyComplete =
    gates.find((gate) => gate.id === "outreachHistoryComplete")?.state === "CLEAR";
  const acceptedOutbound = row.provenance.filter(
    (item) =>
      item.field === "lastOutboundAt" &&
      item.accepted &&
      item.freshness === "FRESH" &&
      (typeof item.value === "string" || item.value === null),
  );
  const latestDate = acceptedOutbound
    .filter((item): item is typeof item & { value: string } => typeof item.value === "string")
    .map((item) => item.value)
    .filter((value) => Number.isFinite(Date.parse(value)))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  const verifiedNoOutbound =
    historyComplete && acceptedOutbound.some((item) => item.value === null);

  return {
    eligibilityChecks: gates.map(({ id, label, state, reason, evidence }) => ({
      id,
      label,
      state,
      reason,
      evidence: evidence.map((item) => ({
        provider: item.provider,
        sourceRecordId: item.sourceRecordId,
        freshness: item.freshness,
        accepted: item.accepted,
        observedAt: item.observedAt,
        verifiedAt: item.verifiedAt,
        value:
          item.value === null || typeof item.value === "boolean" || typeof item.value === "string"
            ? item.value
            : null,
        ...(item.authority
          ? {
              coverage: {
                state: item.authority.state,
                checkedAt: item.authority.checkedAt,
                through: item.authority.through,
                identityMatched: item.authority.identityMatched,
                permissionsVerified: item.authority.permissionsVerified,
                allUserHistory: item.authority.allUserHistory,
                retentionComplete: item.authority.retentionComplete,
              },
            }
          : {}),
      })),
    })),
    lastOutbound: latestDate
      ? latestDate.slice(0, 10)
      : verifiedNoOutbound
        ? "None found in complete verified coverage"
        : "Unknown — Outreach history coverage is incomplete or unresolved",
  };
}
export type PreparationPlan = {
  considered: number;
  items: PreparationItem[];
  excluded: { contactId: string; reason: string }[];
  warnings: string[];
  aiReady: boolean;
  budget: {
    dayRemaining: number;
    monthRemaining: number;
    pending: number;
    uncertain: number;
  } | null;
  maxCalls: number;
  /** Conservative ceiling: remaining application daily/monthly estimate, not provider billing. */
  maxEstimatedUsd: number | null;
  newCalls?: number;
  newEstimatedUsd?: number;
  batchId?: string;
  lastAction?: PreparationActionReport;
};

export function preparationDomain(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(url.hostname)
    )
      return null;
    return url.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Relevance is prioritization only. Never promote a title signal to verified responsibility. */
export function prioritizePreparation(rows: DailyReviewRow[], now: Date) {
  const excluded: PreparationPlan["excluded"] = [];
  const seen = new Set<string>();
  const ranked = rows
    .flatMap((row) => {
      const id = row.contact.hubspotRecordId;
      if (seen.has(id)) return [];
      seen.add(id);
      const domain = preparationDomain(row.contact.companyDomain);
      const role = row.provenance
        .filter((p) => p.field === "role" && typeof p.value === "string")
        .map((p) => String(p.value))
        .join(" ");
      const explicitSearch = /\b(search|sem|sea|ppc|cmo)\b|chief marketing officer/i.test(role);
      const broader = /\b(performance|growth|digital marketing|paid media)\b/i.test(role);
      const socialOnly = /paid social|social media/i.test(role) && !explicitSearch && !broader;
      const knownBlock = row.provenance.find(
        (p) =>
          p.freshness !== "INVALID" &&
          (([
            "unsubscribed",
            "hardBounced",
            "complained",
            "activeSequence",
            "conflictingActiveOpportunity",
          ].includes(p.field) &&
            p.value === true) ||
            (p.field === "accountSuppression" && typeof p.value === "string") ||
            (p.field === "lastOutboundAt" &&
              typeof p.value === "string" &&
              Number.isFinite(Date.parse(p.value)) &&
              addCalendarMonths(new Date(p.value), 4) > now)),
      );
      const reason = !isInOwnedIntakeScope(row.contact)
        ? "Outside authorized owner-scoped intake"
        : row.qualification.gates.find((g) => g.id === "owner")?.state !== "CLEAR"
          ? "Refresh stale or uncertain HubSpot ownership evidence"
          : knownBlock
            ? `Known exclusion or recent activity: ${knownBlock.field}`
            : row.plan.decision.status === "REJECTED"
              ? row.plan.decision.reasons.join("; ")
              : !domain
                ? "Company domain missing or ambiguous"
                : socialOnly || (!explicitSearch && !broader)
                  ? "No relevant CRM role signal for this bounded batch"
                  : null;
      if (reason) {
        excluded.push({ contactId: id, reason });
        return [];
      }
      const priorTargeted =
        !!row.contact.outreachProspectId ||
        row.provenance.some((p) => p.field === "lastOutboundAt" && typeof p.value === "string");
      return [
        {
          row,
          domain: domain!,
          score: (explicitSearch ? 100 : 60) + (priorTargeted ? 10 : 0),
          priorityReason: `${explicitSearch ? "Search/SEM/PPC/CMO" : "Performance/Growth/Digital"} CRM role signal${priorTargeted ? "; prior targeting evidence" : ""}. Responsibility still requires verification.`,
        },
      ];
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.row.contact.hubspotRecordId.localeCompare(b.row.contact.hubspotRecordId),
    );
  const companies = new Set<string>();
  const selected = ranked
    .filter((item) => {
      if (companies.has(item.domain)) {
        excluded.push({
          contactId: item.row.contact.hubspotRecordId,
          reason: "Same company already represented; no duplicate research",
        });
        return false;
      }
      companies.add(item.domain);
      return true;
    })
    .slice(0, 5);
  return { considered: seen.size, selected, excluded };
}
