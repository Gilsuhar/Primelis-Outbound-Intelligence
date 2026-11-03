import { addRecyclerCalendarMonths, jerusalemDate, RECYCLER_TIMEZONE, timestamp } from "./calendar";
import {
  recyclerInputSchema,
  type RecyclerDecision,
  type RecyclerInput,
  type RecyclerReason,
  type RecyclerSystem,
} from "./contracts";

// Explicit Phase 1 freshness policy, independent of the Sales Agent workflow.
export const RECYCLER_CHECK_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const RECYCLER_VERIFICATION_MAX_AGE_MS = 30 * RECYCLER_CHECK_MAX_AGE_MS;
const systems: RecyclerSystem[] = ["HUBSPOT", "OUTREACH"];
const normalize = (value: string) => value.trim().toLowerCase();
const domain = (value: string) => normalize(value).replace(/^www\./, "");
export const recyclerRecordKey = (record: { system: string; id: string }) =>
  JSON.stringify([record.system, record.id]);
const key = recyclerRecordKey;
const statusOf = (reasons: RecyclerReason[]): RecyclerDecision["status"] =>
  reasons.some((r) => r.status === "EXCLUDED")
    ? "EXCLUDED"
    : reasons.some((r) => r.status === "HOLD")
      ? "HOLD"
      : "ELIGIBLE";

/** Pure evaluation. asOf is mandatory: no implicit clock, I/O, merging, or credential access. */
export function evaluateRecycler(raw: unknown, asOf: string): RecyclerDecision {
  const now = timestamp(asOf);
  if (now === null) throw new RangeError("Recycler requires a valid explicit evaluation timestamp");
  const result: RecyclerDecision = {
    candidateId: null,
    status: "HOLD",
    evaluatedAt: new Date(now).toISOString(),
    timezone: RECYCLER_TIMEZONE,
    scopeId: null,
    reasons: [],
    evidenceTimestamps: [],
    latestRelevantOutbound: null,
    nextEligibleAt: null,
    nextEligibleDate: null,
  };
  const reason = (
    code: string,
    message: string,
    evidenceIds: string[] = [],
    status: RecyclerReason["status"] = "HOLD",
  ) => {
    result.reasons.push({ code, status, message, evidenceIds });
  };
  const parsed = recyclerInputSchema.safeParse(raw);
  if (!parsed.success) {
    reason(
      "INVALID_EVIDENCE",
      `Invalid or missing evidence at: ${[
        ...new Set(parsed.error.issues.map((issue) => issue.path.join(".") || "input")),
      ].join(", ")}`,
    );
    return result;
  }
  const input = parsed.data;
  result.candidateId = input.candidateId;
  result.scopeId = input.scope.id;
  const records = new Set(input.identity.records.map(key));
  const ids = (system: RecyclerSystem) =>
    input.identity.records.filter((r) => r.system === system).map((r) => r.id);
  if (input.identity.resolution !== "VERIFIED")
    reason(
      "IDENTITY_UNRESOLVED",
      "Cross-system identity is ambiguous or unresolved; records must not be merged.",
    );
  if (
    records.size !== input.identity.records.length ||
    systems.some((system) => ids(system).length > 1)
  )
    reason(
      "DUPLICATE_IDENTITY",
      "Repeated or multiple records in one system require identity resolution; no automatic merge.",
    );
  if (!input.identity.email || !input.identity.employerDomain)
    reason(
      "CURRENT_IDENTITY_MISSING",
      "A current email and employer domain are required for identity-bound verification.",
    );
  if (input.identity.emailChangedAt && timestamp(input.identity.emailChangedAt)! > now)
    reason("IDENTITY_TIMESTAMP_INVALID", "The current email change timestamp is in the future.");

  const fresh = (at: string, age = RECYCLER_CHECK_MAX_AGE_MS) => {
    const time = timestamp(at)!;
    return time <= now && now - time <= age;
  };
  type Check = RecyclerInput["suppressions"][number];
  const bound = (check: Pick<Check, "recordIds">, source: Check["source"]) => {
    const expected = source === "LOCAL" ? [...records].sort() : ids(source).sort();
    const actual = [...check.recordIds].sort();
    // LOCAL is tied to the entire identity using JSON [system,id] keys, never name matching.
    return (
      new Set(actual).size === actual.length && JSON.stringify(actual) === JSON.stringify(expected)
    );
  };
  const authoritative = (
    check: Omit<Check, "source" | "unsubscribed" | "complained" | "hardBounced" | "doNotContact">,
    source: Check["source"],
    kind: string,
  ) => {
    const absent = source !== "LOCAL" && ids(source).length === 0;
    if (!bound(check, source)) {
      reason(
        `${kind}_IDENTITY_MISMATCH`,
        `${source} evidence does not match the exact supplied identity.`,
        [check.evidenceId],
      );
      return false;
    }
    if (
      !check.authoritative ||
      !fresh(check.checkedAt) ||
      check.status !== (absent ? "NOT_PRESENT" : "COMPLETE")
    ) {
      reason(
        `${kind}_NOT_AUTHORITATIVE`,
        `${source} requires a fresh authoritative ${absent ? "no-record lookup" : "complete check"}; unknown, partial, stale or future evidence cannot clear eligibility.`,
        [check.evidenceId],
      );
      return false;
    }
    return true;
  };

  const windowStart = timestamp(addRecyclerCalendarMonths(asOf, -4))!;
  for (const system of systems) {
    const checks = input.history.filter((h) => h.system === system);
    if (!checks.length)
      reason(
        "HISTORY_MISSING",
        `${system} history coverage or authoritative no-record lookup is missing.`,
      );
    for (const check of checks) {
      result.evidenceTimestamps.push({
        kind: "HISTORY",
        source: system,
        evidenceId: check.evidenceId,
        checkedAt: check.checkedAt,
        from: check.from,
        through: check.through,
      });
      authoritative(check, system, "HISTORY");
      if (
        check.scopeId !== input.scope.id ||
        !input.scope.channels.every((c) => check.channels.includes(c)) ||
        !check.allUsers ||
        !check.retentionComplete ||
        timestamp(check.from)! > windowStart ||
        timestamp(check.from)! > timestamp(check.through)! ||
        !fresh(check.through) ||
        timestamp(check.through)! > timestamp(check.checkedAt)!
      )
        reason(
          "HISTORY_INCOMPLETE",
          `${system} must cover the entire four-month window, declared channels and relevance scope, all users, and retention through a current check.`,
          [check.evidenceId],
        );
    }
  }

  const seenEvents = new Map<string, string>();
  for (const event of input.communications) {
    result.evidenceTimestamps.push({
      kind: "COMMUNICATION",
      source: event.record.system,
      evidenceId: event.id,
      occurredAt: event.at,
    });
    if (!records.has(key(event.record))) {
      reason(
        "COMMUNICATION_IDENTITY_MISMATCH",
        "A communication belongs to an unlinked record; it cannot be merged into this prospect.",
        [event.id],
      );
      continue;
    }
    const eventKey = JSON.stringify([event.record.system, event.id]);
    const previous = seenEvents.get(eventKey);
    if (previous && previous !== JSON.stringify(event))
      reason("COMMUNICATION_CONFLICT", "Duplicate communication IDs have conflicting evidence.", [
        event.id,
      ]);
    seenEvents.set(eventKey, JSON.stringify(event));
    if (event.direction !== "OUTBOUND" || ["DRAFT", "SCHEDULED", "FAILED"].includes(event.outcome))
      continue;
    if (timestamp(event.at)! > now) {
      reason(
        "COMMUNICATION_TIMESTAMP_INVALID",
        "An occurred communication is dated in the future.",
        [event.id],
      );
      continue;
    }
    if (event.scopeId !== input.scope.id || event.relevance === "UNKNOWN") {
      reason(
        "COMMUNICATION_RELEVANCE_UNKNOWN",
        "Outbound relevance has not been established for this scope.",
        [event.id],
      );
      continue;
    }
    if (event.relevance !== "RELEVANT") continue;
    if (!input.scope.channels.includes(event.channel)) {
      reason(
        "COMMUNICATION_CHANNEL_UNCOVERED",
        "A relevant communication uses a channel outside declared history coverage.",
        [event.id],
      );
    }
    const latest = result.latestRelevantOutbound;
    if (
      !latest ||
      timestamp(event.at)! > timestamp(latest.at)! ||
      (timestamp(event.at) === timestamp(latest.at) &&
        eventKey < JSON.stringify([latest.record.system, latest.id]))
    )
      result.latestRelevantOutbound = event;
  }
  if (result.latestRelevantOutbound) {
    result.nextEligibleAt = addRecyclerCalendarMonths(result.latestRelevantOutbound.at, 4);
    result.nextEligibleDate = jerusalemDate(result.nextEligibleAt);
    if (timestamp(result.nextEligibleAt)! > now)
      reason(
        "COOLDOWN_ACTIVE",
        `Four calendar months elapse at ${result.nextEligibleAt} (${result.nextEligibleDate} in ${RECYCLER_TIMEZONE}); all other gates must also clear.`,
        [result.latestRelevantOutbound.id],
      );
  }

  for (const kind of ["EMAIL", "EMPLOYMENT"] as const) {
    const proof = kind === "EMAIL" ? input.emailVerification : input.employmentVerification;
    if (!proof) {
      reason(
        `${kind}_VERIFICATION_MISSING`,
        `Current independent ${kind.toLowerCase()} verification is missing.`,
      );
      continue;
    }
    result.evidenceTimestamps.push({
      kind,
      source: proof.providerId,
      evidenceId: proof.evidenceId,
      checkedAt: proof.checkedAt,
      expiresAt: proof.expiresAt,
    });
    if (
      !records.has(key(proof.record)) ||
      !input.identity.email ||
      !input.identity.employerDomain ||
      normalize(proof.email) !== normalize(input.identity.email) ||
      domain(proof.employerDomain) !== domain(input.identity.employerDomain) ||
      (input.identity.emailChangedAt &&
        timestamp(proof.checkedAt)! < timestamp(input.identity.emailChangedAt)!)
    )
      reason(
        `${kind}_VERIFICATION_IDENTITY_MISMATCH`,
        "Verification must match the current record, email and employer and postdate the email's last change.",
        [proof.evidenceId],
      );
    if (
      !proof.independent ||
      !fresh(proof.checkedAt, RECYCLER_VERIFICATION_MAX_AGE_MS) ||
      timestamp(proof.expiresAt)! <= now ||
      timestamp(proof.expiresAt)! <= timestamp(proof.checkedAt)!
    )
      reason(
        `${kind}_VERIFICATION_NOT_CURRENT`,
        "Verification must be independent, no older than 30 days, and unexpired at evaluation.",
        [proof.evidenceId],
      );
    if (
      kind === "EMAIL"
        ? input.emailVerification!.status !== "VALID" || !input.emailVerification!.businessEmail
        : input.employmentVerification!.status !== "VERIFIED" ||
          !input.employmentVerification!.current
    )
      reason(
        `${kind}_NOT_VERIFIED`,
        kind === "EMAIL"
          ? "A currently valid business email is required; invalid, catch-all and unknown do not qualify."
          : "Current employment with the stated employer must be verified.",
        [proof.evidenceId],
      );
  }

  for (const source of [...systems, "LOCAL"] as const) {
    const checks = input.suppressions.filter((s) => s.source === source);
    if (!checks.length) reason("SUPPRESSION_MISSING", `${source} suppression check is missing.`);
    for (const check of checks) {
      result.evidenceTimestamps.push({
        kind: "SUPPRESSION",
        source,
        evidenceId: check.evidenceId,
        checkedAt: check.checkedAt,
      });
      authoritative(check, source, "SUPPRESSION");
      if (!bound(check, source)) continue;
      const absent = source !== "LOCAL" && ids(source).length === 0;
      for (const flag of ["unsubscribed", "complained", "hardBounced", "doNotContact"] as const) {
        // A known positive remains a block even when stale or contradicted by later negatives.
        if (check[flag] === true)
          reason(
            `SUPPRESSED_${flag.toUpperCase()}`,
            `${source} reports ${flag}; negative or incomplete evidence cannot erase this suppression.`,
            [check.evidenceId],
            "EXCLUDED",
          );
        else if (!absent && check[flag] !== false)
          reason("SUPPRESSION_UNKNOWN", `${source} ${flag} status is unknown.`, [check.evidenceId]);
      }
    }
  }
  for (const system of systems) {
    const checks = input.sequences.filter((s) => s.system === system);
    if (!checks.length) reason("SEQUENCE_CHECK_MISSING", `${system} sequence check is missing.`);
    for (const check of checks) {
      result.evidenceTimestamps.push({
        kind: "SEQUENCE",
        source: system,
        evidenceId: check.evidenceId,
        checkedAt: check.checkedAt,
      });
      authoritative(check, system, "SEQUENCE");
      if (!bound(check, system)) continue;
      if (!ids(system).length && check.states.length)
        reason("SEQUENCE_IDENTITY_CONFLICT", "Sequence records contradict the no-record lookup.", [
          check.evidenceId,
        ]);
      for (const sequence of check.states) {
        const state = normalize(sequence.state);
        if (state === "opted_out")
          reason(
            "SEQUENCE_OPTED_OUT",
            `${system} sequence ${sequence.id} reports an opt-out.`,
            [check.evidenceId],
            "EXCLUDED",
          );
        else if (!["finished", "replied"].includes(state))
          reason(
            "SEQUENCE_UNRESOLVED",
            `${system} sequence ${sequence.id} is ${state}; active, paused, stalled, failed, disabled, bounced and unknown states require resolution.`,
            [check.evidenceId],
          );
      }
    }
  }
  result.status = statusOf(result.reasons);
  if (result.status === "ELIGIBLE")
    reason(
      "ALL_CHECKS_PASSED",
      result.latestRelevantOutbound
        ? "Identity, history, independent verification, suppression, sequences and four-calendar-month cooldown passed."
        : "All checks passed; no relevant outbound was supplied in the explicitly covered cooldown window. This does not assert never contacted.",
      [],
      "ELIGIBLE",
    );
  return result;
}

/** Keep one decision per input. Shared IDs/emails are conflicts, never an automatic merge. */
export function evaluateRecyclerBatch(
  inputs: readonly unknown[],
  asOf: string,
): RecyclerDecision[] {
  const results = inputs.map((input) => evaluateRecycler(input, asOf));
  const owners = new Map<string, Set<number>>();
  inputs.forEach((raw, index) => {
    const parsed = recyclerInputSchema.safeParse(raw);
    if (!parsed.success) return;
    const input = parsed.data;
    const keys = [
      JSON.stringify(["candidate", input.candidateId]),
      ...input.identity.records.map((r) => JSON.stringify(["record", key(r)])),
      ...(input.identity.email ? [JSON.stringify(["email", normalize(input.identity.email)])] : []),
    ];
    for (const identity of keys) {
      const entries = owners.get(identity) ?? new Set<number>();
      entries.add(index);
      owners.set(identity, entries);
    }
  });
  const conflicts = new Set(
    [...owners.values()].filter((entries) => entries.size > 1).flatMap((entries) => [...entries]),
  );
  for (const index of conflicts) {
    const decision = results[index];
    decision.reasons = decision.reasons.filter((r) => r.code !== "ALL_CHECKS_PASSED");
    decision.reasons.push({
      code: "DUPLICATE_IDENTITY",
      status: "HOLD",
      evidenceIds: [],
      message:
        "Another input shares this candidate ID, provider record or normalized email. Resolve duplicates explicitly; evidence was not merged.",
    });
    decision.status = statusOf(decision.reasons);
  }
  return results;
}
