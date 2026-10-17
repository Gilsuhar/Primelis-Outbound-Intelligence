import { describe, expect, it } from "vitest";
import { selectOutreachWritingMode } from "./outreach-writing-mode";

describe("outreach writing mode", () => {
  it("selects evidence-led when sourced company insight is available", () => {
    const plan = selectOutreachWritingMode({
      hasVerifiedCompanyInsight: true,
      hasRelevantRoleContext: true,
      hasApprovedProductKnowledge: true,
    });
    expect(plan?.mode).toBe("EVIDENCE_LED");
    expect(plan?.allowsSending).toBe(false);
  });
  it("allows a clearly labelled insight-led editorial plan without company evidence", () => {
    const plan = selectOutreachWritingMode({
      hasVerifiedCompanyInsight: false,
      hasRelevantRoleContext: true,
      hasApprovedProductKnowledge: true,
    });
    expect(plan?.mode).toBe("INSIGHT_LED");
    expect(plan?.instructions.join(" ")).toContain("Do not fabricate");
    expect(plan?.requiresHumanReview).toBe(true);
    expect(plan?.allowsSending).toBe(false);
  });
  it.each([
    { hasRelevantRoleContext: false, hasApprovedProductKnowledge: true },
    { hasRelevantRoleContext: true, hasApprovedProductKnowledge: false },
  ])("refuses to generate without role context and approved product knowledge", (partial) => {
    expect(selectOutreachWritingMode({ hasVerifiedCompanyInsight: false, ...partial })).toBeNull();
  });
});
