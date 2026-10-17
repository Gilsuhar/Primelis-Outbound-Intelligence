import { describe, expect, it } from "vitest";
import { assessDraftIntake, type DraftIntakeEvidence } from "./draft-intake-policy";

const base: DraftIntakeEvidence = {
  inOwnedScope: true,
  personaRelevant: true,
  emailValidity: "VALID",
  unsubscribed: false,
  hardBounced: false,
  complained: false,
  historyComplete: true,
  employmentVerified: true,
  conflictingOpportunity: false,
  lastOutboundAtKnown: true,
};

describe("draft-only intake policy", () => {
  it("permits drafting despite incomplete history, but warns explicitly", () => {
    const result = assessDraftIntake({
      ...base,
      historyComplete: false,
      lastOutboundAtKnown: false,
      employmentVerified: false,
      hardBounced: null,
      complained: null,
    });
    expect(result.status).toBe("DRAFT_ALLOWED");
    expect(result.warnings).toContain("OUTREACH_HISTORY_INCOMPLETE");
    expect(result.warnings).toContain("LAST_OUTBOUND_UNKNOWN");
    expect(result.warnings).toContain("EMPLOYMENT_NOT_VERIFIED");
  });
  it.each([
    ["invalid email", { emailValidity: "INVALID" as const }],
    ["irrelevant persona", { personaRelevant: false }],
    ["unsubscribe", { unsubscribed: true }],
    ["hard bounce", { hardBounced: true }],
    ["complaint", { complained: true }],
    ["opportunity", { conflictingOpportunity: true }],
    ["outside scope", { inOwnedScope: false }],
  ])("blocks drafting on %s", (_, changes) => {
    expect(assessDraftIntake({ ...base, ...changes }).status).toBe("BLOCKED");
  });
  it("never interprets unknown email or catch-all as validated", () => {
    for (const emailValidity of ["UNKNOWN", "CATCH_ALL"] as const) {
      const result = assessDraftIntake({ ...base, emailValidity });
      expect(result.warnings).toContain("EMAIL_NOT_VERIFIED");
    }
  });
});
