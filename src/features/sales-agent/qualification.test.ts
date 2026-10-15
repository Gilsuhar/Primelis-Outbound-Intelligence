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
  currentEmploymentVerified: evidence(true),
  emailVerification: evidence({
    status: "VALID",
    independentlyVerified: true,
    emailMatchesCurrentRecord: true,
  }),
  lastOutboundAt: evidence("2026-06-15T12:00:00.000Z"),
  outreachHistoryComplete: true,
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
    expect(qualifyProspect({ ...valid, hubspotOwnerId: "1799882984" }, now).status).toBe("REJECTED");
  });

  it("rejects under-threshold companies", () => {
    expect(qualifyProspect({ ...valid, employeeCount: evidence(79) }, now).status).toBe("REJECTED");
    expect(qualifyProspect({ ...valid, annualRevenueUsd: evidence(29_999_999) }, now).status).toBe("REJECTED");
  });

  it("holds Growth roles without proven search responsibility", () => {
    expect(qualifyProspect({ ...valid, role: evidence("VP Growth") }, now).status).toBe("HOLD");
    expect(qualifyProspect({
      ...valid, role: evidence("VP Growth"), paidSearchResponsibility: evidence("PROVEN" as const),
    }, now).status).toBe("READY");
  });

  it("rejects paid social-only roles", () => {
    expect(qualifyProspect({ ...valid, role: evidence("Director of Paid Social") }, now).status).toBe("REJECTED");
  });

  it("requires independent verification, not just green status", () => {
    const unverified = evidence({
      status: "VALID" as const, independentlyVerified: false, emailMatchesCurrentRecord: true,
    });
    expect(qualifyProspect({ ...valid, emailVerification: unverified }, now).status).toBe("HOLD");
  });

  it("holds catch-all email", () => {
    const catchAll = evidence({
      status: "CATCH_ALL" as const, independentlyVerified: true, emailMatchesCurrentRecord: true,
    });
    expect(qualifyProspect({ ...valid, emailVerification: catchAll }, now).status).toBe("HOLD");
  });

  it("rejects unsubscribe and holds active sequences", () => {
    expect(qualifyProspect({ ...valid, unsubscribed: true }, now).status).toBe("REJECTED");
    expect(qualifyProspect({ ...valid, activeSequence: true }, now).status).toBe("HOLD");
  });

  it("holds when four full calendar months have not elapsed", () => {
    expect(qualifyProspect({
      ...valid, lastOutboundAt: evidence("2026-06-16T12:00:00.000Z"),
    }, now).status).toBe("HOLD");
  });

  it("holds unknown or missing eligibility signals", () => {
    expect(qualifyProspect({}, now).status).toBe("HOLD");
  });
});
