import { describe, expect, it } from "vitest";

import {
  calculateProgress,
  canManagerApprove,
  emptyProgress,
  evidenceDescriptions,
  industries,
  practiceScenarios,
  winningMessages,
} from "./playbook-content";

describe("Signal Playbook content", () => {
  it("includes proven, hypothesis, and exploratory evidence labels", () => {
    expect(Object.keys(evidenceDescriptions)).toEqual([
      "PROVEN",
      "STRONG_HYPOTHESIS",
      "EXPLORATORY",
    ]);
    expect(new Set(industries.map((industry) => industry.evidenceLevel))).toEqual(
      new Set(["PROVEN", "STRONG_HYPOTHESIS", "EXPLORATORY"]),
    );
  });

  it("calculates lightweight progress", () => {
    const progress = { ...emptyProgress(), learnSignal: true, icp: true };
    const view = calculateProgress(progress, "SALES_USER");

    expect(view.completionPercentage).toBe(20);
    expect(view.readinessStatus).toBe("In progress");
    expect(view.managerApprovalVisible).toBe(false);
  });

  it("protects manager approval by role", () => {
    expect(canManagerApprove("SALES_USER")).toBe(false);
    expect(canManagerApprove("KNOWLEDGE_ADMIN")).toBe(true);
  });

  it("keeps practice simple and non-AI", () => {
    expect(practiceScenarios).toHaveLength(5);
    expect(practiceScenarios.map((scenario) => scenario.id)).toEqual([
      "existing-adthena",
      "methodology-question",
      "auction-insights",
      "deck-request",
      "timing-objection",
    ]);
  });

  it("includes a compact winning messages library", () => {
    expect(winningMessages.length).toBeGreaterThanOrEqual(10);
    expect(winningMessages.map((message) => message.title)).toContain(
      "After connect - quick chat",
    );
    expect(winningMessages.map((message) => message.title)).toContain("Deck request reply");
    expect(
      winningMessages.some((message) =>
        message.message.includes("where paid brand coverage is still needed"),
      ),
    ).toBe(true);
  });
});
