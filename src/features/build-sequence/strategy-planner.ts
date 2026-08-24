import type {
  BuildSequenceInput,
  MessageStrategy,
  ProspectIntelligence,
  SequenceKnowledgeRecord,
} from "./types";
import { selectGoldStandardExamples } from "./gold-standard-examples";

function compact(value?: string) {
  return value?.replace(/\s+/g, " ").trim();
}

function firstProspectFact(intelligence: ProspectIntelligence) {
  return intelligence.selectedInsights[0]?.text ?? intelligence.relevantFacts.find(Boolean);
}

function hasSelectedInsight(intelligence: ProspectIntelligence) {
  return intelligence.selectedInsights.length > 0;
}

function firstCaseStudy(records: SequenceKnowledgeRecord[]) {
  return records.find((record) => record.type === "CASE_STUDY")?.approvedText;
}

function capabilityFor(intelligence: ProspectIntelligence) {
  if (intelligence.serpScenario === "CONTESTED") {
    return "Signal monitors live SERP competition so teams can defend branded terms without defaulting to one high CPC rule.";
  }
  if (intelligence.serpScenario === "SOLO") {
    return "Signal detects solo branded-search periods so teams can lower pressure only when coverage is still protected.";
  }
  if (intelligence.serpScenario === "MIXED") {
    return "Signal separates solo and contested branded auctions so bid decisions can change with the page.";
  }
  return "Signal monitors Google and Bing SERPs in real time and connects that visibility to paid-search decisions.";
}

function productGapFor(intelligence: ProspectIntelligence) {
  if (intelligence.serpScenario === "CONTESTED") {
    return "Google Ads can show performance, but it does not clearly answer the minimum defensive CPC needed when another advertiser appears.";
  }
  if (intelligence.serpScenario === "SOLO") {
    return "Google Ads can show branded campaign performance, but it does not clearly separate quiet auctions from defensive ones.";
  }
  if (intelligence.serpScenario === "MIXED") {
    return "A single branded-bid rule treats different auctions alike even when the SERP conditions are changing.";
  }
  return "Google Ads reports performance, but it does not clearly distinguish moments when the brand is defending against another advertiser from moments when it is paying alone.";
}

function businessQuestionFor(input: BuildSequenceInput, intelligence: ProspectIntelligence) {
  const currentScopeText = [
    input.companyContext,
    input.internalNotes,
    ...intelligence.contextInterpretation.currentResponsibilities.map((item) => item.text),
    ...intelligence.contextInterpretation.currentPrioritiesOrInterests.map((item) => item.text),
    ...intelligence.contextInterpretation.currentToolsOrChannels.map((item) => item.text),
  ].join(" ");
  const scope = /\b(agency|managed accounts|multiple accounts|client accounts|portfolio|clients?)\b/i.test(
    currentScopeText,
  )
    ? " across the accounts your team manages"
    : "";
  if (intelligence.serpScenario === "CONTESTED") {
    return `When competitors appear${scope}, how do you know the minimum CPC needed to defend the brand?`;
  }
  if (intelligence.serpScenario === "SOLO") {
    return `When the brand is alone${scope}, how do you know whether the same CPC is still necessary?`;
  }
  if (intelligence.serpScenario === "MIXED") {
    return `How do you decide when branded coverage is defensive and when the auction is quiet enough to lower pressure${scope}?`;
  }
  return `How do you see when branded-search competition changes${scope} before deciding whether bids should change?`;
}

function openingStyleFor(intelligence: ProspectIntelligence): MessageStrategy["openingStyle"] {
  if (hasSelectedInsight(intelligence)) return "PROSPECT_FACT";
  if (intelligence.serpScenario !== "UNKNOWN") return "SERP_EVIDENCE";
  if (intelligence.companyContext.length > 0) return "ACCOUNT_OBSERVATION";
  if (intelligence.persona === "PAID_SEARCH" || intelligence.persona === "PERFORMANCE") {
    return "BUSINESS_QUESTION";
  }
  return "MARKET_INSIGHT";
}

function prospectInsightFor(input: BuildSequenceInput, intelligence: ProspectIntelligence) {
  const fact = firstProspectFact(intelligence);
  if (fact) return fact;
  if (intelligence.contextInterpretation.currentRole) {
    return `${intelligence.contextInterpretation.currentRole} at ${intelligence.contextInterpretation.currentCompany ?? compact(input.companyName) ?? "the account"}`;
  }
  if (intelligence.jobTitle) {
    return `${intelligence.jobTitle} at ${intelligence.contextInterpretation.currentCompany ?? compact(input.companyName) ?? "the account"}`;
  }
  return `A ${intelligence.persona.toLowerCase().replaceAll("_", " ")} buyer at ${intelligence.contextInterpretation.currentCompany ?? compact(input.companyName) ?? "the account"}`;
}

function narrativeFor(intelligence: ProspectIntelligence, hasProspectFact: boolean): MessageStrategy["sequenceNarrative"] {
  const evidencePhrase =
    intelligence.serpScenario === "UNKNOWN"
      ? "No unsupported SERP observation; keep this as a visibility question."
      : `Use the ${intelligence.serpScenario.toLowerCase()} branded-search evidence without overclaiming.`;
  return [
    {
      step: 1,
      objective: hasProspectFact
        ? "Open with the strongest real prospect fact and turn it into a paid-search question."
        : "Open with a role- or account-level paid-search question without inventing context.",
      newInformation: hasProspectFact ? "Specific prospect context" : "Relevant role/account angle",
      ctaIntent: "Ask whether this is already handled.",
    },
    {
      step: 2,
      objective: "Expand the business problem and show the process gap.",
      newInformation: "Why standard reporting or one static bid rule misses the decision.",
      ctaIntent: "Ask whether the team can detect the moment.",
    },
    {
      step: 3,
      objective: "Introduce the most relevant Signal capability only once.",
      newInformation: evidencePhrase,
      ctaIntent: "Ask if a narrow look would be useful.",
    },
    {
      step: 4,
      objective: "Use one concrete proof point and convert softly.",
      newInformation: "One approved customer result or a safe proof fallback.",
      ctaIntent: "Offer a quick overview without pressure.",
    },
  ];
}

function stepPlansFromNarrative(
  narrative: MessageStrategy["sequenceNarrative"],
  strategy: Pick<MessageStrategy, "primaryAngle" | "relevantCapability" | "proofPoint">,
): NonNullable<MessageStrategy["emailStepPlans"]> {
  return narrative.map((item) => ({
    stepNumber: item.step,
    objective: item.objective,
    newInformation: item.newInformation,
    angle: item.step === 2 ? strategy.relevantCapability : strategy.primaryAngle,
    evidenceToUse: item.newInformation,
    proofToUse: item.step === 4 ? strategy.proofPoint : undefined,
    CTAIntent: item.ctaIntent,
    avoidRepeating: item.step === 1
      ? "Do not explain the full methodology yet."
      : "Do not restate the prior step's opening or business question.",
  }));
}

export function planMessageStrategy({
  input,
  intelligence,
  records,
}: {
  input: BuildSequenceInput;
  intelligence: ProspectIntelligence;
  records: SequenceKnowledgeRecord[];
}): MessageStrategy {
  const prospectInsight = prospectInsightFor(input, intelligence);
  const proofPoint = firstCaseStudy(records) ?? intelligence.recommendedProofPoint;
  const primaryAngle = intelligence.primaryAngle;
  const selectedGoldStandards = selectGoldStandardExamples({ intelligence, primaryAngle });
  const hasProspectFact = hasSelectedInsight(intelligence);
  const sequenceNarrative = narrativeFor(intelligence, hasProspectFact);
  const confidence: MessageStrategy["confidence"] =
    hasProspectFact && intelligence.confidence.serp !== "LOW"
      ? "HIGH"
      : hasProspectFact || intelligence.confidence.serp !== "LOW"
        ? "MEDIUM"
        : "LOW";

  return {
    prospectInsight,
    whyNow: hasProspectFact
      ? "The supplied prospect context gives a real reason to connect their work to branded-search decision quality."
      : "The supplied context is light, so the safest reason to reach out is a narrow paid-brand visibility question.",
    businessQuestion: businessQuestionFor(input, intelligence),
    productGap: productGapFor(intelligence),
    primaryAngle,
    secondaryAngle: intelligence.secondaryAngle,
    relevantCapability: capabilityFor(intelligence),
    proofPoint,
    whyThisShouldResonate: hasProspectFact
      ? "The sequence can start from a real supplied prospect fact, then connect it to a specific branded-search decision."
      : "The supplied prospect context is light, so the sequence should stay role- and account-level instead of inventing achievements.",
    openingStyle: openingStyleFor(intelligence),
    sequenceNarrative,
    emailStepPlans: stepPlansFromNarrative(sequenceNarrative, { primaryAngle, relevantCapability: capabilityFor(intelligence), proofPoint }),
    confidence,
    selectedGoldStandardExampleIds: selectedGoldStandards.map((example) => example.id),
    groundingReferences: [
      prospectInsight,
      ...intelligence.selectedInsights.map((insight) => insight.groundingReference),
      ...intelligence.relevantFacts,
      ...intelligence.serpEvidence.observations,
    ].filter(Boolean).slice(0, 8),
    plannerMode: "DETERMINISTIC_FALLBACK",
  };
}
