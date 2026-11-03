// @vitest-environment node
import { describe, expect, it } from "vitest";
import { addRecyclerCalendarMonths, timestamp } from "./calendar";
import { evaluateRecycler, evaluateRecyclerBatch, RECYCLER_CHECK_MAX_AGE_MS } from "./eligibility";
import type { RecyclerInput } from "./contracts";

const now = "2026-10-25T10:00:00.000Z";
const record = { system: "OUTREACH" as const, id: "outreach-1" };
function fixture(at = now): RecyclerInput {
  const proof = {
    record,
    email: "person@example.com",
    employerDomain: "example.com",
    providerId: "independent-test-verifier",
    independent: true,
    checkedAt: at,
    expiresAt: new Date(Date.parse(at) + 86400000).toISOString(),
    evidenceId: "independent-receipt",
  };
  const checks = (["HUBSPOT", "OUTREACH"] as const).map((system) => ({
    system,
    status: system === "HUBSPOT" ? ("NOT_PRESENT" as const) : ("COMPLETE" as const),
    recordIds: system === "HUBSPOT" ? [] : [record.id],
    checkedAt: at,
    authoritative: true,
    evidenceId: `${system}-check`,
  }));
  return {
    candidateId: "candidate-1",
    identity: {
      resolution: "VERIFIED",
      records: [record],
      email: proof.email,
      employerDomain: proof.employerDomain,
      emailChangedAt: "2020-01-01T00:00:00Z",
    },
    scope: { id: "sales-outbound-v1", channels: ["EMAIL", "CALL", "LINKEDIN"] },
    history: checks.map((check) => ({
      ...check,
      scopeId: "sales-outbound-v1",
      channels: ["EMAIL", "CALL", "LINKEDIN"],
      from: "2020-01-01T00:00:00Z",
      through: at,
      allUsers: true,
      retentionComplete: true,
    })),
    communications: [
      {
        id: "sent-1",
        record,
        at: "2026-06-20T10:00:00Z",
        scopeId: "sales-outbound-v1",
        channel: "EMAIL",
        direction: "OUTBOUND",
        outcome: "SENT",
        relevance: "RELEVANT",
      },
    ],
    emailVerification: { ...proof, status: "VALID", businessEmail: true },
    employmentVerification: {
      ...proof,
      evidenceId: "employment-receipt",
      status: "VERIFIED",
      current: true,
    },
    suppressions: [
      ...checks.map(({ system, ...check }) => ({
        ...check,
        source: system,
        unsubscribed: false,
        complained: false,
        hardBounced: false,
        doNotContact: false,
      })),
      {
        source: "LOCAL",
        status: "COMPLETE",
        recordIds: [JSON.stringify([record.system, record.id])],
        checkedAt: at,
        authoritative: true,
        evidenceId: "local-check",
        unsubscribed: false,
        complained: false,
        hardBounced: false,
        doNotContact: false,
      },
    ],
    sequences: checks.map((check) => ({ ...check, states: [] })),
  };
}
function dualSystem(): RecyclerInput {
  const input = fixture();
  input.identity.records.push({ system: "HUBSPOT", id: "hubspot-1" });
  for (const check of input.history.filter((c) => c.system === "HUBSPOT")) {
    check.status = "COMPLETE";
    check.recordIds = ["hubspot-1"];
  }
  for (const check of input.sequences.filter((c) => c.system === "HUBSPOT")) {
    check.status = "COMPLETE";
    check.recordIds = ["hubspot-1"];
  }
  for (const check of input.suppressions) {
    if (check.source === "HUBSPOT") {
      check.status = "COMPLETE";
      check.recordIds = ["hubspot-1"];
    }
    if (check.source === "LOCAL") check.recordIds.push(JSON.stringify(["HUBSPOT", "hubspot-1"]));
  }
  return input;
}
function codes(input: RecyclerInput, at = now) {
  return evaluateRecycler(input, at).reasons.map((r) => r.code);
}

describe("Recycler calendar months in Asia/Jerusalem", () => {
  it.each([
    ["2026-01-31T10:00:00+02:00", "2026-05-31T07:00:00.000Z"],
    ["2026-10-31T10:00:00+02:00", "2027-02-28T08:00:00.000Z"],
    ["2023-10-31T10:00:00+02:00", "2024-02-29T08:00:00.000Z"],
    ["2026-06-25T13:00:00+03:00", "2026-10-25T11:00:00.000Z"],
    ["2025-11-27T02:30:00+02:00", "2026-03-27T00:30:00.000Z"],
    ["2026-06-25T01:30:00+03:00", "2026-10-24T23:30:00.000Z"],
    ["2026-01-31T23:30:00.123Z", "2026-05-31T22:30:00.123Z"],
  ])("clamps month ends and preserves local time: %s", (from, expected) => {
    expect(addRecyclerCalendarMonths(from, 4)).toBe(expected);
  });
  it.each([
    ["2027-02-28T07:59:59.999Z", "HOLD"],
    ["2027-02-28T08:00:00.000Z", "ELIGIBLE"],
    ["2027-02-28T08:00:00.001Z", "ELIGIBLE"],
  ])("includes the exact month-end anniversary at %s", (at, expected) => {
    const input = fixture(at);
    input.communications[0].at = "2026-10-31T10:00:00+02:00";
    expect(evaluateRecycler(input, at).status).toBe(expected);
  });
  it("does not substitute 120 days for four months", () => {
    const at = "2026-08-29T07:00:00Z";
    const input = fixture(at);
    input.communications[0].at = "2026-05-01T10:00:00+03:00";
    const result = evaluateRecycler(input, at);
    expect(result.status).toBe("HOLD");
    expect(result.nextEligibleDate).toBe("2026-09-01");
  });
  it.each([
    "2026-02-30T12:00:00Z",
    "2026-10-25",
    "2026-10-25T10:00:00",
    "2026-10-25T24:00:00Z",
    "2026-10-25T10:00:00+24:00",
  ])("rejects invalid timestamps %s", (at) => {
    expect(timestamp(at)).toBeNull();
    expect(() => evaluateRecycler(fixture(), at)).toThrow(RangeError);
  });
});

describe("standalone Recycler eligibility", () => {
  it("accepts an Outreach-only prospect with authoritative HubSpot absence", () => {
    const result = evaluateRecycler(fixture(), now);
    expect(result.status).toBe("ELIGIBLE");
    expect(result.nextEligibleDate).toBe("2026-10-20");
    expect(result.latestRelevantOutbound?.record.system).toBe("OUTREACH");
    expect(result.evidenceTimestamps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "EMAIL",
          checkedAt: now,
          expiresAt: "2026-10-26T10:00:00.000Z",
        }),
        expect.objectContaining({ kind: "HISTORY", from: "2020-01-01T00:00:00Z", through: now }),
      ]),
    );
  });
  it("requires explicit coverage even when no HubSpot ID exists", () => {
    const input = fixture();
    input.history = input.history.filter((h) => h.system !== "HUBSPOT");
    expect(codes(input)).toContain("HISTORY_MISSING");
    expect(evaluateRecycler(input, now).status).toBe("HOLD");
  });
  it("selects the latest relevant communication across both providers and channels", () => {
    const input = dualSystem();
    input.communications.push({
      ...input.communications[0],
      id: "hubspot-call",
      record: { system: "HUBSPOT", id: "hubspot-1" },
      at: "2026-08-01T08:00:00Z",
      channel: "CALL",
      outcome: "COMPLETED",
    });
    const result = evaluateRecycler(input, now);
    expect(result.status).toBe("HOLD");
    expect(result.latestRelevantOutbound?.id).toBe("hubspot-call");
    expect(result.nextEligibleDate).toBe("2026-12-01");
    expect(
      evaluateRecycler({ ...input, communications: [...input.communications].reverse() }, now)
        .latestRelevantOutbound,
    ).toEqual(result.latestRelevantOutbound);
  });
  it.each(["INBOUND", "IRRELEVANT", "DRAFT", "SCHEDULED", "FAILED"])(
    "does not reset cooldown for %s",
    (mode) => {
      const input = fixture();
      const event = { ...input.communications[0], id: "newer", at: now };
      if (mode === "INBOUND") event.direction = "INBOUND";
      else if (mode === "IRRELEVANT") event.relevance = "IRRELEVANT";
      else event.outcome = mode as "DRAFT" | "SCHEDULED" | "FAILED";
      input.communications.push(event);
      expect(evaluateRecycler(input, now).status).toBe("ELIGIBLE");
      expect(evaluateRecycler(input, now).latestRelevantOutbound?.id).toBe("sent-1");
    },
  );
  it("uses delivery evidence when later than send evidence", () => {
    const input = fixture();
    input.communications.push({
      ...input.communications[0],
      id: "delivered",
      outcome: "DELIVERED",
      at: now,
    });
    expect(evaluateRecycler(input, now).latestRelevantOutbound?.id).toBe("delivered");
    expect(codes(input)).toContain("COOLDOWN_ACTIVE");
  });
  it("does not infer never-contacted from an empty history", () => {
    const input = fixture();
    input.communications = [];
    expect(evaluateRecycler(input, now)).toMatchObject({
      status: "ELIGIBLE",
      nextEligibleAt: null,
      nextEligibleDate: null,
    });
    input.history[1].status = "UNKNOWN";
    expect(evaluateRecycler(input, now).status).toBe("HOLD");
  });
  it.each(["AMBIGUOUS", "UNRESOLVED"] as const)(
    "holds %s identities without merging",
    (resolution) => {
      const input = dualSystem();
      input.identity.resolution = resolution;
      expect(evaluateRecycler(input, now).status).toBe("HOLD");
      expect(codes(input)).toContain("IDENTITY_UNRESOLVED");
    },
  );
  it("holds repeated or multiple provider identities", () => {
    const input = fixture();
    input.identity.records.push({ ...record });
    expect(codes(input)).toContain("DUPLICATE_IDENTITY");
    input.identity.records[1].id = "outreach-2";
    expect(codes(input)).toContain("DUPLICATE_IDENTITY");
  });
  it("does not use communications from an unlinked identity", () => {
    const input = fixture();
    input.communications.push({
      ...input.communications[0],
      id: "foreign",
      record: { system: "OUTREACH", id: "other" },
      at: now,
    });
    const result = evaluateRecycler(input, now);
    expect(result.status).toBe("HOLD");
    expect(result.latestRelevantOutbound?.id).toBe("sent-1");
  });
  it("deduplicates identical events and holds contradictory event IDs", () => {
    const input = fixture();
    input.communications.push({ ...input.communications[0] });
    expect(evaluateRecycler(input, now).status).toBe("ELIGIBLE");
    input.communications[1].at = now;
    expect(codes(input)).toContain("COMMUNICATION_CONFLICT");
  });
  it.each(["PARTIAL", "UNKNOWN"] as const)("holds %s history", (status) => {
    const input = fixture();
    input.history[1].status = status;
    expect(evaluateRecycler(input, now).status).toBe("HOLD");
  });
  it.each(["allUsers", "retentionComplete", "authoritative"] as const)(
    "requires %s coverage",
    (field) => {
      const input = fixture();
      input.history[1][field] = false;
      expect(evaluateRecycler(input, now).status).toBe("HOLD");
    },
  );
  it.each([
    "short-window",
    "wrong-scope",
    "missing-channel",
    "future-through",
    "stale-through",
    "stale-check",
  ])("holds history with %s", (mode) => {
    const input = fixture();
    const check = input.history[1];
    if (mode === "short-window") check.from = "2026-07-01T00:00:00Z";
    if (mode === "wrong-scope") check.scopeId = "another-campaign";
    if (mode === "missing-channel") check.channels = ["EMAIL"];
    if (mode === "future-through") check.through = "2026-10-26T10:00:00Z";
    if (mode === "stale-through") check.through = "2026-10-23T10:00:00Z";
    if (mode === "stale-check") check.checkedAt = "2026-10-23T10:00:00Z";
    expect(evaluateRecycler(input, now).status).toBe("HOLD");
  });
  it("uses an inclusive 24-hour check freshness limit", () => {
    const input = fixture();
    const check = input.history[1];
    check.checkedAt = check.through = new Date(
      Date.parse(now) - RECYCLER_CHECK_MAX_AGE_MS,
    ).toISOString();
    expect(evaluateRecycler(input, now).status).toBe("ELIGIBLE");
    check.checkedAt = check.through = new Date(
      Date.parse(now) - RECYCLER_CHECK_MAX_AGE_MS - 1,
    ).toISOString();
    expect(evaluateRecycler(input, now).status).toBe("HOLD");
  });
  it.each(["UNKNOWN", "wrong-scope", "future", "uncovered-channel"])(
    "holds communication with %s relevance/evidence",
    (mode) => {
      const input = fixture();
      const event = input.communications[0];
      if (mode === "UNKNOWN") event.relevance = "UNKNOWN";
      if (mode === "wrong-scope") event.scopeId = "other";
      if (mode === "future") event.at = "2026-10-26T00:00:00Z";
      if (mode === "uncovered-channel") event.channel = "SMS";
      expect(evaluateRecycler(input, now).status).toBe("HOLD");
    },
  );
  it.each(["emailVerification", "employmentVerification"] as const)("requires %s", (field) => {
    const input = fixture();
    delete input[field];
    expect(evaluateRecycler(input, now).status).toBe("HOLD");
  });
  it.each([
    "stale",
    "expired",
    "future",
    "not-independent",
    "wrong-email",
    "wrong-employer",
    "wrong-record",
    "edited-email",
  ])("holds %s verification for both kinds", (mode) => {
    for (const field of ["emailVerification", "employmentVerification"] as const) {
      const input = fixture();
      const proof = input[field]!;
      if (mode === "stale") proof.checkedAt = "2026-09-01T00:00:00Z";
      if (mode === "expired") proof.expiresAt = now;
      if (mode === "future") proof.checkedAt = "2026-10-26T00:00:00Z";
      if (mode === "not-independent") proof.independent = false;
      if (mode === "wrong-email") proof.email = "other@example.com";
      if (mode === "wrong-employer") proof.employerDomain = "other.example";
      if (mode === "wrong-record") proof.record = { ...record, id: "different" };
      if (mode === "edited-email") {
        proof.checkedAt = "2026-10-24T00:00:00Z";
        input.identity.emailChangedAt = now;
      }
      expect(evaluateRecycler(input, now).status).toBe("HOLD");
    }
  });
  it.each(["INVALID", "CATCH_ALL", "UNKNOWN"] as const)("holds %s email", (status) => {
    const input = fixture();
    input.emailVerification!.status = status;
    expect(evaluateRecycler(input, now).status).toBe("HOLD");
  });
  it("requires a business email and verified current employment", () => {
    const input = fixture();
    input.emailVerification!.businessEmail = false;
    expect(codes(input)).toContain("EMAIL_NOT_VERIFIED");
    input.employmentVerification!.current = false;
    expect(codes(input)).toContain("EMPLOYMENT_NOT_VERIFIED");
  });
  it.each(["unsubscribed", "complained", "hardBounced", "doNotContact"] as const)(
    "excludes %s even against newer negative evidence and missing verification",
    (flag) => {
      const input = fixture();
      const positive = {
        ...input.suppressions[1],
        evidenceId: "older-positive",
        checkedAt: "2025-01-01T00:00:00Z",
        [flag]: true,
      };
      input.suppressions.push(positive);
      delete input.emailVerification;
      const result = evaluateRecycler(input, now);
      expect(result.status).toBe("EXCLUDED");
      expect(
        result.reasons.some(
          (r) => r.status === "EXCLUDED" && r.evidenceIds.includes("older-positive"),
        ),
      ).toBe(true);
      input.suppressions.reverse();
      expect(evaluateRecycler(input, now).status).toBe("EXCLUDED");
    },
  );
  it.each(["missing", "unknown-flag", "partial", "not-authoritative", "wrong-identity", "stale"])(
    "holds %s suppression evidence",
    (mode) => {
      const input = fixture();
      const check = input.suppressions[1];
      if (mode === "missing") input.suppressions = [];
      if (mode === "unknown-flag") check.complained = null;
      if (mode === "partial") check.status = "PARTIAL";
      if (mode === "not-authoritative") check.authoritative = false;
      if (mode === "wrong-identity") {
        check.recordIds = ["another-person"];
        check.unsubscribed = true;
      }
      if (mode === "stale") check.checkedAt = "2026-10-23T00:00:00Z";
      expect(evaluateRecycler(input, now).status).toBe("HOLD");
    },
  );
  it.each([
    "active",
    "pending",
    "paused",
    "stalled",
    "failed",
    "disabled",
    "bounced",
    "new-unknown-state",
  ])("holds %s sequences", (state) => {
    const input = fixture();
    input.sequences[1].states = [{ id: "seq-1", state }];
    expect(evaluateRecycler(input, now).status).toBe("HOLD");
    expect(codes(input)).toContain("SEQUENCE_UNRESOLVED");
  });
  it.each(["finished", "replied"])("accepts resolved %s sequences", (state) => {
    const input = fixture();
    input.sequences[1].states = [{ id: "seq-1", state }];
    expect(evaluateRecycler(input, now).status).toBe("ELIGIBLE");
  });
  it("excludes opted-out sequence states despite negative suppression flags", () => {
    const input = fixture();
    input.sequences[1].states = [{ id: "seq-1", state: "opted_out" }];
    expect(evaluateRecycler(input, now).status).toBe("EXCLUDED");
  });
  it.each(["missing", "partial", "not-authoritative", "stale"])(
    "holds %s sequence checks",
    (mode) => {
      const input = fixture();
      if (mode === "missing") input.sequences = [];
      if (mode === "partial") input.sequences[1].status = "PARTIAL";
      if (mode === "not-authoritative") input.sequences[1].authoritative = false;
      if (mode === "stale") input.sequences[1].checkedAt = "2026-10-23T00:00:00Z";
      expect(evaluateRecycler(input, now).status).toBe("HOLD");
    },
  );
  it("fails closed on malformed input and timestamps", () => {
    expect(evaluateRecycler({}, now).status).toBe("HOLD");
    const input = fixture();
    input.history[0].through = "2026-02-30T00:00:00Z";
    expect(codes(input)).toContain("INVALID_EVIDENCE");
  });
  it("is deterministic and does not mutate the supplied evidence", () => {
    const input = fixture();
    const before = JSON.stringify(input);
    const first = evaluateRecycler(input, now);
    const second = evaluateRecycler(input, now);
    expect(first).toEqual(second);
    expect(JSON.stringify(input)).toBe(before);
    first.latestRelevantOutbound!.record.id = "mutated-output";
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe("batch identity isolation", () => {
  it.each(["candidate", "record", "email"])(
    "holds both inputs sharing a %s without merging evidence",
    (duplicate) => {
      const first = fixture();
      const second = fixture();
      second.candidateId = "candidate-2";
      if (duplicate !== "record") {
        second.identity.records = [{ ...record, id: "different" }];
      }
      if (duplicate !== "email") second.identity.email = "different@example.com";
      if (duplicate === "candidate") second.candidateId = first.candidateId;
      const before = JSON.stringify([first, second]);
      const decisions = evaluateRecyclerBatch([first, second], now);
      expect(decisions).toHaveLength(2);
      expect(
        decisions.every(
          (d) => d.status === "HOLD" && d.reasons.some((r) => r.code === "DUPLICATE_IDENTITY"),
        ),
      ).toBe(true);
      expect(JSON.stringify([first, second])).toBe(before);
    },
  );
  it("treats a case-insensitive shared email across systems as ambiguous", () => {
    const first = fixture();
    const second = fixture();
    second.candidateId = "candidate-2";
    second.identity.records = [{ system: "HUBSPOT", id: "hubspot-other" }];
    second.identity.email = "PERSON@EXAMPLE.COM";
    expect(
      evaluateRecyclerBatch([first, second], now).every((d) =>
        d.reasons.some((r) => r.code === "DUPLICATE_IDENTITY"),
      ),
    ).toBe(true);
  });
  it("preserves exclusion when a suppressed identity is also duplicated", () => {
    const first = fixture();
    first.suppressions[1].unsubscribed = true;
    const decisions = evaluateRecyclerBatch([first, fixture()], now);
    expect(decisions.map((d) => d.status)).toEqual(["EXCLUDED", "HOLD"]);
    expect(decisions[1].reasons.some((r) => r.status === "EXCLUDED")).toBe(false);
  });
  it("keeps distinct candidates eligible and handles empty batches", () => {
    const second = fixture();
    second.candidateId = "candidate-2";
    // A second independently constructed candidate uses a separate source namespace and email.
    const raw = JSON.stringify(second)
      .replaceAll("outreach-1", "outreach-2")
      .replaceAll("person@example.com", "other@example.com");
    expect(evaluateRecyclerBatch([fixture(), JSON.parse(raw)], now).map((d) => d.status)).toEqual([
      "ELIGIBLE",
      "ELIGIBLE",
    ]);
    expect(evaluateRecyclerBatch([], now)).toEqual([]);
  });
});

describe("Recycler evidence completeness regressions", () => {
  it("does not confuse an omitted communication collection with a checked empty collection", () => {
    const raw: Record<string, unknown> = { ...fixture() };
    delete raw.communications;
    expect(evaluateRecycler(raw, now).status).toBe("HOLD");
  });
  it("preserves HubSpot suppression against conflicting Outreach clearance", () => {
    const input = dualSystem();
    expect(evaluateRecycler(input, now).status).toBe("ELIGIBLE");
    input.suppressions.find((s) => s.source === "HUBSPOT")!.hardBounced = true;
    const result = evaluateRecycler(input, now);
    expect(result.status).toBe("EXCLUDED");
    expect(
      result.reasons.some(
        (r) => r.status === "EXCLUDED" && r.evidenceIds.includes("HUBSPOT-check"),
      ),
    ).toBe(true);
    expect(result.evidenceTimestamps.find((e) => e.kind === "EMAIL")?.source).toBe(
      "independent-test-verifier",
    );
  });
});
