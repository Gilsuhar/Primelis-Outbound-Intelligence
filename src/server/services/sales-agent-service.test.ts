import { describe, expect, it } from "vitest";

import { createSalesAgentPlan } from "./sales-agent-service";
import { eligibleProspect, qualificationNow } from "@/test/sales-agent-fixtures";

describe("sales agent service integration", () => {
  it("evaluates real evidence through qualification and ordered planning without granting approval", () => {
    const result = createSalesAgentPlan(eligibleProspect, qualificationNow);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.decision.status).toBe("READY");
    expect(result.data.decision.reasons.length).toBeGreaterThan(0);
    expect(result.data.evidence).toEqual(eligibleProspect);
    expect(result.data.tasks.map((task) => task.stage)).toEqual([
      "ACCOUNT_RESEARCH",
      "SERP_EVIDENCE",
      "SEQUENCE_DRAFT",
      "HUMAN_REVIEW",
    ]);
    expect(result.data.humanApproval).toMatchObject({ required: true, granted: false });
    expect(result.data.canSend).toBe(false);
    expect(Object.values(result.data.execution)).toEqual([false, false, false, false]);
  });

  it("returns HOLD and verification work for missing evidence", () => {
    const result = createSalesAgentPlan({}, qualificationNow);
    expect(result.ok && result.data.decision.status).toBe("HOLD");
    if (!result.ok) return;
    expect(result.data.decision.missingVerificationRequirements).toContain(
      "Outreach history incomplete",
    );
    expect(result.data.tasks.every((task) => task.stage === "QUALIFICATION")).toBe(true);
  });

  it("rejects suppressed prospects and schedules no tasks", () => {
    const result = createSalesAgentPlan(
      { ...eligibleProspect, hardBounced: true },
      qualificationNow,
    );
    expect(result.ok && result.data.decision.status).toBe("REJECTED");
    expect(result.ok && result.data.tasks).toEqual([]);
  });

  it.each([
    null,
    [],
    { canSend: true },
    { now: "2020-01-01" },
    { unsubscribed: "false" },
    { employeeCount: { value: "100" } },
  ])("rejects malformed input or control injection: %j", (input) => {
    expect(createSalesAgentPlan(input, qualificationNow)).toMatchObject({
      ok: false,
      code: "VALIDATION_ERROR",
    });
  });
});
