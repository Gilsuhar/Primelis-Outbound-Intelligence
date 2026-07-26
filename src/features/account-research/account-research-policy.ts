import { searchDoNotContactRecords } from "@/features/do-not-contact/do-not-contact-policy";
import type { DoNotContactRecord } from "@/features/do-not-contact/types";
import { industries, personas } from "@/features/playbook/playbook-content";

import type {
  AccountResearchInput,
  AngleRecommendation,
  ConfidenceLevel,
  FactClassification,
  FactStatus,
  FilteredResearchHandoff,
  IndustryEvidence,
  PersonaRecommendation,
  QualificationResult,
  ResearchResultStructure,
  ResearchTrustLevel,
  StakeholderRecommendation,
  SuppressionResult,
  YesNoUnknown,
} from "./types";

const fieldLabels: Record<string, string> = {
  companyName: "Company name",
  companyDomain: "Company domain",
  industry: "Industry",
  headquartersOrMainMarket: "Headquarters or main market",
  marketsOrCountries: "Markets or countries",
  revenueContext: "Revenue context",
  employeeContext: "Employee context",
  companyType: "Company type",
  brandedSearchAdsActive: "Branded-search ads active",
  strongOrganicBrandVisibility: "Strong organic brand visibility",
  meaningfulBrandedSearchDemand: "Meaningful branded-search demand",
  multiMarketOrBrandComplexity: "Multi-market or multi-brand complexity",
  dedicatedPaidSearchOrPerformanceTeam: "Dedicated Paid Search or Performance team",
  knownPaidSearchOwner: "Known Paid Search owner",
  knownCurrentToolOrVendor: "Known current tool or vendor",
  meaningfulPaidSearchInvestment: "Meaningful Paid Search investment",
  observedTrigger: "Observed trigger",
  knownPain: "Known pain",
  accountOwner: "Account owner",
  lastContactDate: "Last contact date",
  existingCustomer: "Existing customer",
  activeOpportunity: "Active opportunity",
  ownedByAnotherRep: "Owned by another rep",
  doNotContactStatus: "Do Not Contact status",
  internalNotes: "Internal notes",
};

const provenIndustries = new Set([
  "fashion and luxury",
  "retail and e-commerce",
  "b2b saas and technology",
]);
const strongHypothesisIndustries = new Set([
  "travel and airlines",
  "fintech and financial services",
  "marketplaces",
  "subscription businesses",
  "telecommunications",
  "gaming",
  "hospitality",
]);
const exploratoryIndustries = new Set([
  "automotive",
  "insurance",
  "health and wellness",
  "consumer services",
  "home services",
  "education",
  "media",
  "b2b services",
]);

const researchChecklist = [
  "Check branded ads",
  "Check organic brand visibility",
  "Confirm markets and countries",
  "Identify Paid Search ownership",
  "Confirm current tool if known",
  "Check Do Not Contact",
  "Separate verified facts from assumptions",
  "Select persona",
  "Select angle",
  "Choose next workflow",
];

const requiredResearchFields = new Set([
  "companyName",
  "companyDomain",
  "industry",
  "brandedSearchAdsActive",
  "strongOrganicBrandVisibility",
  "meaningfulBrandedSearchDemand",
  "dedicatedPaidSearchOrPerformanceTeam",
  "meaningfulPaidSearchInvestment",
  "doNotContactStatus",
]);

const aiRelevantFields = new Set([
  "companyName",
  "companyDomain",
  "industry",
  "headquartersOrMainMarket",
  "marketsOrCountries",
  "revenueContext",
  "employeeContext",
  "brandedSearchAdsActive",
  "strongOrganicBrandVisibility",
  "meaningfulBrandedSearchDemand",
  "multiMarketOrBrandComplexity",
  "dedicatedPaidSearchOrPerformanceTeam",
  "knownPaidSearchOwner",
  "knownCurrentToolOrVendor",
  "meaningfulPaidSearchInvestment",
  "observedTrigger",
  "knownPain",
  "existingCustomer",
  "activeOpportunity",
  "ownedByAnotherRep",
  "doNotContactStatus",
]);

function normalize(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

function factStatus(input: AccountResearchInput, field: string, fallback: FactStatus) {
  return input.factStatuses[field] ?? fallback;
}

function trustLevelFor(status: FactStatus, field: string): ResearchTrustLevel {
  if (status === "VERIFIED") return "VERIFIED_APPROVED_INTERNAL";
  if (status === "USER_PROVIDED") return "USER_PROVIDED";
  if (status === "ASSUMPTION") return "MODEL_INFERENCE";
  if (/import|provider|enrichment/i.test(field)) return "IMPORTED_UNVERIFIED";
  return "UNKNOWN";
}

function sourceFor(status: FactStatus) {
  if (status === "VERIFIED") return "Approved internal or reviewed evidence";
  if (status === "USER_PROVIDED") return "Manual user input";
  if (status === "ASSUMPTION") return "Model or seller inference";
  return "Not provided";
}

function labelFor(value: YesNoUnknown) {
  if (value === "YES") return "Yes";
  if (value === "NO") return "No";
  return "Unknown";
}

export function classifyFacts(input: AccountResearchInput): FactClassification[] {
  const values: Record<string, string | undefined> = {
    companyName: input.companyName,
    companyDomain: input.companyDomain,
    industry: input.industry,
    headquartersOrMainMarket: input.headquartersOrMainMarket,
    marketsOrCountries: input.marketsOrCountries,
    revenueContext: input.revenueContext,
    employeeContext: input.employeeContext,
    companyType: input.companyType,
    brandedSearchAdsActive: labelFor(input.brandedSearchAdsActive),
    strongOrganicBrandVisibility: labelFor(input.strongOrganicBrandVisibility),
    meaningfulBrandedSearchDemand: labelFor(input.meaningfulBrandedSearchDemand),
    multiMarketOrBrandComplexity: labelFor(input.multiMarketOrBrandComplexity),
    dedicatedPaidSearchOrPerformanceTeam: labelFor(input.dedicatedPaidSearchOrPerformanceTeam),
    knownPaidSearchOwner: input.knownPaidSearchOwner,
    knownCurrentToolOrVendor: input.knownCurrentToolOrVendor,
    meaningfulPaidSearchInvestment: labelFor(input.meaningfulPaidSearchInvestment),
    observedTrigger: input.observedTrigger,
    knownPain: input.knownPain,
    accountOwner: input.accountOwner,
    lastContactDate: input.lastContactDate,
    existingCustomer: labelFor(input.existingCustomer),
    activeOpportunity: labelFor(input.activeOpportunity),
    ownedByAnotherRep: labelFor(input.ownedByAnotherRep),
    doNotContactStatus: labelFor(input.doNotContactStatus),
    internalNotes: input.internalNotes,
  };

  return Object.entries(values).map(([field, value]) => {
    const hasKnownValue = Boolean(value?.trim()) && value !== "Unknown";
    const status = hasKnownValue ? factStatus(input, field, "USER_PROVIDED") : "UNKNOWN";
    const trustLevel = trustLevelFor(status, field);
    return {
      field,
      label: fieldLabels[field] ?? field,
      value: hasKnownValue ? (value?.trim() ?? "") : "Unknown",
      status,
      source: sourceFor(status),
      trustLevel,
      required: requiredResearchFields.has(field),
      passedToAi: aiRelevantFields.has(field) && hasKnownValue,
      stored: true,
      allowedAsFactualOutreachPersonalization: status === "VERIFIED" && hasKnownValue,
      allowedOnlyAsQuestionOrHypothesis: status !== "VERIFIED" && hasKnownValue,
    };
  });
}

export function getIndustryEvidence(industry?: string): IndustryEvidence {
  const normalized = normalize(industry);
  if (!normalized) {
    return {
      industry: "Unknown",
      level: "UNKNOWN",
      note: "Industry was not provided.",
    };
  }
  const playbookMatch = industries.find((entry) => normalize(entry.name) === normalized);
  if (playbookMatch) {
    return {
      industry: playbookMatch.name,
      level: playbookMatch.evidenceLevel,
      note: `${playbookMatch.evidenceLevel.replaceAll("_", " ").toLowerCase()} evidence; use as one signal, not as proof by itself.`,
    };
  }
  if (provenIndustries.has(normalized)) {
    return { industry: industry ?? "", level: "PROVEN", note: "Approved proven industry." };
  }
  if (strongHypothesisIndustries.has(normalized)) {
    return {
      industry: industry ?? "",
      level: "STRONG_HYPOTHESIS",
      note: "Approved strong-hypothesis industry; do not present as proven.",
    };
  }
  if (exploratoryIndustries.has(normalized)) {
    return {
      industry: industry ?? "",
      level: "EXPLORATORY",
      note: "Approved exploratory industry; do not reject solely on industry.",
    };
  }
  return {
    industry: industry ?? "",
    level: "UNKNOWN",
    note: "No approved industry evidence label matched this input.",
  };
}

export function evaluateSuppression(
  input: AccountResearchInput,
  records: DoNotContactRecord[],
): SuppressionResult {
  const matches = [
    ...searchDoNotContactRecords(records, input.companyName),
    ...(input.companyDomain ? searchDoNotContactRecords(records, input.companyDomain) : []),
  ];
  const unique = Array.from(new Map(matches.map((match) => [match.record.id, match])).values());
  const inputReasons = [
    input.existingCustomer === "YES"
      ? "Existing customer was confirmed in the assessment."
      : undefined,
    input.activeOpportunity === "YES"
      ? "Active opportunity was confirmed in the assessment."
      : undefined,
    input.ownedByAnotherRep === "YES"
      ? "Owned by another rep was confirmed in the assessment."
      : undefined,
    input.doNotContactStatus === "YES"
      ? "Do Not Contact status was confirmed in the assessment."
      : undefined,
  ].filter((reason): reason is string => Boolean(reason));
  const blockedMatches = unique.filter((match) => match.blocked);
  const blocked = blockedMatches.length > 0 || inputReasons.length > 0;

  if (blocked) {
    return {
      status: "BLOCKED",
      label: "Blocked",
      reasons: [
        ...inputReasons,
        ...blockedMatches.map((match) => `${match.record.companyName}: ${match.record.status}`),
      ],
      matches: unique.map((match) => ({
        companyName: match.record.companyName,
        domain: match.record.domain,
        status: match.record.status,
        owner: match.record.owner,
        reason: match.record.reason,
      })),
      outreachBlocked: true,
      verificationWarning:
        "Outreach workflows are blocked until the suppression reason is resolved.",
    };
  }

  if (unique.length > 0) {
    return {
      status: "ALLOWED_WITH_REVIEW",
      label: "Allowed with review",
      reasons: unique.map((match) => `${match.record.companyName}: ${match.label}`),
      matches: unique.map((match) => ({
        companyName: match.record.companyName,
        domain: match.record.domain,
        status: match.record.status,
        owner: match.record.owner,
        reason: match.record.reason,
      })),
      outreachBlocked: false,
      verificationWarning:
        "A suppression record exists but is not blocking; review before outreach.",
    };
  }

  return {
    status: "NO_MATCH",
    label: "No suppression match found",
    reasons: [],
    matches: [],
    outreachBlocked: false,
    verificationWarning:
      "No suppression match was found. This is not proof that outreach is allowed; verify before sending.",
  };
}

function positiveSignals(input: AccountResearchInput) {
  const signals: string[] = [];
  if (input.meaningfulBrandedSearchDemand === "YES")
    signals.push("Meaningful branded-search demand");
  if (input.brandedSearchAdsActive === "YES") signals.push("Active branded-search ads");
  if (input.strongOrganicBrandVisibility === "YES") signals.push("Strong organic brand visibility");
  if (input.dedicatedPaidSearchOrPerformanceTeam === "YES" || input.knownPaidSearchOwner) {
    signals.push("Dedicated Paid Search or Performance ownership");
  }
  if (input.multiMarketOrBrandComplexity === "YES") {
    signals.push("Multi-market or multi-brand complexity");
  }
  if (input.meaningfulPaidSearchInvestment === "YES")
    signals.push("Meaningful Paid Search investment");
  if (input.knownPain) signals.push("Credible pain or trigger");
  if (
    /\$?50m|200\+|revenue|employees/i.test(
      `${input.revenueContext ?? ""} ${input.employeeContext ?? ""}`,
    )
  ) {
    signals.push("Relevant commercial scale context");
  }
  return signals;
}

function verifiedPositiveSignals(input: AccountResearchInput, positives: string[]) {
  const fieldBySignal = new Map([
    ["Meaningful branded-search demand", "meaningfulBrandedSearchDemand"],
    ["Active branded-search ads", "brandedSearchAdsActive"],
    ["Strong organic brand visibility", "strongOrganicBrandVisibility"],
    ["Dedicated Paid Search or Performance ownership", "dedicatedPaidSearchOrPerformanceTeam"],
    ["Multi-market or multi-brand complexity", "multiMarketOrBrandComplexity"],
    ["Meaningful Paid Search investment", "meaningfulPaidSearchInvestment"],
    ["Credible pain or trigger", "knownPain"],
    ["Relevant commercial scale context", "revenueContext"],
  ]);
  return positives.filter((signal) => {
    const field = fieldBySignal.get(signal);
    return field ? factStatus(input, field, "USER_PROVIDED") === "VERIFIED" : false;
  });
}

export function qualifyAccount(input: AccountResearchInput, suppression: SuppressionResult) {
  const positives = positiveSignals(input);
  const missing = [
    input.meaningfulBrandedSearchDemand === "UNKNOWN"
      ? "Meaningful branded-search demand"
      : undefined,
    input.brandedSearchAdsActive === "UNKNOWN" ? "Branded-search advertising activity" : undefined,
    input.strongOrganicBrandVisibility === "UNKNOWN" ? "Organic brand visibility" : undefined,
    input.dedicatedPaidSearchOrPerformanceTeam === "UNKNOWN" && !input.knownPaidSearchOwner
      ? "Paid Search or Performance ownership"
      : undefined,
    input.meaningfulPaidSearchInvestment === "UNKNOWN" ? "Paid Search investment" : undefined,
    input.doNotContactStatus === "UNKNOWN" ? "Suppression status" : undefined,
  ].filter((item): item is string => Boolean(item));
  const risks = [
    input.meaningfulBrandedSearchDemand === "NO" &&
    input.brandedSearchAdsActive === "NO" &&
    input.strongOrganicBrandVisibility === "NO"
      ? "No meaningful branded-search activity was provided."
      : undefined,
    input.dedicatedPaidSearchOrPerformanceTeam === "NO" && !input.knownPaidSearchOwner
      ? "No credible Paid Search or Performance ownership was provided."
      : undefined,
    /very small|local only|single location/i.test(
      `${input.revenueContext ?? ""} ${input.employeeContext ?? ""} ${input.internalNotes ?? ""}`,
    )
      ? "Very small or purely local operation was indicated."
      : undefined,
    ...suppression.reasons,
  ].filter((item): item is string => Boolean(item));

  let result: QualificationResult = "Insufficient information";
  if (suppression.outreachBlocked || risks.length > suppression.reasons.length) {
    result = "Do not target";
  } else if (positives.length >= 5 && missing.length <= 2) {
    result = "Strong fit";
  } else if (positives.length >= 2) {
    result = "Possible fit";
  }
  if (positives.length <= 1 && missing.length >= 4 && !suppression.outreachBlocked) {
    result = "Insufficient information";
  }

  const confidence: ConfidenceLevel =
    result === "Strong fit" || result === "Do not target"
      ? "High"
      : missing.length <= 2
        ? "Medium"
        : "Low";

  return {
    result,
    confidence,
    positives,
    missing,
    risks,
    nextStep:
      result === "Do not target"
        ? "Do not create outreach. Resolve suppression or disqualification before taking action."
        : "Verify the missing search and ownership signals, then choose the safest workflow.",
  };
}

export function recommendPersona(input: AccountResearchInput): PersonaRecommendation {
  const role = input.knownPaidSearchOwner ?? "";
  if (/paid search|search marketing|sem/i.test(role)) {
    return {
      primaryPersona: role || "Director of Paid Search",
      secondaryPersona: "VP Performance Marketing",
      reason: "Direct Paid Search ownership is closest to branded-search strategy and execution.",
      bestAngle: "Methodology and control over branded-search decisions.",
      suitableCta: "Worth comparing how you decide where paid brand spend is incremental?",
      likelyObjection: "We already manage this internally.",
      seniorityGuidance:
        "A direct operational owner may be better than an executive sponsor for the first conversation.",
    };
  }
  if (/growth|acquisition|performance/i.test(role)) {
    return {
      primaryPersona: role,
      secondaryPersona: "Director of Paid Search",
      reason:
        "Performance, Growth, and Acquisition leaders often own spend efficiency and outcomes.",
      bestAngle: "Acquisition efficiency and paid-organic measurement.",
      suitableCta: "Open to a short comparison of how brand-search efficiency is measured?",
      likelyObjection: "This is not a priority.",
      seniorityGuidance:
        "Do not choose the most senior title if a clearer Paid Search owner exists.",
    };
  }
  if (role.trim()) {
    return {
      primaryPersona: role,
      secondaryPersona: "Director of Paid Search",
      reason:
        "The supplied role is preserved as user-provided context, but Paid Search ownership should still be confirmed.",
      bestAngle: "Routing to the right Paid Search or Performance owner.",
      suitableCta: "Would it be useful to route this to whoever owns paid-search efficiency?",
      likelyObjection: "This is handled by another team.",
      seniorityGuidance:
        "Seniority alone is not enough; confirm whether this person owns paid-search decisions before prioritizing.",
    };
  }
  const fallback = personas[0];
  return {
    primaryPersona: fallback.name,
    secondaryPersona: fallback.secondaryStakeholder,
    reason: fallback.relevance,
    bestAngle: fallback.bestAngle,
    suitableCta: fallback.suitableCta,
    likelyObjection: fallback.commonObjection,
    seniorityGuidance:
      "Seniority alone is not enough; prioritize the person closest to Paid Search or Performance decisions.",
  };
}

export function recommendStakeholders(input: AccountResearchInput): StakeholderRecommendation[] {
  const providedRole = input.knownPaidSearchOwner?.trim();
  const recommendations: StakeholderRecommendation[] = [];

  if (providedRole) {
    const isDirect = /paid search|search marketing|sem|ppc|performance|growth|acquisition/i.test(
      providedRole,
    );
    recommendations.push({
      role: providedRole,
      priority: isDirect ? "Primary stakeholder" : "Possible influencer",
      reason: isDirect
        ? "The supplied role appears close to paid-search or performance decisions."
        : "The supplied role can help route the topic, but ownership should be confirmed.",
    });
  }

  recommendations.push(
    {
      role: "Head of Paid Search",
      priority: providedRole ? "Secondary stakeholder" : "Primary stakeholder",
      reason: "Closest owner for branded-search bidding, monitoring, and efficiency decisions.",
    },
    {
      role: "Director of Performance Marketing",
      priority: "Secondary stakeholder",
      reason: "Often owns budget efficiency, channel performance, and paid-organic tradeoffs.",
    },
    {
      role: "SEM or PPC Lead",
      priority: "Secondary stakeholder",
      reason: "Likely to understand the practical gap between live SERP conditions and bid rules.",
    },
    {
      role: "Growth or Acquisition leader",
      priority: "Possible influencer",
      reason:
        "Relevant when the account cares about CAC, qualified demand, or pipeline efficiency.",
    },
    {
      role: "CMO",
      priority:
        input.multiMarketOrBrandComplexity === "YES" ||
        /enterprise|global|multi/i.test(
          `${input.marketsOrCountries ?? ""} ${input.employeeContext ?? ""}`,
        )
          ? "Possible influencer"
          : "Likely wrong contact",
      reason:
        "Useful for strategic routing only; the safer first conversation is usually with the search or performance owner.",
    },
  );

  return recommendations.filter(
    (recommendation, index, list) =>
      list.findIndex((item) => item.role.toLowerCase() === recommendation.role.toLowerCase()) ===
      index,
  );
}

function claimsToAvoid(input: AccountResearchInput) {
  const claims = new Set<string>();
  if (input.brandedSearchAdsActive !== "YES") {
    claims.add("Do not claim the company currently runs branded-search ads.");
  }
  claims.add("Do not claim competitors are bidding without evidence.");
  claims.add("Do not claim CPC is rising without evidence.");
  claims.add("Do not claim wasted spend as a verified fact.");
  claims.add("Do not claim a specific Google bidding strategy.");
  claims.add("Do not claim current agency dissatisfaction.");
  claims.add("Do not claim paid search is centrally managed.");
  claims.add("Do not promise a specific saving percentage for this company.");
  if (!input.knownCurrentToolOrVendor) {
    claims.add("Do not claim the account uses Adthena, Revvim, Auction Insights, or another tool.");
  }
  return Array.from(claims);
}

function openQuestionsFor(input: AccountResearchInput) {
  const questions: string[] = [];
  if (
    input.brandedSearchAdsActive === "UNKNOWN" ||
    input.meaningfulBrandedSearchDemand === "UNKNOWN"
  ) {
    questions.push("Do they run branded-search coverage on meaningful brand terms?");
  }
  if (input.multiMarketOrBrandComplexity === "YES" || input.marketsOrCountries) {
    questions.push("Is branded search managed centrally or market by market?");
  }
  if (input.dedicatedPaidSearchOrPerformanceTeam === "UNKNOWN" && !input.knownPaidSearchOwner) {
    questions.push("Who owns paid search or performance decisions?");
  }
  if (
    input.strongOrganicBrandVisibility === "YES" ||
    input.strongOrganicBrandVisibility === "UNKNOWN"
  ) {
    questions.push("How do they measure paid-brand incrementality against organic results?");
  }
  questions.push("Do they adjust brand bids based on live SERP conditions?");
  return Array.from(new Set(questions)).slice(0, 5);
}

function likelyOpportunitiesFor(input: AccountResearchInput) {
  const opportunities: string[] = [];
  if (input.multiMarketOrBrandComplexity === "YES") {
    opportunities.push(
      "If branded-search activity varies by market, Signal may help compare when coverage is protecting demand versus adding cost.",
    );
  }
  if (input.strongOrganicBrandVisibility === "YES") {
    opportunities.push(
      "If organic visibility already captures some branded demand, there may be a paid-organic measurement opportunity.",
    );
  }
  if (input.meaningfulPaidSearchInvestment === "YES") {
    opportunities.push(
      "If brand spend is meaningful, even small pockets of non-incremental spend may be worth reviewing.",
    );
  }
  if (input.knownCurrentToolOrVendor) {
    opportunities.push(
      "If a current tool is in place, the safest angle is methodology: what live SERP and paid-organic signals it can act on.",
    );
  }
  return opportunities.length
    ? opportunities
    : [
        "If the company runs broad branded coverage, there may be an opportunity to test whether spend is incremental during calm SERP periods.",
      ];
}

export function recommendAngle(input: AccountResearchInput): AngleRecommendation {
  const commonClaimsToAvoid = claimsToAvoid(input);
  if (input.knownCurrentToolOrVendor) {
    return {
      primaryAngle: "methodology comparison",
      secondaryAngle: "paid and organic measurement",
      whyItFits: "A current tool or vendor was explicitly provided.",
      supportingSignal: `Known current tool or vendor: ${input.knownCurrentToolOrVendor}`,
      mustNotClaim:
        "Do not make unsupported claims about the named competitor or imply replacement pressure.",
      safeOpeningQuestion:
        "How are you deciding when branded coverage is still incremental versus mostly overlap?",
      bestProofCategory: "Approved vendor-objection or methodology proof only.",
      claimsToAvoid: commonClaimsToAvoid,
      recommendedWorkflow: "Ask Signal Brain",
    };
  }
  if (input.multiMarketOrBrandComplexity === "YES") {
    return {
      primaryAngle: "control across markets",
      secondaryAngle: "governance and visibility",
      whyItFits: "The account has multi-market or multi-brand complexity.",
      supportingSignal: "Multi-market or multi-brand complexity",
      mustNotClaim:
        "Do not claim universal savings or market-specific performance without evidence.",
      safeOpeningQuestion: "How do you decide when brand coverage should change market by market?",
      bestProofCategory:
        "Approved travel, retail, fashion, or multi-market proof when industry fit matches.",
      claimsToAvoid: commonClaimsToAvoid,
      recommendedWorkflow: "Build Sequence",
    };
  }
  if (input.strongOrganicBrandVisibility === "YES") {
    return {
      primaryAngle: "paid and organic measurement",
      secondaryAngle: "branded-search efficiency",
      whyItFits: "Strong organic brand visibility was provided.",
      supportingSignal: "Strong organic brand visibility",
      mustNotClaim: "Do not claim paid spend can be removed without affecting outcomes.",
      safeOpeningQuestion:
        "How do you decide when organic would have captured the branded click anyway?",
      bestProofCategory:
        "Approved paid-organic or retail/e-commerce proof when industry fit matches.",
      claimsToAvoid: commonClaimsToAvoid,
      recommendedWorkflow: "Create Outreach",
    };
  }
  if (input.meaningfulPaidSearchInvestment === "YES" || input.knownPain) {
    return {
      primaryAngle: "branded-search efficiency",
      secondaryAngle: "incrementality and evidence quality",
      whyItFits: "The input points to efficiency, investment, or measurement pain.",
      supportingSignal: input.knownPain ?? "Meaningful Paid Search investment",
      mustNotClaim: "Do not invent spend estimates or guaranteed savings.",
      safeOpeningQuestion:
        "Where do you currently draw the line between protection and unnecessary paid-brand spend?",
      bestProofCategory: "Approved savings proof only when the industry and metric are relevant.",
      claimsToAvoid: commonClaimsToAvoid,
      recommendedWorkflow: "Create Outreach",
    };
  }
  return {
    primaryAngle: "branded-search efficiency",
    whyItFits: "This is the safest default until stronger context is verified.",
    supportingSignal: "No stronger verified angle was provided.",
    mustNotClaim: "Do not present assumptions as verified account facts.",
    safeOpeningQuestion:
      "How do you currently decide when branded ads should stay live versus come down?",
    bestProofCategory: "No proof by default; qualify first.",
    claimsToAvoid: commonClaimsToAvoid,
    recommendedWorkflow: "Ask Signal Brain",
  };
}

function compactList(values: Array<string | undefined>) {
  return values.filter((value): value is string => Boolean(value?.trim()));
}

export function buildFilteredResearchHandoff(
  input: AccountResearchInput,
  result: {
    qualification: {
      result: QualificationResult;
      confidence: ConfidenceLevel;
      positives: string[];
    };
    industryEvidence: IndustryEvidence;
    personaRecommendation: PersonaRecommendation;
    angleRecommendation: AngleRecommendation;
    facts: FactClassification[];
  },
): FilteredResearchHandoff {
  const verified = result.facts
    .filter((fact) => fact.status === "VERIFIED" && fact.value !== "Unknown")
    .map((fact) => `${fact.label}: ${fact.value}`);
  const hypotheses = [
    ...result.facts
      .filter((fact) => fact.status === "ASSUMPTION" && fact.value !== "Unknown")
      .map((fact) => `${fact.label}: ${fact.value}`),
    ...likelyOpportunitiesFor(input),
  ].slice(0, 4);
  const notes = compactList([
    verified.length ? `Verified facts: ${verified.slice(0, 4).join("; ")}` : undefined,
    hypotheses.length ? `Use as questions, not facts: ${hypotheses.join("; ")}` : undefined,
    `Claims to avoid: ${result.angleRecommendation.claimsToAvoid.slice(0, 4).join("; ")}`,
  ]).join("\n");

  return {
    companyName: input.companyName,
    companyDomain: input.companyDomain,
    contactRole: result.personaRecommendation.primaryPersona,
    industry: input.industry,
    companyContext: `${result.qualification.result} - ${result.qualification.confidence} confidence`,
    geographyOrMarkets: input.marketsOrCountries ?? input.headquartersOrMainMarket,
    paidSearchContext: verified.slice(0, 3).join("; ") || undefined,
    observedTrigger: result.angleRecommendation.safeOpeningQuestion,
    internalNotes: notes,
  };
}

export function buildStructuredResearch(input: AccountResearchInput): ResearchResultStructure {
  const facts = classifyFacts(input);
  const suppression = evaluateSuppression(input, []);
  const qualification = qualifyAccount(input, suppression);
  return buildStructuredResearchFromParts(input, {
    facts,
    suppression,
    qualification,
    industryEvidence: getIndustryEvidence(input.industry),
    personaRecommendation: recommendPersona(input),
    stakeholderRecommendations: recommendStakeholders(input),
    angleRecommendation: recommendAngle(input),
  });
}

function buildStructuredResearchFromParts(
  input: AccountResearchInput,
  parts: {
    facts: FactClassification[];
    suppression: SuppressionResult;
    qualification: ReturnType<typeof qualifyAccount>;
    industryEvidence: IndustryEvidence;
    personaRecommendation: PersonaRecommendation;
    stakeholderRecommendations: StakeholderRecommendation[];
    angleRecommendation: AngleRecommendation;
  },
): ResearchResultStructure {
  const {
    facts,
    suppression,
    qualification,
    industryEvidence,
    stakeholderRecommendations,
    angleRecommendation,
  } = parts;
  const verifiedFacts = facts
    .filter((fact) => fact.status === "VERIFIED" && fact.value !== "Unknown")
    .map((fact) => `${fact.label}: ${fact.value}`);
  const userProvidedContext = facts
    .filter((fact) => fact.status === "USER_PROVIDED" && fact.value !== "Unknown")
    .map((fact) => `${fact.label}: ${fact.value}`);
  const inferredContext = facts
    .filter((fact) => fact.status === "ASSUMPTION" && fact.value !== "Unknown")
    .map((fact) => `${fact.label}: ${fact.value}`);

  return {
    accountSummary: compactList([
      input.companyName,
      input.companyDomain,
      input.industry,
      input.marketsOrCountries ?? input.headquartersOrMainMarket,
    ]),
    signalRelevance: {
      result: qualification.result,
      confidence: qualification.confidence,
      reasons: qualification.positives.slice(0, 5),
    },
    verifiedFacts,
    userProvidedContext,
    inferredContext,
    likelyOpportunities: likelyOpportunitiesFor(input),
    openQuestions: openQuestionsFor(input),
    suggestedStakeholders: stakeholderRecommendations,
    recommendedOutreachAngle: angleRecommendation,
    claimsToAvoid: angleRecommendation.claimsToAvoid,
    evidenceContext: compactList([industryEvidence.note, suppression.verificationWarning]),
  };
}

export function assessmentWorkflowLinks(blocked: boolean) {
  return [
    {
      label: "Create Outreach",
      href: "/create-outreach",
      disabled: blocked,
      reason: blocked ? "Blocked by suppression or disqualification." : undefined,
    },
    {
      label: "Build Sequence",
      href: "/build-sequence",
      disabled: blocked,
      reason: blocked ? "Blocked by suppression or disqualification." : undefined,
    },
    { label: "Reply to Prospect", href: "/reply-to-prospect" },
    { label: "Ask Signal Brain", href: "/ask-signal-brain" },
    { label: "Do Not Contact", href: "/do-not-contact" },
    { label: "Signal Playbook", href: "/playbook" },
  ];
}

export function buildAccountAssessment(
  input: AccountResearchInput,
  suppressionRecords: DoNotContactRecord[],
) {
  const facts = classifyFacts(input);
  const suppression = evaluateSuppression(input, suppressionRecords);
  const qualification = qualifyAccount(input, suppression);
  const angleRecommendation = recommendAngle(input);
  const personaRecommendation = recommendPersona(input);
  const stakeholderRecommendations = recommendStakeholders(input);
  const verifiedSignals = facts
    .filter((fact) => fact.status === "VERIFIED" && fact.value !== "Unknown")
    .map((fact) => `${fact.label}: ${fact.value}`);
  const assumptions = facts
    .filter((fact) => fact.status === "ASSUMPTION" && fact.value !== "Unknown")
    .map((fact) => `${fact.label}: ${fact.value}`);
  const unknowns = facts.filter((fact) => fact.status === "UNKNOWN").map((fact) => fact.label);

  return {
    qualification,
    facts,
    suppression,
    verifiedSignals: [
      ...verifiedSignals,
      ...verifiedPositiveSignals(input, qualification.positives),
    ],
    assumptions,
    unknowns,
    industryEvidence: getIndustryEvidence(input.industry),
    personaRecommendation,
    stakeholderRecommendations,
    angleRecommendation,
    openQuestions: openQuestionsFor(input),
    likelyOpportunities: likelyOpportunitiesFor(input),
    claimsToAvoid: angleRecommendation.claimsToAvoid,
    structuredResearch: buildStructuredResearchFromParts(input, {
      facts,
      suppression,
      qualification,
      industryEvidence: getIndustryEvidence(input.industry),
      personaRecommendation,
      stakeholderRecommendations,
      angleRecommendation,
    }),
    downstreamHandoff: buildFilteredResearchHandoff(input, {
      qualification,
      industryEvidence: getIndustryEvidence(input.industry),
      personaRecommendation,
      angleRecommendation,
      facts,
    }),
    researchChecklist,
    workflowLinks: assessmentWorkflowLinks(
      suppression.outreachBlocked || qualification.result === "Do not target",
    ),
  };
}
