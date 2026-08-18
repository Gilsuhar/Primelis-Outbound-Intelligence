import { describe, expect, it } from "vitest";

import type { BuildSequenceInput, SequenceKnowledgeRecord } from "./types";
import { buildProspectIntelligence } from "./prospect-intelligence";

const input: BuildSequenceInput = {
  companyName: "Cursor",
  companyWebsite: "cursor.com",
  contactFirstName: "Ari",
  contactRole: "Head of Growth",
  observedTrigger: "Light discovery before pitching Signal",
  primaryChannel: "EMAIL",
  sequenceLength: 4,
  desiredTone: "CONSULTATIVE",
  desiredOverallDuration: "10 business days",
};

const proof: SequenceKnowledgeRecord = {
  id: "proof",
  title: "AppsFlyer proof",
  type: "CASE_STUDY",
  approvalStatus: "APPROVED",
  approvedText: "Case study: AppsFlyer. Brand ad spend decreased by 29% while qualified leads increased 25%.",
  channels: ["EMAIL", "LINKEDIN"],
  sourceIds: ["source-1"],
  sourceTitles: ["Approved source"],
  sourceDates: ["2026-01-01"],
};

describe("Prospect Intelligence extraction", () => {
  it("classifies SOLO evidence from multiple solo keywords", () => {
    const intelligence = buildProspectIntelligence({
      ...input,
      serpEvidence: "cursor - brand bidding alone\ncursor pricing - brand alone",
    });

    expect(intelligence.serpScenario).toBe("SOLO");
    expect(intelligence.serpEvidence.soloKeywords).toEqual([
      "cursor",
      "cursor pricing",
    ]);
    expect(intelligence.primaryAngle).toMatch(/solo branded-search periods/i);
  });

  it("classifies CONTESTED evidence when competitors are visible on all terms", () => {
    const intelligence = buildProspectIntelligence({
      ...input,
      serpEvidence: "cursor build - competitor visible\ncursor ai editor - competitor visible",
    });

    expect(intelligence.serpScenario).toBe("CONTESTED");
    expect(intelligence.primaryAngle).toMatch(/minimum defensive CPC/i);
  });

  it("classifies MIXED evidence when solo and contested terms are both supplied", () => {
    const intelligence = buildProspectIntelligence({
      ...input,
      serpEvidence: "cursor pricing - brand alone\ncursor build plan - competitor visible",
    });

    expect(intelligence.serpScenario).toBe("MIXED");
    expect(intelligence.primaryAngle).toMatch(/one static rule/i);
  });

  it("classifies UNKNOWN when no SERP evidence is supplied", () => {
    const intelligence = buildProspectIntelligence(input);

    expect(intelligence.serpScenario).toBe("UNKNOWN");
    expect(intelligence.confidence.serp).toBe("LOW");
    expect(intelligence.serpEvidence.soloKeywords).toEqual([]);
    expect(intelligence.serpEvidence.contestedKeywords).toEqual([]);
  });

  it("keeps generic all-keyword notes out of rendered keyword samples", () => {
    const intelligence = buildProspectIntelligence({
      ...input,
      serpEvidence: "solo brand moments on all kws biiding",
    });

    expect(intelligence.serpScenario).toBe("SOLO");
    expect(intelligence.serpEvidence.keywords).toEqual([]);
    expect(intelligence.serpEvidence.soloKeywords).toEqual([]);
  });

  it("extracts persona from supplied context without inventing responsibilities", () => {
    const intelligence = buildProspectIntelligence({
      ...input,
      contactRole: "Marketing Lead",
      prospectContext: "Ari posted about experimentation and growth efficiency across self-serve acquisition.",
    });

    expect(intelligence.persona).toBe("GROWTH");
    expect(intelligence.relevantFacts[0]).toContain("experimentation");
    expect(JSON.stringify(intelligence)).not.toMatch(/branded search responsibility/i);
  });

  it("recommends only an approved proof point when records include proof", () => {
    const intelligence = buildProspectIntelligence(input, [proof]);

    expect(intelligence.recommendedProofPoint).toContain("AppsFlyer");
    expect(intelligence.recommendedProofPoint).toContain("29%");
  });
});
