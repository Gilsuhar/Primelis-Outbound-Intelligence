import { describe, expect, it } from "vitest";

import { buildProspectIntelligence } from "./prospect-intelligence";
import { selectGoldStandardExamples } from "./gold-standard-examples";
import { planMessageStrategy } from "./strategy-planner";
import type { BuildSequenceInput, SequenceKnowledgeRecord } from "./types";

const baseInput: BuildSequenceInput = {
  companyName: "Remofirst",
  companyWebsite: "remofirst.com",
  contactFirstName: "Chris",
  contactRole: "Head of Paid Search",
  companyContext: "B2B SaaS company",
  observedTrigger: "Light discovery before pitching Signal",
  primaryChannel: "EMAIL",
  sequenceLength: 4,
  desiredTone: "DIRECT",
  desiredOverallDuration: "12 business days",
};

const proofRecord: SequenceKnowledgeRecord = {
  id: "case-zoominfo",
  title: "ZoomInfo reduced branded CPC",
  type: "CASE_STUDY",
  approvalStatus: "APPROVED",
  approvedText:
    "ZoomInfo used Signal to reduce branded CPC by 40% while increasing MQL volume by 20%.",
  channels: ["EMAIL", "INTERNAL"],
  sourceIds: ["source-1"],
  sourceTitles: ["Approved proof"],
  sourceDates: ["2026-01-01"],
};

function strategyFor(input: Partial<BuildSequenceInput> = {}) {
  const merged = { ...baseInput, ...input };
  const records = [proofRecord];
  const intelligence = buildProspectIntelligence(merged, records);
  return {
    input: merged,
    intelligence,
    strategy: planMessageStrategy({ input: merged, intelligence, records }),
    examples: selectGoldStandardExamples({ intelligence, primaryAngle: intelligence.primaryAngle }),
  };
}

describe("Build Sequence strategy planner", () => {
  it("uses a strong supplied prospect fact when it is relevant", () => {
    const { strategy } = strategyFor({
      prospectContext:
        "Chris has managed over $50M in ad spend and is exploring how AI and automation can improve paid-search decisions.",
    });

    expect(strategy.prospectInsight).toContain("$50M");
    expect(strategy.openingStyle).toBe("PROSPECT_FACT");
    expect(strategy.whyThisShouldResonate).toContain("real supplied prospect fact");
  });

  it("falls back safely when prospect context is weak", () => {
    const { strategy } = strategyFor({ prospectContext: undefined });

    expect(strategy.prospectInsight).toContain("Head of Paid Search");
    expect(strategy.prospectInsight).not.toMatch(/\$|managed over|exploring AI/i);
    expect(strategy.confidence).not.toBe("HIGH");
  });

  it("builds a clean prospect brief and rejects weak personalization fragments", () => {
    const { strategy } = strategyFor({
      companyName: "SearchPilot",
      contactFirstName: "Ari",
      contactRole: "Paid Media Lead",
      prospectContext: [
        "Ari Cohen",
        "Current: Paid Media Lead at SearchPilot",
        "In-depth knowledge of the paid digital media channels covering programmatic, paid,",
        "Skills: programmatic, paid,",
      ].join("\n"),
    });

    expect(strategy.prospectBrief?.strongestUsableProspectInsight).toBeUndefined();
    expect(strategy.prospectBrief?.roleCompanyFallback).toContain("Paid Media Lead role at SearchPilot");
    expect(strategy.prospectBrief?.factsToAvoid.join(" ")).toMatch(/In-depth knowledge|Skills:/i);
    expect(strategy.prospectBrief?.copyGuidance.join(" ")).toContain("Do not force personalization");
  });

  it("selects the Chris Remofirst gold standard for a paid-search AI automation context", () => {
    const { strategy, examples } = strategyFor({
      prospectContext:
        "Chris has managed over $50M in ad spend and is exploring how AI and automation can improve paid-search decisions.",
    });

    expect(examples.map((example) => example.id)).toContain("chris-remofirst-meeting-booked");
    expect(strategy.selectedGoldStandardExampleIds).toContain("chris-remofirst-meeting-booked");
  });

  it("reflects a SOLO scenario as a solo-period opportunity", () => {
    const { strategy, intelligence } = strategyFor({
      keywords: [{ term: "remofirst pricing", status: "solo" }],
    });

    expect(intelligence.serpScenario).toBe("SOLO");
    expect(strategy.businessQuestion).toContain("brand is alone");
    expect(strategy.relevantCapability).toContain("solo branded-search periods");
  });

  it("reflects a CONTESTED scenario as minimum defensive CPC", () => {
    const { strategy, intelligence } = strategyFor({
      keywords: [{ term: "remofirst payroll", status: "contested", competitor: "Deel" }],
    });

    expect(intelligence.serpScenario).toBe("CONTESTED");
    expect(strategy.businessQuestion).toContain("minimum CPC");
    expect(strategy.productGap).toContain("minimum defensive CPC");
  });

  it("reflects a MIXED scenario as different auction conditions", () => {
    const { strategy, intelligence } = strategyFor({
      keywords: [
        { term: "remofirst pricing", status: "solo" },
        { term: "remofirst payroll", status: "contested", competitor: "Deel" },
      ],
    });

    expect(intelligence.serpScenario).toBe("MIXED");
    expect(strategy.businessQuestion).toContain("coverage is defensive");
    expect(strategy.productGap).toContain("different auctions");
  });

  it("does not invent a SERP observation for UNKNOWN scenarios", () => {
    const { strategy, intelligence } = strategyFor({ keywords: undefined, serpEvidence: undefined });

    expect(intelligence.serpScenario).toBe("UNKNOWN");
    expect(strategy.sequenceNarrative[2].newInformation).toContain("paid-brand decision question");
    expect(strategy.businessQuestion).toContain("when branded-search competition changes");
  });

  it("uses exactly one approved proof point where appropriate", () => {
    const { strategy } = strategyFor();

    expect(strategy.proofPoint).toBe(proofRecord.approvedText);
    expect(strategy.proofPoint?.match(/ZoomInfo/g)).toHaveLength(1);
  });

  it("sets distinct CTA intents and narrative steps", () => {
    const { strategy } = strategyFor();

    expect(new Set(strategy.sequenceNarrative.map((item) => item.ctaIntent)).size).toBe(4);
    expect(new Set(strategy.sequenceNarrative.map((item) => item.objective)).size).toBe(4);
  });

  it("stores gold standards as learning examples, not copy directives", () => {
    const { examples } = strategyFor({
      prospectContext:
        "Chris has managed over $50M in ad spend and is exploring how AI and automation can improve paid-search decisions.",
    });

    const chris = examples.find((example) => example.id === "chris-remofirst-meeting-booked");
    expect(chris?.approvedForLearning).toBe(true);
    expect(chris?.whyItWorked).toContain("Used one concrete customer result");
  });
});
