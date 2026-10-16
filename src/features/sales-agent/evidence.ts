import { z } from "zod";
import { historyAuthoritySchema, hasHistoricalAuthority } from "./history-authority";
import { identitySchema, sameVerificationIdentity } from "./verification/contracts";

import {
  MAX_EVIDENCE_AGE_DAYS,
  parseTimestamp,
  type ProspectQualificationInput,
} from "./qualification";

export const evidenceFields = [
  "accountSuppression",
  "employeeCount",
  "annualRevenueUsd",
  "role",
  "paidSearchResponsibility",
  "currentEmploymentVerified",
  "emailVerification",
  "unsubscribed",
  "hardBounced",
  "complained",
  "activeSequence",
  "conflictingActiveOpportunity",
  "outreachHistoryComplete",
  "lastOutboundAt",
] as const;
export type EvidenceField = (typeof evidenceFields)[number];
export type ProviderId =
  | "HUBSPOT"
  | "LOCAL_SUPPRESSION"
  | "SIMILARWEB"
  | "ZOOMINFO"
  | "OUTREACH"
  | "INDEPENDENT_VERIFICATION"
  | "BORING"
  | "SURFE";
export const observationSchema = z
  .object({
    hubspotRecordId: z.string().trim().min(1).max(200),
    field: z.enum(evidenceFields),
    value: z.unknown(),
    provider: z.enum([
      "HUBSPOT",
      "LOCAL_SUPPRESSION",
      "SIMILARWEB",
      "ZOOMINFO",
      "OUTREACH",
      "INDEPENDENT_VERIFICATION",
      "BORING",
      "SURFE",
    ]),
    sourceRecordId: z.string().trim().min(1).max(300),
    sourceUrl: z.string().url().max(1000).optional(),
    observedAt: z.string().max(80),
    verifiedAt: z.string().max(80).nullable(),
    independent: z.boolean(),
    supportingEvidence: z.array(z.string().trim().min(1).max(1000)).max(20),
    authority: historyAuthoritySchema.optional(),
    subjectIdentity: identitySchema.optional(),
    subjectEmail: z.string().email().optional(),
    subjectCompanyDomain: z.string().max(240).optional(),
  })
  .strict();
export type EvidenceObservation = z.infer<typeof observationSchema>;
export type EvidenceProvenance = EvidenceObservation & {
  expiresAt: string | null;
  freshness: "FRESH" | "STALE" | "UNVERIFIED" | "INVALID";
  accepted: boolean;
  explanation: string;
};
export type IntakeContact = {
  hubspotRecordId: string;
  ownerId: string;
  fullName: string;
  email?: string;
  companyName?: string;
  companyDomain?: string;
  emailSource?: string;
  emailModifiedAt?: string;
  hubspotRecordUrl?: string;
  outreachProspectId?: string;
  hubspotCreatedAt?: string;
  ownerAssignedAt?: string;
  intakeSince?: string;
  observedAt: string;
  observations: EvidenceObservation[];
  warnings: string[];
};

const values = {
  accountSuppression: z.string().min(1),
  employeeCount: z.number().finite().int().nonnegative(),
  annualRevenueUsd: z.number().finite().nonnegative(),
  role: z.string().trim().min(1).max(300),
  paidSearchResponsibility: z.enum(["PROVEN", "ABSENT", "UNKNOWN"]),
  currentEmploymentVerified: z.boolean(),
  emailVerification: z
    .object({
      status: z.enum(["VALID", "INVALID", "CATCH_ALL", "UNKNOWN"]),
      independentlyVerified: z.boolean(),
      emailMatchesCurrentRecord: z.boolean(),
      businessEmailVerified: z.boolean(),
    })
    .strict(),
  unsubscribed: z.boolean(),
  hardBounced: z.boolean(),
  complained: z.boolean(),
  activeSequence: z.boolean(),
  conflictingActiveOpportunity: z.boolean(),
  outreachHistoryComplete: z.boolean(),
  lastOutboundAt: z.string().nullable(),
};

export function describeEvidence(observation: EvidenceObservation, now: Date): EvidenceProvenance {
  const observed = parseTimestamp(observation.observedAt);
  const verified = observation.verifiedAt === null ? null : parseTimestamp(observation.verifiedAt);
  const expires = verified === null ? null : verified + MAX_EVIDENCE_AGE_DAYS * 86_400_000;
  const invalid =
    observed === null ||
    observed > now.getTime() ||
    (observation.verifiedAt !== null && (verified === null || verified > observed!));
  const freshness = invalid
    ? "INVALID"
    : verified === null
      ? "UNVERIFIED"
      : expires! < now.getTime()
        ? "STALE"
        : "FRESH";
  return {
    ...observation,
    expiresAt: expires === null ? null : new Date(expires).toISOString(),
    freshness,
    accepted: false,
    explanation: "Not selected for qualification",
  };
}

/** Provider observations must be scoped to this contact by the server-side adapter. */
export function normalizeCollectedEvidence(
  contact: IntakeContact,
  observations: EvidenceObservation[],
  now: Date,
) {
  const input: ProspectQualificationInput = {
    hubspotRecordId: contact.hubspotRecordId,
    hubspotOwnerId: contact.ownerId,
  };
  const provenance = observations.map((item) => {
    const described = describeEvidence(item, now);
    if (item.hubspotRecordId !== contact.hubspotRecordId) {
      described.freshness = "INVALID";
      described.explanation = "Evidence belongs to another contact";
    }
    return described;
  });
  const conflicts: string[] = [];
  for (const field of evidenceFields) {
    const candidates = provenance.filter((item) => item.field === field);
    if (field === "accountSuppression") {
      for (const item of candidates) {
        if (item.freshness !== "INVALID" && typeof item.value === "string") {
          conflicts.push(`Account suppression: ${item.value} (${item.sourceRecordId})`);
          item.accepted = true;
          item.explanation = "Existing suppression block: human review required";
        }
      }
      continue;
    }
    const usable = candidates.filter((item) => {
      const value = values[field].safeParse(item.value);
      if (!value.success) {
        item.explanation = "Invalid or ambiguous value";
        return false;
      }
      if (item.freshness !== "FRESH" || item.supportingEvidence.length === 0) {
        item.explanation = `${item.freshness}: requires timestamped supporting evidence`;
        return false;
      }
      if (item.subjectIdentity && !sameVerificationIdentity(item.subjectIdentity, contact)) {
        item.explanation = "Verification identity/source changed; obtain fresh evidence";
        return false;
      }
      if (
        [
          "unsubscribed",
          "hardBounced",
          "complained",
          "activeSequence",
          "conflictingActiveOpportunity",
          "outreachHistoryComplete",
        ].includes(field) &&
        item.value === false &&
        item.authority &&
        !hasHistoricalAuthority(item.authority, field, now)
      ) {
        item.explanation = "Provider does not establish authoritative complete clearance";
        return false;
      }
      if (field === "emailVerification" || field === "currentEmploymentVerified") {
        if (
          !item.independent ||
          !["ZOOMINFO", "INDEPENDENT_VERIFICATION"].includes(item.provider)
        ) {
          item.explanation =
            "CRM field presence, Surfe enrichment and Boring green are not independent verification";
          return false;
        }
        if (
          field === "currentEmploymentVerified" &&
          (!contact.companyDomain ||
            item.subjectCompanyDomain?.toLowerCase() !== contact.companyDomain.toLowerCase())
        ) {
          item.explanation = "Employment evidence is not bound to the current company";
          return false;
        }
        if (field === "emailVerification") {
          const modified = contact.emailModifiedAt ? parseTimestamp(contact.emailModifiedAt) : null;
          if (
            !contact.email ||
            item.subjectEmail?.toLowerCase() !== contact.email.toLowerCase() ||
            modified === null ||
            parseTimestamp(item.verifiedAt!)! < modified
          ) {
            item.explanation =
              "Email mismatch or verification predates the last email edit (or edit history is unknown)";
            return false;
          }
        }
      }
      if (
        ["outreachHistoryComplete", "activeSequence"].includes(field) &&
        item.provider !== "OUTREACH"
      ) {
        item.explanation = "Requires complete Outreach evidence, not CRM last activity";
        return false;
      }
      if (
        ["unsubscribed", "hardBounced", "complained"].includes(field) &&
        item.provider !== "OUTREACH"
      ) {
        item.explanation = "Negative suppression clearance requires complete Outreach evidence";
        return false;
      }
      if (field === "conflictingActiveOpportunity" && item.provider !== "HUBSPOT") {
        item.explanation = "Opportunity clearance requires a read-only HubSpot opportunity check";
        return false;
      }
      return true;
    });
    // Positive safety blocks are never erased by a later negative or missing verification.
    const safety = [
      "unsubscribed",
      "hardBounced",
      "complained",
      "activeSequence",
      "conflictingActiveOpportunity",
    ].includes(field);
    if (
      safety &&
      candidates.some(
        (item) =>
          item.hubspotRecordId === contact.hubspotRecordId &&
          item.value === true &&
          item.freshness === "INVALID",
      )
    ) {
      conflicts.push(`Invalid positive ${field} evidence; independently recheck safety status`);
    }
    const blocked =
      safety && candidates.find((item) => item.value === true && item.freshness !== "INVALID");
    if (blocked) {
      Object.assign(input, { [field]: true });
      blocked.accepted = true;
      blocked.explanation = "Conservative safety block; reverify before clearing";
      continue;
    }
    if (field === "lastOutboundAt") {
      const dates = usable.filter(
        (item) =>
          ["HUBSPOT", "OUTREACH"].includes(item.provider) &&
          typeof item.value === "string" &&
          parseTimestamp(item.value) !== null &&
          parseTimestamp(item.value)! <= now.getTime(),
      );
      const latest = dates.sort(
        (a, b) => parseTimestamp(String(b.value))! - parseTimestamp(String(a.value))!,
      )[0];
      if (latest) {
        latest.accepted = true;
        latest.explanation = "Latest reliable outbound email across connected sources";
        input.lastOutboundAt = {
          value: latest.value as string,
          source: `${latest.provider}:${latest.sourceRecordId}`,
          verifiedAt: latest.verifiedAt!,
        };
        continue;
      }
      // A null/never-contacted assertion still requires the existing complete Outreach proof.
      usable.splice(0, usable.length, ...usable.filter((item) => item.provider === "OUTREACH"));
    }
    const canonical = (item: EvidenceProvenance) => {
      const parsed = values[field].safeParse(item.value);
      if (!parsed.success) return null;
      return JSON.stringify(field === "role" ? String(parsed.data).toLowerCase() : parsed.data);
    };
    const freshObservations = candidates.filter(
      (item) =>
        item.freshness !== "INVALID" &&
        parseTimestamp(item.observedAt)! >= now.getTime() - MAX_EVIDENCE_AGE_DAYS * 86_400_000 &&
        canonical(item) !== null,
    );
    // A recent conflicting CRM observation must be resolved, even if another source is verified.
    const distinct = new Set((usable.length ? freshObservations : usable).map(canonical));
    if (distinct.size > 1) {
      conflicts.push(`Conflicting ${field} evidence`);
      usable.forEach((item) => {
        item.explanation = "Conflicting evidence: resolve before qualification";
      });
      continue;
    }
    const selected = usable.sort(
      (a, b) => parseTimestamp(b.verifiedAt!)! - parseTimestamp(a.verifiedAt!)!,
    )[0];
    if (!selected) continue;
    selected.accepted = true;
    selected.explanation = "Selected timestamped, source-backed evidence";
    const proof = {
      value: selected.value,
      source: `${selected.provider}:${selected.sourceRecordId}`,
      verifiedAt: selected.verifiedAt!,
    };
    if (
      [
        "unsubscribed",
        "hardBounced",
        "complained",
        "activeSequence",
        "conflictingActiveOpportunity",
        "outreachHistoryComplete",
      ].includes(field)
    ) {
      Object.assign(input, { [field]: selected.value });
    } else {
      Object.assign(input, { [field]: proof });
    }
    if (field === "currentEmploymentVerified")
      input.employmentIndependentlyVerified = selected.independent;
  }
  const eligibilityFields = [
    "unsubscribed",
    "hardBounced",
    "complained",
    "activeSequence",
    "conflictingActiveOpportunity",
    "outreachHistoryComplete",
    "lastOutboundAt",
  ];
  const eligibility = provenance.filter(
    (item) => item.accepted && eligibilityFields.includes(item.field),
  );
  if (
    eligibility.length === eligibilityFields.length &&
    eligibility.every((item) => item.freshness === "FRESH") &&
    input.outreachHistoryComplete === true
  ) {
    input.eligibilityEvidence = {
      value: true,
      source: [...new Set(eligibility.map((item) => item.provider))].join("+"),
      verifiedAt: eligibility
        .map((item) => item.verifiedAt!)
        .sort((a, b) => parseTimestamp(a)! - parseTimestamp(b)!)[0],
    };
  }
  return { input, provenance, conflicts };
}
