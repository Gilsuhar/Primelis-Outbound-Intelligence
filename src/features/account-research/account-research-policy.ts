import { searchDoNotContactRecords } from "@/features/do-not-contact/do-not-contact-policy";
import type { DoNotContactRecord } from "@/features/do-not-contact/types";
import { industries, personas } from "@/features/playbook/playbook-content";

import type {
  AccountResearchInput,
  AngleRecommendation,
  ConfidenceLevel,
  FactClassification,
  FactStatus,
  IndustryEvidence,
  PersonaRecommendation,
  QualificationResult,
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

function normalize(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

function factStatus(input: AccountResearchInput, field: string, fallback: FactStatus) {
  return input.factStatuses[field] ?? fallback;
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

  return Object.entries(values).map(([field, value]) => ({
    label: fieldLabels[field] ?? field,
    value: value?.trim() ? value : "Unknown",
    status:
      value?.trim() && value !== "Unknown" ? factStatus(input, field, "USER_PROVIDED") : "UNKNOWN",
  }));
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

export function recommendAngle(input: AccountResearchInput): AngleRecommendation {
  if (input.knownCurrentToolOrVendor) {
    return {
      primaryAngle: "methodology comparison",
      secondaryAngle: "paid and organic measurement",
      whyItFits: "A current tool or vendor was explicitly provided.",
      supportingSignal: `Known current tool or vendor: ${input.knownCurrentToolOrVendor}`,
      mustNotClaim:
        "Do not make unsupported claims about the named competitor or imply replacement pressure.",
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
      recommendedWorkflow: "Create Outreach",
    };
  }
  return {
    primaryAngle: "branded-search efficiency",
    whyItFits: "This is the safest default until stronger context is verified.",
    supportingSignal: "No stronger verified angle was provided.",
    mustNotClaim: "Do not present assumptions as verified account facts.",
    recommendedWorkflow: "Ask Signal Brain",
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
    verifiedSignals: [...verifiedSignals, ...qualification.positives],
    assumptions,
    unknowns,
    industryEvidence: getIndustryEvidence(input.industry),
    personaRecommendation: recommendPersona(input),
    angleRecommendation: recommendAngle(input),
    researchChecklist,
    workflowLinks: assessmentWorkflowLinks(
      suppression.outreachBlocked || qualification.result === "Do not target",
    ),
  };
}
