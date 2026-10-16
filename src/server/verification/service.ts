import "server-only";
import { type EvidenceObservation, type IntakeContact } from "@/features/sales-agent/evidence";
import { isInOwnedIntakeScope } from "@/features/sales-agent/intake-scope";
import { parseTimestamp, MAX_EVIDENCE_AGE_DAYS } from "@/features/sales-agent/qualification";
import {
  sameVerificationIdentity,
  verificationIdentity,
  verificationResultSchema,
  type VerificationKind,
  type VerificationResult,
  type VerificationState,
} from "@/features/sales-agent/verification/contracts";
import { PrismaEvidenceStore, type EvidenceStore } from "@/server/sales-agent/evidence-store";
import { snapshotSchema } from "@/server/services/sales-agent-collection-service";
import {
  configuredVerificationAdapter,
  VerificationProviderError,
  type VerificationAdapter,
} from "./providers";
export function verificationObservations(
  result: VerificationResult,
  contact: IntakeContact,
  now: Date,
): EvidenceObservation[] {
  const checked = parseTimestamp(result.proof.checkedAt);
  if (
    !sameVerificationIdentity(result.identity, contact) ||
    checked === null ||
    checked > now.getTime() ||
    now.getTime() - checked > MAX_EVIDENCE_AGE_DAYS * 86400000 ||
    !result.proof.independent ||
    /boring|surfe|hubspot/i.test(result.proof.providerId)
  )
    return [];
  const add = (field: EvidenceObservation["field"], value: unknown): EvidenceObservation => ({
    hubspotRecordId: contact.hubspotRecordId,
    field,
    value,
    provider: "INDEPENDENT_VERIFICATION",
    sourceRecordId: `verification:${result.kind}:${result.proof.sourceRecordId}`.slice(0, 300),
    sourceUrl: result.proof.sourceUrl,
    observedAt: now.toISOString(),
    verifiedAt: result.proof.checkedAt,
    independent: true,
    supportingEvidence: result.proof.evidence,
    subjectEmail: contact.email,
    subjectCompanyDomain: contact.companyDomain,
    subjectIdentity: result.identity,
  });
  if (result.kind === "EMAIL") {
    if (!contact.emailModifiedAt || checked < (parseTimestamp(contact.emailModifiedAt) ?? Infinity))
      return [];
    return [
      add("emailVerification", {
        status:
          result.status === "VERIFIED"
            ? "VALID"
            : result.status === "CATCH_ALL"
              ? "CATCH_ALL"
              : result.status === "INVALID"
                ? "INVALID"
                : "UNKNOWN",
        independentlyVerified: true,
        emailMatchesCurrentRecord: true,
        businessEmailVerified: result.businessEmail,
      }),
    ];
  }
  if (
    result.status !== "VERIFIED" ||
    !result.current ||
    !contact.companyDomain ||
    result.employerDomain.toLowerCase() !== contact.companyDomain.toLowerCase() ||
    result.seniority === "UNKNOWN" ||
    (result.status === "VERIFIED" &&
      result.responsibilityScope !== "UNKNOWN" &&
      !result.responsibilityEvidence.length)
  )
    return [];
  if (
    (result.responsibilityScope === "PAID_SOCIAL_ONLY" &&
      result.searchResponsibility === "PROVEN") ||
    (result.seniority === "OTHER" &&
      /\b(head|director|vp|vice president|chief|cmo|lead)\b/i.test(result.role))
  )
    return [];
  const responsibility =
    result.responsibilityScope === "PAID_SOCIAL_ONLY"
      ? "ABSENT"
      : ["PAID_SEARCH", "MIXED"].includes(result.responsibilityScope) &&
          result.searchResponsibility === "PROVEN" &&
          result.responsibilityEvidence.length
        ? "PROVEN"
        : result.searchResponsibility === "ABSENT" && result.responsibilityEvidence.length
          ? "ABSENT"
          : "UNKNOWN";
  if (
    result.seniority !== "OTHER" &&
    !/\b(head|director|vp|vice president|chief|cmo|lead)\b/i.test(result.role)
  )
    return [];
  return [
    add("currentEmploymentVerified", true),
    add("role", result.role),
    {
      ...add("paidSearchResponsibility", responsibility),
      supportingEvidence: result.responsibilityEvidence.length
        ? result.responsibilityEvidence
        : result.proof.evidence,
    },
  ];
}
export async function retryVerification(
  actor: string,
  id: string,
  kind: VerificationKind,
  requestKey: string,
  deps: { store?: EvidenceStore; adapter?: VerificationAdapter; now?: () => Date } = {},
) {
  if (!deps.store && process.env.INTEGRATION_OPERATOR_USER_ID !== actor)
    throw new Error("OPERATOR_REQUIRED");
  const store = deps.store ?? new PrismaEvidenceStore(),
    now = (deps.now ?? (() => new Date()))(),
    adapter = deps.adapter ?? configuredVerificationAdapter(kind);
  let input: IntakeContact | undefined,
    claimed = false;
  const found = await store.edit(actor, id, (raw) => {
    const saved = snapshotSchema.parse(raw);
    if (
      !isInOwnedIntakeScope(saved.contact) ||
      parseTimestamp(saved.contact.observedAt) === null ||
      Date.parse(saved.contact.observedAt) > now.getTime() ||
      now.getTime() - Date.parse(saved.contact.observedAt) > 86400000
    )
      throw new Error("INTAKE_REFRESH_REQUIRED");
    input = saved.contact;
    if (kind === "EMAIL" && (!input.email || !input.emailModifiedAt))
      throw new Error("EMAIL_HISTORY_REQUIRED");
    const prior = saved.verification?.[kind];
    const same =
      prior && sameVerificationIdentity(prior.identity, input) && prior.providerId === adapter.id;
    if (prior?.requestKey === requestKey) {
      if (!same) throw new Error("IDEMPOTENCY_CONFLICT");
      return null;
    }
    if (
      same &&
      ((prior.state === "RUNNING" && Date.parse(prior.leaseUntil) > now.getTime()) ||
        Date.parse(prior.nextRetryAt) > now.getTime())
    )
      return null;
    if (
      same &&
      prior.state === "COMPLETED" &&
      prior.result &&
      Date.parse(prior.result.proof.checkedAt) <= now.getTime() &&
      ["VERIFIED", "INVALID", "CATCH_ALL"].includes(prior.result.status) &&
      now.getTime() - Date.parse(prior.result.proof.checkedAt) <= MAX_EVIDENCE_AGE_DAYS * 86400000
    )
      return null;
    if (same && prior.attempts >= 3 && now.getTime() - Date.parse(prior.startedAt) < 86400000)
      return null;
    claimed = true;
    const attempt = {
      requestKey,
      identity: verificationIdentity(input),
      providerId: adapter.id,
      state: "RUNNING" as const,
      startedAt: now.toISOString(),
      leaseUntil: new Date(now.getTime() + 120000).toISOString(),
      nextRetryAt: new Date(now.getTime() + 60000).toISOString(),
      attempts:
        same && now.getTime() - Date.parse(prior.startedAt) < 86400000 ? prior.attempts + 1 : 1,
      message: "Independent verification request in progress",
    };
    return {
      ...saved,
      verification: { ...saved.verification, [kind]: attempt },
      observations: saved.observations.filter(
        (item) => !item.sourceRecordId.startsWith(`verification:${kind}:`),
      ),
      provenanceAtCollection: [],
    };
  });
  if (!found && !input) throw new Error("NOT_FOUND");
  if (!claimed || !input)
    return {
      started: false,
      message:
        "Existing request, fresh result, rate limit or retry budget retained; no duplicate provider call",
    };
  let result: VerificationResult | undefined,
    state: NonNullable<VerificationState["EMAIL"]>["state"] = "COMPLETED",
    message = "Provider evidence collected; eligibility remains subject to every gate",
    retryAfterMs = 60000;
  try {
    const value = await adapter.verify(kind, input, now);
    if (!value) {
      state = "UNRESOLVED_PROVIDER";
      message = "No authorized verification provider configured; evidence remains UNKNOWN";
    } else {
      result = verificationResultSchema.parse(value);
      if (
        result.kind !== kind ||
        !sameVerificationIdentity(result.identity, input) ||
        result.proof.providerId !== adapter.id
      )
        throw new VerificationProviderError("INVALID_RESPONSE");
    }
  } catch (error) {
    // Discard rejected payloads, including another contact's identity; never persist them for display.
    result = undefined;
    state = "FAILED";
    message = error instanceof VerificationProviderError ? error.code : "INVALID_RESPONSE";
    if (error instanceof VerificationProviderError)
      retryAfterMs = Math.max(retryAfterMs, error.retryAfterMs);
  }
  const completed = (deps.now ?? (() => new Date()))();
  const edited = await store.edit(actor, id, (raw) => {
    const saved = snapshotSchema.parse(raw),
      attempt = saved.verification?.[kind];
    if (
      !attempt ||
      attempt.requestKey !== requestKey ||
      !sameVerificationIdentity(saved.contact, input!)
    )
      throw new Error("IDEMPOTENCY_CONFLICT");
    const observations = result ? verificationObservations(result, saved.contact, completed) : [];
    const attemptState = result && !observations.length ? ("FAILED" as const) : state;
    return {
      ...saved,
      verification: {
        ...saved.verification,
        [kind]: {
          ...attempt,
          state: attemptState,
          result,
          message:
            result && !observations.length
              ? "Evidence is stale, not independent, mismatched or insufficiently corroborated; HOLD"
              : message,
          leaseUntil: completed.toISOString(),
          nextRetryAt: new Date(completed.getTime() + retryAfterMs).toISOString(),
        },
      },
      observations: [
        ...saved.observations.filter(
          (item) => !item.sourceRecordId.startsWith(`verification:${kind}:`),
        ),
        ...observations,
      ],
      provenanceAtCollection: [],
    };
  });
  if (!edited) throw new Error("NOT_FOUND");
  return { started: true, message };
}
