import type {
  GoldStandardExample,
  ProspectIntelligence,
} from "./types";

export const goldStandardExamples = [
  {
    id: "chris-remofirst-meeting-booked",
    prospectPersona: ["PAID_SEARCH", "PERFORMANCE"],
    serpScenario: "UNKNOWN",
    outcome: "MEETING_BOOKED",
    subject: "the branded search question google ads can't answer",
    body: [
      "Hi Chris,",
      "I'm reaching out because you've managed over $50M in ad spend and are actively exploring how AI and automation can improve paid-search decisions.",
      "One area Google Ads still doesn't handle well is adapting branded bids to live SERP competition. It reports performance, but doesn't clearly distinguish between moments when Remofirst is defending against another advertiser and moments when it's paying alone.",
      "Signal automates that decision in real time. ZoomInfo used it to reduce branded CPC by 40% while increasing MQL volume by 20%.",
      "Curious if you've already explored this?",
    ].join("\n\n"),
    reasoningTags: [
      "PROSPECT_FACT",
      "PRODUCT_GAP",
      "LIVE_SERP",
      "SINGLE_PROOF",
      "LOW_PRESSURE_CTA",
    ],
    whyItWorked: [
      "Opened with a specific fact about the prospect",
      "Connected AI/automation interest to a real paid-search decision gap",
      "Explained a limitation of standard Google Ads reporting",
      "Used one Signal capability instead of a feature list",
      "Used one concrete customer result",
      "Ended with a natural exploratory CTA",
    ],
    approvedForLearning: true,
  },
] as const satisfies GoldStandardExample[];

function scoreExample(
  example: GoldStandardExample,
  intelligence: ProspectIntelligence,
  primaryAngle: string,
) {
  let score = 0;
  if (!example.approvedForLearning) return score;
  if (example.prospectPersona.includes(intelligence.persona)) score += 4;
  if (example.serpScenario === intelligence.serpScenario) score += 3;
  if (
    /\b(ai|automation|automate|google ads|paid-search|paid search|cpc|serp)\b/i.test(
      `${primaryAngle} ${intelligence.relevantFacts.join(" ")}`,
    )
  ) {
    score += example.reasoningTags.includes("PRODUCT_GAP") ? 2 : 0;
  }
  if (example.outcome === "MEETING_BOOKED") score += 1;
  return score;
}

export function selectGoldStandardExamples({
  intelligence,
  primaryAngle,
  limit = 3,
}: {
  intelligence: ProspectIntelligence;
  primaryAngle: string;
  limit?: number;
}) {
  return goldStandardExamples
    .map((example) => ({
      example,
      score: scoreExample(example, intelligence, primaryAngle),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ example }) => example);
}
