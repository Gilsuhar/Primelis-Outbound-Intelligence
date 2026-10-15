import { describe, expect, it } from "vitest";
import { planProspectWorkflow } from "./orchestrator";
import { SIGNAL_HUBSPOT_OWNER_ID, type ProspectQualificationInput } from "./qualification";

const evidence = <T>(value: T) => ({
  value,
  source: "test-verified",
  verifiedAt: "2026-10-15T08:00:00.000Z",
});

const eligible: ProspectQualificationInput = {
  hubspotRecordId: "hubspot-42",
  hubspotOwnerId: SIGNAL_HUBSPOT_OWNER_ID,
  employeeCount: evidence(200),
  annualRevenueUsd: evidence(100_000_000),
  role: evidence("Head of Paid Search"),
  currentEmploymentVerified: evidence(true),
  emailVerification: evidence({
    status: "VALID",
    independentlyVerified: true,
    emailMatchesCurrentRecord: true,
    businessEmailVerified: true,
  }),
  lastOutboundAt: evidence(null),
  outreachHistoryComplete: true,
  eligibilityEvidence: evidence(true),
  employmentIndependentlyVerified: true,
  unsubscribed: false,
  hardBounced: false,
  complained: false,
  activeSequence: false,
  conflictingActiveOpportunity: false,
};

describe("Agent workflow planner", () => {
  it("plans research, manual SERP evidence, draft, and human review for qualified contacts", () => {
    const result = planProspectWorkflow(eligible, new Date("2026-10-15T12:00:00Z"));
    expect(result.decision.status).toBe("READY");
    expect(result.tasks.map((task) => task.stage)).toEqual([
      "ACCOUNT_RESEARCH",
      "SERP_EVIDENCE",
      "SEQUENCE_DRAFT",
      "HUMAN_REVIEW",
    ]);
    expect(result.tasks.find((task) => task.stage === "SERP_EVIDENCE")?.requiresHumanApproval).toBe(
      true,
    );
    expect(result.canSend).toBe(false);
  });

  it("plans only missing verification tasks for held contacts", () => {
    const result = planProspectWorkflow({ ...eligible, outreachHistoryComplete: false });
    expect(result.decision.status).toBe("HOLD");
    expect(result.tasks.every((task) => task.stage === "QUALIFICATION")).toBe(true);
    expect(result.canSend).toBe(false);
  });

  it("never plans outbound work for rejected contacts", () => {
    const result = planProspectWorkflow({ ...eligible, hubspotOwnerId: "other" });
    expect(result.decision.status).toBe("REJECTED");
    expect(result.tasks).toEqual([]);
    expect(result.canSend).toBe(false);
  });
});
