import { describe, expect, it } from "vitest";
import {
  qualifyProspect,
  SIGNAL_HUBSPOT_OWNER_ID,
  type ProspectQualificationInput,
} from "./qualification";

const now = new Date("2026-10-15T12:00:00.000Z");
const evidence = <T>(value: T) => ({
  value,
  source: "verified-test-provider",
  verifiedAt: "2026-10-15T08:00:00.000Z",
});
const valid: ProspectQualificationInput = {
  hubspotRecordId: "123",
  hubspotOwnerId: SIGNAL_HUBSPOT_OWNER_ID,
  employeeCount: evidence(80),
  annualRevenueUsd: evidence(30_000_000),
  role: evidence("Director of Paid Search"),
  paidSearchResponsibility: evidence("PROVEN" as const),
  currentEmploymentVerified: evidence(true),
  emailVerification: evidence({
    status: "VALID",
    independentlyVerified: true,
    emailMatchesCurrentRecord: true,
    businessEmailVerified: true,
  }),
  lastOutboundAt: evidence("2026-06-15T12:00:00.000Z"),
  outreachHistoryComplete: true,
  eligibilityEvidence: evidence(true),
  employmentIndependentlyVerified: true,
  unsubscribed: false,
  hardBounced: false,
  complained: false,
  activeSequence: false,
  conflictingActiveOpportunity: false,
};

describe("Signal Sales Agent qualification", () => {
  it("accepts only fully verified candidates at the exact ICP thresholds", () => {
    expect(qualifyProspect(valid, now).status).toBe("READY");
  });

  it("fails closed when Outreach history is missing", () => {
    const decision = qualifyProspect({ ...valid, outreachHistoryComplete: false }, now);
    expect(decision.status).toBe("HOLD");
    expect(decision.reasons).toContain("Outreach history incomplete");
  });

  it("rejects contacts owned by another sales rep", () => {
    expect(qualifyProspect({ ...valid, hubspotOwnerId: "1799882984" }, now).status).toBe(
      "REJECTED",
    );
  });

  it("rejects under-threshold companies", () => {
    expect(qualifyProspect({ ...valid, employeeCount: evidence(79) }, now).status).toBe("REJECTED");
    expect(qualifyProspect({ ...valid, annualRevenueUsd: evidence(29_999_999) }, now).status).toBe(
      "REJECTED",
    );
  });

  it("holds Growth roles without proven search responsibility", () => {
    expect(qualifyProspect({ ...valid, role: evidence("VP Growth"), paidSearchResponsibility:undefined }, now).status).toBe("HOLD");
    expect(
      qualifyProspect(
        {
          ...valid,
          role: evidence("VP Growth"),
          paidSearchResponsibility: evidence("PROVEN" as const),
        },
        now,
      ).status,
    ).toBe("READY");
  });

  it("rejects paid social-only roles", () => {
    expect(
      qualifyProspect({ ...valid, role: evidence("Director of Paid Social") }, now).status,
    ).toBe("REJECTED");
  });

  it("requires independent verification, not just green status", () => {
    const unverified = evidence({
      status: "VALID" as const,
      independentlyVerified: false,
      emailMatchesCurrentRecord: true,
      businessEmailVerified: true,
    });
    expect(qualifyProspect({ ...valid, emailVerification: unverified }, now).status).toBe("HOLD");
  });

  it("holds catch-all email", () => {
    const catchAll = evidence({
      status: "CATCH_ALL" as const,
      independentlyVerified: true,
      emailMatchesCurrentRecord: true,
      businessEmailVerified: true,
    });
    expect(qualifyProspect({ ...valid, emailVerification: catchAll }, now).status).toBe("HOLD");
  });

  it("rejects unsubscribe and holds active sequences", () => {
    expect(qualifyProspect({ ...valid, unsubscribed: true }, now).status).toBe("REJECTED");
    expect(qualifyProspect({ ...valid, activeSequence: true }, now).status).toBe("HOLD");
  });

  it("holds when four full calendar months have not elapsed", () => {
    expect(
      qualifyProspect(
        {
          ...valid,
          lastOutboundAt: evidence("2026-06-16T12:00:00.000Z"),
        },
        now,
      ).status,
    ).toBe("HOLD");
  });

  it("holds unknown or missing eligibility signals", () => {
    expect(qualifyProspect({}, now).status).toBe("HOLD");
  });
});

describe("qualification safety regressions", () => {
  it.each([
    "2026-09-14T08:00:00Z",
    "2026-10-16T08:00:00Z",
    "unknown",
    "2026-02-30T08:00:00Z",
    "2026-10-15",
  ])("holds stale, future or invalid email evidence: %s", (verifiedAt) => {
    expect(
      qualifyProspect(
        { ...valid, emailVerification: { ...valid.emailVerification!, verifiedAt } },
        now,
      ).status,
    ).toBe("HOLD");
  });

  it.each([
    "employeeCount",
    "annualRevenueUsd",
    "role",
    "currentEmploymentVerified",
    "eligibilityEvidence",
    "lastOutboundAt",
  ] as const)("holds stale %s evidence", (key) => {
    const input = { ...valid, [key]: { ...valid[key], verifiedAt: "2025-01-01T00:00:00Z" } };
    expect(qualifyProspect(input, now).status).toBe("HOLD");
  });

  it("requires independently verified employment and business email", () => {
    expect(
      qualifyProspect({ ...valid, employmentIndependentlyVerified: undefined }, now).status,
    ).toBe("HOLD");
    expect(
      qualifyProspect(
        {
          ...valid,
          emailVerification: evidence({
            ...valid.emailVerification!.value,
            businessEmailVerified: undefined,
          }),
        },
        now,
      ).status,
    ).toBe("HOLD");
    expect(
      qualifyProspect(
        { ...valid, emailVerification: { ...valid.emailVerification!, source: "Boring" } },
        now,
      ).status,
    ).toBe("HOLD");
  });

  it.each([
    "PPC Specialist",
    "Paid Search Manager",
    "Marketing Director",
    "Performance Analyst",
    "",
  ])("does not promote ambiguous or junior roles using search proof: %s", (role) => {
    expect(
      qualifyProspect(
        { ...valid, role: evidence(role), paidSearchResponsibility: evidence("PROVEN") },
        now,
      ).status,
    ).toBe("HOLD");
  });

  it.each(["CMO", "VP of Marketing", "Vice President of Marketing", "Head of SEM"])(
    "accepts strategic and senior search titles: %s",
    (role) => {
      expect(qualifyProspect({ ...valid, role: evidence(role) }, now).status).toBe("READY");
    },
  );

  it.each(["Head of SEO", "Director of Paid Social"])("rejects excluded roles: %s", (role) => {
    expect(qualifyProspect({ ...valid, role: evidence(role) }, now).status).toBe("REJECTED");
  });

  it("holds stale search ownership proof even for senior growth roles", () => {
    expect(
      qualifyProspect(
        {
          ...valid,
          role: evidence("VP Growth"),
          paidSearchResponsibility: {
            ...evidence("PROVEN" as const),
            verifiedAt: "2025-01-01T00:00:00Z",
          },
        },
        now,
      ).status,
    ).toBe("HOLD");
  });

  it.each(["activeSequence", "conflictingActiveOpportunity"] as const)("holds %s", (key) => {
    expect(qualifyProspect({ ...valid, [key]: true }, now).status).toBe("HOLD");
    expect(qualifyProspect({ ...valid, [key]: undefined }, now).status).toBe("HOLD");
  });

  it.each(["unsubscribed", "hardBounced", "complained"] as const)(
    "rejects %s and holds unknown status",
    (key) => {
      expect(qualifyProspect({ ...valid, [key]: true }, now).status).toBe("REJECTED");
      expect(qualifyProspect({ ...valid, [key]: undefined }, now).status).toBe("HOLD");
    },
  );

  it("uses the anniversary of the outbound timestamp, clamping month-end", () => {
    const input = { ...valid, lastOutboundAt: evidence("2026-05-31T12:00:00Z") };
    // Refresh all evidence to the evaluation date without changing the outbound event.
    const refreshed = Object.fromEntries(
      Object.entries(input).map(([key, value]) => [
        key,
        typeof value === "object" && value !== null
          ? { ...value, verifiedAt: "2026-09-30T08:00:00Z" }
          : value,
      ]),
    );
    expect(qualifyProspect(refreshed, new Date("2026-09-30T11:59:59Z")).status).toBe("HOLD");
    expect(qualifyProspect(refreshed, new Date("2026-09-30T12:00:00Z")).status).toBe("READY");
  });

  it.each(["2026-02-30T12:00:00Z", "2026-06-15", "not-a-date", "2027-01-01T00:00:00Z"])(
    "holds invalid outbound dates: %s",
    (value) => {
      expect(qualifyProspect({ ...valid, lastOutboundAt: evidence(value) }, now).status).toBe(
        "HOLD",
      );
    },
  );
});

describe("contradictory evidence and strict clocks", () => {
  it("does not ignore evidence explicitly denying search ownership", () => {
    expect(
      qualifyProspect({ ...valid, paidSearchResponsibility: evidence("ABSENT") }, now).status,
    ).toBe("REJECTED");
    expect(
      qualifyProspect(
        {
          ...valid,
          paidSearchResponsibility: {
            ...evidence("ABSENT" as const),
            verifiedAt: "2025-01-01T00:00:00Z",
          },
        },
        now,
      ).status,
    ).toBe("HOLD");
  });
  it("does not accept normalized midnight overflow as verification", () => {
    expect(
      qualifyProspect(
        {
          ...valid,
          emailVerification: { ...valid.emailVerification!, verifiedAt: "2026-10-14T24:00:00Z" },
        },
        now,
      ).status,
    ).toBe("HOLD");
  });
  it("accepts timezone-qualified equivalent outbound timestamps", () => {
    expect(
      qualifyProspect({ ...valid, lastOutboundAt: evidence("2026-06-15T15:00:00+03:00") }, now)
        .status,
    ).toBe("READY");
  });
  it("rejects invalid evaluation clocks", () => {
    expect(() => qualifyProspect(valid, new Date(NaN))).toThrow("Invalid qualification clock");
  });
});

describe("ambiguous source signals", () => {
  it.each([
    "unknown",
    "N/A",
    "Director of Search",
    "Digital Advertising Lead",
    "Assistant to VP Marketing",
  ])("holds ambiguous role: %s", (role) => {
    expect(qualifyProspect({ ...valid, role: evidence(role) }, now).status).toBe("HOLD");
  });
  it.each([
    { status: "UNKNOWN" as const },
    { status: "INVALID" as const },
    { emailMatchesCurrentRecord: false },
    { businessEmailVerified: false },
  ])("holds unusable email evidence: %j", (override) => {
    expect(
      qualifyProspect(
        {
          ...valid,
          emailVerification: evidence({ ...valid.emailVerification!.value, ...override }),
        },
        now,
      ).status,
    ).toBe("HOLD");
  });
});

describe("strict role responsibility gate",()=>{
  it("requires proof beyond a senior Search title and does not grant VP Marketing the CMO exception",()=>{
    for(const title of ["Head of Paid Search","VP Marketing","Director of PPC","VP Performance Marketing"])
      expect(qualifyProspect({...valid,role:evidence(title),paidSearchResponsibility:undefined},now).status).toBe("HOLD");
    expect(qualifyProspect({...valid,role:evidence("CMO"),paidSearchResponsibility:undefined},now).status).toBe("READY");
    expect(qualifyProspect({...valid,role:evidence("Head of Paid Social"),paidSearchResponsibility:evidence("PROVEN")},now).status).toBe("REJECTED");
  });
});
