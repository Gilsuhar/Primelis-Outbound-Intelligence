import { describe, expect, it } from "vitest";

import {
  accountResearchWorkflow,
  aeHandoffFields,
  calculateProgress,
  canManagerApprove,
  claimsToAvoid,
  emptyProgress,
  evidenceDescriptions,
  industries,
  onboardingChecklist,
  outreachReplyEvidence,
  outreachPrinciples,
  playbookContentArchitecture,
  personas,
  practiceScenarios,
  qualificationGuidance,
  replyObjectionGuidance,
  sequenceGuidance,
  signalProductGuide,
  teamProspectReplyEvidence,
  winningMessageGroups,
  winningMessages,
  workflowGuide,
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

  it("includes team reply persona learning", () => {
    expect(personas.map((persona) => persona.name)).toContain(
      "Brand Marketing or Brand Leadership",
    );
    expect(teamProspectReplyEvidence.relatedBrandOrPaidMediaProspects).toBe(20);
    expect(teamProspectReplyEvidence.personaLearning.map((persona) => persona.label)).toContain(
      "Brand and brand marketing leaders",
    );
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
    expect(winningMessages.length).toBeGreaterThanOrEqual(16);
    expect(winningMessageGroups.map((group) => group.label)).toEqual([
      "Email",
      "LinkedIn",
      "Reply handling",
    ]);
    expect(new Set(winningMessages.map((message) => message.message)).size).toBe(
      winningMessages.length,
    );
    expect(outreachReplyEvidence.relatedReplyRows).toBe(179);
    expect(outreachReplyEvidence.currentProductName).toContain("Signal");
    expect(
      outreachReplyEvidence.strongestTemplateClusters.map((cluster) => cluster.label),
    ).toContain("Auto Disable Branded Ads");
    expect(outreachReplyEvidence.stepLearning.join(" ")).toContain("Step 2");
    expect(winningMessages.map((message) => message.title)).toContain(
      "Email subject - deactivating branded ads",
    );
    expect(winningMessages.map((message) => message.title)).toContain(
      "After connect - two-outcome explainer",
    );
    expect(winningMessages.map((message) => message.title)).toContain("LinkedIn comment follow-up");
    expect(winningMessages.map((message) => message.title)).toContain("Deck request reply");
    expect(
      winningMessages.some((message) =>
        message.message.includes("where paid brand coverage is still needed"),
      ),
    ).toBe(true);
  });

  it("defines a safe onboarding and product-reference structure", () => {
    expect(onboardingChecklist.map((item) => item.title)).toEqual([
      "Learn the product",
      "Check account fit",
      "Write from approved context",
      "Handle replies carefully",
      "Ask before inventing",
    ]);
    expect(signalProductGuide.map((item) => item.title)).toEqual([
      "Signal overview",
      "Solo Bidder",
      "CPC Optimization",
      "Incrementality",
      "Monitoring versus automation",
    ]);
    expect(signalProductGuide.map((item) => item.avoid).join(" ")).toMatch(/guaranteed savings/i);
    expect(playbookContentArchitecture.join(" ")).toMatch(/Example wording teaches phrasing only/i);
  });

  it("covers workflow, qualification, handoff, and prohibited-claim guidance", () => {
    expect(workflowGuide.map((item) => item.tool)).toEqual([
      "Account Research",
      "ICP Insights",
      "Create Outreach",
      "Build Sequence",
      "Reply to Prospect",
      "Ask Signal Brain",
      "Do Not Contact",
      "Knowledge Library",
    ]);
    expect(accountResearchWorkflow.join(" ")).toMatch(/separate approved facts/i);
    expect(outreachPrinciples.join(" ")).toMatch(/one CTA/i);
    expect(sequenceGuidance.map((item) => item.step)).toContain("Stop rule");
    expect(qualificationGuidance.strongSignals.join(" ")).toMatch(/branded-search demand/i);
    expect(aeHandoffFields.join(" ")).toMatch(/Confirmed facts versus assumptions/i);
    expect(claimsToAvoid.join(" ")).toMatch(/Do not invent pricing/i);
    expect(claimsToAvoid.join(" ")).toMatch(/Do not claim competitors are bidding/i);
  });

  it("maps Phase 7 reply intents into playbook objection guidance", () => {
    expect(replyObjectionGuidance.map((item) => item.intent)).toEqual([
      "Deck request",
      "Pricing or fee structure",
      "ROI or value",
      "Data-source question",
      "Existing dashboard or monitoring",
      "Agency, internal tool, or vendor",
      "Does not want to pause",
      "Timing, referral, or decline",
    ]);
    expect(replyObjectionGuidance.map((item) => item.avoid).join(" ")).toMatch(
      /Do not invent tiers/i,
    );
    expect(replyObjectionGuidance.map((item) => item.answerFirst).join(" ")).toMatch(
      /live Google and Bing/i,
    );
  });
});
