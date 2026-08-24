import { afterEach, describe, expect, it, vi } from "vitest";

import { buildProspectIntelligence } from "@/features/build-sequence/prospect-intelligence";
import type {
  BuildSequenceInput,
  SequenceKnowledgeRecord,
} from "@/features/build-sequence/types";
import {
  messageStrategyPlannerInternals,
  planAiMessageStrategy,
  type AiMessageStrategyProviderRequest,
} from "./message-strategy-planner";

const baseInput: BuildSequenceInput = {
  companyName: "Remofirst",
  companyWebsite: "https://remofirst.com",
  contactFirstName: "Chris",
  contactRole: "Head of Paid Search",
  observedTrigger: "Light discovery before pitching Signal",
  primaryChannel: "EMAIL",
  sequenceLength: 4,
  desiredTone: "DIRECT",
  desiredOverallDuration: "12 business days",
};

const proofRecord: SequenceKnowledgeRecord = {
  id: "proof-zoominfo",
  title: "ZoomInfo proof",
  type: "CASE_STUDY",
  approvalStatus: "APPROVED",
  approvedText:
    "ZoomInfo used Signal to reduce branded CPC by 40% while increasing MQL volume by 20%.",
  channels: ["EMAIL", "INTERNAL"],
  sourceIds: ["source-1"],
  sourceTitles: ["Approved proof"],
  sourceDates: ["2026-01-01"],
};

const productTruth: SequenceKnowledgeRecord = {
  id: "product-live-serp",
  title: "Signal live SERP monitoring",
  type: "PRODUCT_TRUTH",
  approvalStatus: "APPROVED",
  approvedText:
    "Signal monitors Google and Bing SERPs in real time and connects that visibility to paid-search decisions.",
  channels: ["EMAIL", "INTERNAL"],
  sourceIds: ["source-2"],
  sourceTitles: ["Approved product truth"],
  sourceDates: ["2026-01-01"],
};

const records = [productTruth, proofRecord];

function responseFor({
  request,
  primaryAngle,
  businessQuestion,
  whyNow,
  productGapId = "GOOGLE_ADS_LIVE_COMPETITION_GAP",
  capabilityId = "LIVE_SERP_COMPETITION",
  groundingReference,
}: {
  request: AiMessageStrategyProviderRequest;
  primaryAngle: string;
  businessQuestion: string;
  whyNow: string;
  productGapId?: string;
  capabilityId?: string;
  groundingReference: string;
}) {
  return {
    prospectInsight: groundingReference,
    whyNow,
    primaryAngle,
    secondaryAngle: `${primaryAngle} with a narrower operational follow-up`,
    businessQuestion,
    productGapId,
    relevantCapabilityId: capabilityId,
    proofPointId: "proof-zoominfo",
    openingStyle: (request.intelligence.relevantFacts.length ? "PROSPECT_FACT" : "BUSINESS_QUESTION") as
      | "PROSPECT_FACT"
      | "BUSINESS_QUESTION",
    sequenceNarrative: ([1, 2, 3, 4] as const).map((stepNumber) => ({
      stepNumber,
      objective: [
        "Open with the prospect-specific reason this is relevant.",
        "Explain the decision gap without repeating the opener.",
        "Use the verified SERP or methodology evidence conservatively.",
        "Use one approved proof point and keep the ask soft.",
      ][stepNumber - 1],
      newInformation: [
        primaryAngle,
        "How live SERP visibility changes bid and coverage decisions.",
        request.intelligence.serpScenario === "UNKNOWN"
          ? "No verified SERP evidence, so keep the check methodological."
          : `${request.intelligence.serpScenario} evidence from supplied keywords.`,
        "ZoomInfo approved result as the single proof point.",
      ][stepNumber - 1],
      angle: [
        primaryAngle,
        businessQuestion,
        request.intelligence.primaryAngle,
        "Proof-backed low-pressure evaluation.",
      ][stepNumber - 1],
      evidenceToUse: [
        groundingReference,
        "Signal monitors Google and Bing SERPs in real time",
        request.intelligence.serpEvidence.observations[0] ?? "No verified SERP evidence",
        "ZoomInfo used Signal to reduce branded CPC by 40% while increasing MQL volume by 20%.",
      ][stepNumber - 1],
      proofToUseId: stepNumber === 4 ? "proof-zoominfo" : undefined,
      CTAIntent: [
        "Ask whether this question is already handled.",
        "Ask how the team detects the moment.",
        "Ask whether a narrow review would help.",
        "Offer a quick overview.",
      ][stepNumber - 1],
      avoidRepeating: [
        "Do not explain methodology yet.",
        "Do not repeat the prospect fact.",
        "Do not restate the Google Ads gap.",
        "Do not introduce another proof point.",
      ][stepNumber - 1],
    })),
    emailStepPlans: ([1, 2, 3, 4] as const).map((stepNumber) => ({
      stepNumber,
      objective: [
        "Open with the prospect-specific reason this is relevant.",
        "Explain the decision gap without repeating the opener.",
        "Use the verified SERP or methodology evidence conservatively.",
        "Use one approved proof point and keep the ask soft.",
      ][stepNumber - 1],
      newInformation: [
        primaryAngle,
        "How live SERP visibility changes bid and coverage decisions.",
        request.intelligence.serpScenario === "UNKNOWN"
          ? "No verified SERP evidence, so keep the check methodological."
          : `${request.intelligence.serpScenario} evidence from supplied keywords.`,
        "ZoomInfo approved result as the single proof point.",
      ][stepNumber - 1],
      angle: [
        primaryAngle,
        businessQuestion,
        request.intelligence.primaryAngle,
        "Proof-backed low-pressure evaluation.",
      ][stepNumber - 1],
      evidenceToUse: [
        groundingReference,
        "Signal monitors Google and Bing SERPs in real time",
        request.intelligence.serpEvidence.observations[0] ?? "No verified SERP evidence",
        "ZoomInfo used Signal to reduce branded CPC by 40% while increasing MQL volume by 20%.",
      ][stepNumber - 1],
      proofToUseId: stepNumber === 4 ? "proof-zoominfo" : undefined,
      CTAIntent: [
        "Ask whether this question is already handled.",
        "Ask how the team detects the moment.",
        "Ask whether a narrow review would help.",
        "Offer a quick overview.",
      ][stepNumber - 1],
      avoidRepeating: [
        "Do not explain methodology yet.",
        "Do not repeat the prospect fact.",
        "Do not restate the Google Ads gap.",
        "Do not introduce another proof point.",
      ][stepNumber - 1],
    })),
    whyThisShouldResonate:
      "The plan uses a supplied prospect or account fact and connects it to an approved Signal capability.",
    confidence: (request.intelligence.relevantFacts.length ? "HIGH" : "MEDIUM") as
      | "HIGH"
      | "MEDIUM",
    groundingReferences: [groundingReference],
    selectedGoldStandardExampleIds: request.goldStandardExamples.map((example) => example.id).slice(0, 1),
  };
}

function inputFor(overrides: Partial<BuildSequenceInput>) {
  return { ...baseInput, ...overrides };
}

async function strategyFor(input: BuildSequenceInput) {
  const intelligence = buildProspectIntelligence(input, records);
  const strategy = await planAiMessageStrategy({
    input,
    intelligence,
    records,
    provider: async (request) => {
      const context = `${input.prospectContext ?? ""} ${input.companyContext ?? ""}`;
      if (/AI|automation|\$50M/i.test(context)) {
        return responseFor({
          request,
          groundingReference: "managed over $50M in paid media",
          whyNow:
            "The supplied context connects paid-media scale and AI automation interest to a live SERP decision gap.",
          primaryAngle: "Live decision gap between Google Ads reporting and SERP competition.",
          businessQuestion:
            "How do you know when branded bids should change because live competition changed?",
        });
      }
      if (/international|markets|countries/i.test(context)) {
        return responseFor({
          request,
          groundingReference: "expanded paid search into international markets",
          whyNow:
            "The supplied context points to changing branded-search decisions across markets.",
          primaryAngle: "Brand coverage decisions changing across markets and query sets.",
          businessQuestion:
            "How do you see which markets need defensive coverage and which can run with lower pressure?",
          capabilityId: "MARKET_VISIBILITY",
          productGapId: "STATIC_BID_RULE_GAP",
        });
      }
      if (/budget pressure|efficiency/i.test(context)) {
        return responseFor({
          request,
          groundingReference: "under budget pressure to improve efficiency",
          whyNow:
            "The supplied context makes minimum efficient branded CPC the most relevant question.",
          primaryAngle: "Minimum efficient CPC while maintaining paid-brand coverage.",
          businessQuestion:
            "How do you know where bids can potentially be reduced while maintaining coverage?",
          capabilityId: "AUCTION_CONDITION_BIDDING",
          productGapId: "QUIET_AUCTION_PRESSURE_GAP",
        });
      }
      return responseFor({
        request,
        groundingReference: request.intelligence.relevantFacts[0] ?? input.companyName,
        whyNow:
          "The supplied context supports a conservative branded-search visibility question.",
        primaryAngle: request.intelligence.primaryAngle,
        businessQuestion:
          "How do you see branded-search competition before deciding whether bids should change?",
      });
    },
  });
  return { intelligence, strategy };
}

describe("AI message strategy planner", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("varies strategy for the same persona and MIXED SERP based on grounded context", async () => {
    const shared = {
      contactRole: "Paid Search Lead",
      keywords: [
        { term: "remofirst pricing", status: "solo" as const },
        { term: "remofirst employer of record", status: "contested" as const, competitor: "Deel" },
      ],
    };
    const [aiAutomation, international, efficiency] = await Promise.all([
      strategyFor(inputFor({
        ...shared,
        prospectContext:
          "Chris has managed over $50M in paid media and is exploring AI and automation for paid-search decisions.",
      })),
      strategyFor(inputFor({
        ...shared,
        prospectContext:
          "Maya expanded paid search into international markets and several countries this year.",
      })),
      strategyFor(inputFor({
        ...shared,
        prospectContext:
          "Alex is under budget pressure to improve efficiency across branded search.",
      })),
    ]);

    expect(aiAutomation.intelligence.persona).toBe("PAID_SEARCH");
    expect(international.intelligence.persona).toBe("PAID_SEARCH");
    expect(efficiency.intelligence.persona).toBe("PAID_SEARCH");
    expect(aiAutomation.intelligence.serpScenario).toBe("MIXED");
    expect(international.intelligence.serpScenario).toBe("MIXED");
    expect(efficiency.intelligence.serpScenario).toBe("MIXED");

    expect(new Set([
      aiAutomation.strategy.primaryAngle,
      international.strategy.primaryAngle,
      efficiency.strategy.primaryAngle,
    ])).toHaveLength(3);
    expect(new Set([
      aiAutomation.strategy.businessQuestion,
      international.strategy.businessQuestion,
      efficiency.strategy.businessQuestion,
    ])).toHaveLength(3);
    expect(new Set([
      aiAutomation.strategy.sequenceNarrative[0].newInformation,
      international.strategy.sequenceNarrative[0].newInformation,
      efficiency.strategy.sequenceNarrative[0].newInformation,
    ])).toHaveLength(3);
  });

  it("covers realistic SOLO, CONTESTED, MIXED, UNKNOWN, strong and weak contexts", async () => {
    const cases = [
      inputFor({
        companyName: "Remofirst",
        contactFirstName: "Chris",
        prospectContext:
          "Chris has managed over $50M in paid media and is exploring AI and automation for paid-search decisions.",
      }),
      inputFor({
        companyName: "Merrell",
        contactFirstName: "Andy",
        prospectContext: "Andy recently joined Merrell as a paid search leader.",
        keywords: [{ term: "merrell shoes", status: "solo" }],
      }),
      inputFor({
        companyName: "Gong",
        prospectContext: "Dana owns paid search and is focused on conversion quality.",
        keywords: [{ term: "gong revenue intelligence", status: "contested", competitor: "Clari" }],
      }),
      inputFor({
        companyName: "Verint",
        prospectContext: "Jordan is a Senior Director of Performance Marketing focused on measurement.",
        keywords: [
          { term: "verint pricing", status: "solo" },
          { term: "verint contact center", status: "contested", competitor: "NICE" },
        ],
      }),
      inputFor({
        companyName: "Hostinger",
        prospectContext: "Miguel is focused on experimentation and AI in paid media.",
      }),
      inputFor({
        companyName: "Cursor",
        prospectContext: "Ava works on growth for Cursor AI editor.",
        keywords: [{ term: "Cursor pricing", status: "contested", competitor: "Windsurf" }],
      }),
      inputFor({
        companyName: "Acme",
        contactFirstName: "Taylor",
        contactRole: "Marketing Manager",
        prospectContext: "Taylor Marketing Manager Acme",
      }),
      inputFor({
        companyName: "Nike",
        prospectContext: "Paid search team reviewing efficiency.",
        keywords: [{ term: "nike shoes", status: "solo" }],
      }),
    ];

    const results = await Promise.all(cases.map(strategyFor));

    expect(results).toHaveLength(8);
    expect(results.map((result) => result.strategy.plannerMode)).toEqual(
      expect.arrayContaining(["AI_STRATEGY"]),
    );
    expect(results.map((result) => result.intelligence.serpScenario)).toEqual(
      expect.arrayContaining(["SOLO", "CONTESTED", "MIXED", "UNKNOWN"]),
    );
    expect(results.every((result) => result.strategy.sequenceNarrative.length === 4)).toBe(true);
    expect(results.every((result) => new Set(result.strategy.sequenceNarrative.map((step) => step.newInformation)).size === 4)).toBe(true);
  });

  it("retries once with validation feedback before accepting a corrected strategy", async () => {
    const input = inputFor({
      prospectContext:
        "Chris has managed over $50M in paid media and is exploring AI and automation for paid-search decisions.",
    });
    const intelligence = buildProspectIntelligence(input, records);
    let calls = 0;
    const strategy = await planAiMessageStrategy({
      input,
      intelligence,
      records,
      provider: async (request) => {
        calls += 1;
        if (calls === 1) {
          return responseFor({
            request,
            groundingReference: "global AI transformation",
            whyNow: "The supplied context points to global AI transformation.",
            primaryAngle: "Unsupported invented global AI transformation angle.",
            businessQuestion: "How are you transforming global paid media?",
          });
        }
        expect(request.validationFeedback?.length).toBeGreaterThan(0);
        return responseFor({
          request,
          groundingReference: "managed over $50M in paid media",
          whyNow:
            "The supplied context connects paid-media scale and AI automation interest to a live SERP decision gap.",
          primaryAngle: "Live decision gap between Google Ads reporting and SERP competition.",
          businessQuestion:
            "How do you know when branded bids should change because live competition changed?",
        });
      },
    });

    expect(calls).toBe(2);
    expect(strategy.plannerMode).toBe("AI_STRATEGY");
    expect(strategy.primaryAngle).toContain("Live decision gap");
  });

  it("falls back to deterministic planning when validation cannot pass", async () => {
    const input = inputFor({ prospectContext: "Taylor Marketing Manager Acme" });
    const intelligence = buildProspectIntelligence(input, records);
    const strategy = await planAiMessageStrategy({
      input,
      intelligence,
      records,
      provider: async (request) =>
        responseFor({
          request,
          groundingReference: "invented unsupported initiative",
          whyNow: "Invented unsupported initiative.",
          primaryAngle: "Invented unsupported initiative.",
          businessQuestion: "How are you handling the invented unsupported initiative?",
        }),
    });

    expect(strategy.plannerMode).toBe("DETERMINISTIC_FALLBACK");
    expect(strategy.primaryAngle).toBe(intelligence.primaryAngle);
  });

  it("rejects unapproved capability ids and unsupported organic-capture claims", () => {
    const input = inputFor({
      prospectContext:
        "Chris has managed over $50M in paid media and is exploring AI and automation for paid-search decisions.",
    });
    const intelligence = buildProspectIntelligence(input, records);
    const ai = responseFor({
      request: {
        input,
        intelligence,
        approvedCapabilities: messageStrategyPlannerInternals.approvedCapabilities,
        approvedProductGaps: messageStrategyPlannerInternals.approvedProductGaps,
        proofRecords: [{ id: "proof-zoominfo", text: proofRecord.approvedText }],
        goldStandardExamples: [],
      },
      groundingReference: "managed over $50M in paid media",
      whyNow: "The supplied context connects paid-media scale to live competition.",
      primaryAngle: "Unsupported organic capture angle.",
      businessQuestion: "When is organic already enough?",
      capabilityId: "MADE_UP_CAPABILITY",
    });

    const validation = messageStrategyPlannerInternals.validateAiStrategy({
      strategy: {
        ...ai,
        productGapId: "GOOGLE_ADS_LIVE_COMPETITION_GAP",
        relevantCapabilityId: "MADE_UP_CAPABILITY",
        businessQuestion: "When is organic already enough?",
      },
      input,
      intelligence,
      records,
    });

    expect(validation.ok).toBe(false);
    expect(validation.issues.join(" ")).toMatch(/Capability id is not approved|organic/i);
  });

  it("uses OpenAI strategy planning when only OPENAI_API_KEY is configured", async () => {
    const input = inputFor({
      prospectContext:
        "Chris has managed over $50M in paid media and is exploring AI and automation for paid-search decisions.",
    });
    const intelligence = buildProspectIntelligence(input, records);
    const requestShape: AiMessageStrategyProviderRequest = {
      input,
      intelligence,
      approvedCapabilities: messageStrategyPlannerInternals.approvedCapabilities,
      approvedProductGaps: messageStrategyPlannerInternals.approvedProductGaps,
      proofRecords: [{ id: "proof-zoominfo", text: proofRecord.approvedText }],
      goldStandardExamples: [],
    };
    const payload = responseFor({
      request: requestShape,
      groundingReference: "managed over $50M in paid media",
      whyNow:
        "The supplied context connects paid-media scale and AI automation interest to a live SERP decision gap.",
      primaryAngle: "Live decision gap between Google Ads reporting and SERP competition.",
      businessQuestion:
        "How do you know when branded bids should change because live competition changed?",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ output_text: JSON.stringify(payload) }),
      } as Response)),
    );

    const strategy = await planAiMessageStrategy({
      input,
      intelligence,
      records,
      env: { OPENAI_API_KEY: "redacted", OPENAI_MODEL: "gpt-test" } as unknown as NodeJS.ProcessEnv,
    });

    expect(strategy.plannerMode).toBe("AI_STRATEGY");
    expect(strategy.primaryAngle).toContain("Live decision gap");
  });
});
