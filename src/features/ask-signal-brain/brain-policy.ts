import { coreIcpSignals, personas } from "@/features/playbook/playbook-content";

import type {
  AccountFitAssessment,
  ClaimSafetyResult,
  PersonaRecommendation,
  SignalBrainInput,
  SignalBrainIntent,
} from "./types";

const tierOneDirectPaidSearch = [
  "Head of Paid Search",
  "Director of Paid Search",
  "Global Paid Search Lead",
  "Search Marketing Director",
  "Paid Search Manager",
];

const tierOnePerformance = [
  "Director of Performance Marketing",
  "VP Performance Marketing",
  "Head of Growth",
  "Head of Acquisition",
];

const tierTwo = [
  "Director of Acquisition",
  "VP Growth",
  "Director of Digital Marketing",
  "Head of Digital",
  "Digital Acquisition Director",
  "E-commerce Director",
  "VP E-commerce",
];

const tierThree = ["CMO", "Chief Growth Officer", "VP Marketing", "SVP Marketing"];

function compact(values: Array<string | undefined>) {
  return values.filter((value): value is string => Boolean(value?.trim()));
}

export function classifySignalBrainQuestion(input: SignalBrainInput): SignalBrainIntent[] {
  const text = compact([
    input.question,
    input.contactRole,
    input.industry,
    input.paidSearchContext,
    input.currentVendor,
    input.observedTrigger,
    input.internalNotes,
  ])
    .join(" ")
    .toLowerCase();
  const intents = new Set<SignalBrainIntent>();

  if (/\b(solo|competitive|ghost|product|difference|what is signal|methodology)\b/.test(text)) {
    intents.add("PRODUCT_FUNDAMENTALS");
  }
  if (/\b(fit|icp|target|good account|do not target|qualification|qualify)\b/.test(text)) {
    intents.add("ICP_OR_FIT");
    intents.add("ACCOUNT_QUALIFICATION");
  }
  if (/\b(persona|who should|role|paid search|performance|growth|cmo|e-commerce)\b/.test(text)) {
    intents.add("PERSONA_TARGETING");
  }
  if (/\b(angle|outreach|message|sequence|send|deck|follow up)\b/.test(text)) {
    intents.add("OUTREACH_ANGLE");
    intents.add("MESSAGING_GUIDANCE");
  }
  if (/\b(objection|not interested|happy with|agency|internal|not a priority|deck)\b/.test(text)) {
    intents.add("OBJECTION_HANDLING");
  }
  if (/\b(adthena|revvim|auction insights|competitor|vendor|tool|platform)\b/.test(text)) {
    intents.add("COMPETITOR_CONTEXT");
    intents.add("OBJECTION_HANDLING");
  }
  if (/\b(case study|proof|customer story|metric|social proof)\b/.test(text)) {
    intents.add("CASE_STUDY_SELECTION");
  }
  if (/\b(us|united states|america|american)\b/.test(text)) {
    intents.add("US_MARKET_GUIDANCE");
  }
  if (
    /\b(claim|safe|avoid|always|guarantee|guaranteed|50%|pricing|poc|trial|discount)\b/.test(text)
  ) {
    intents.add("CLAIM_SAFETY");
  }
  if (
    /\b(reply to prospect|create outreach|build sequence|workflow|do not contact|playbook)\b/.test(
      text,
    )
  ) {
    intents.add("WORKFLOW_GUIDANCE");
  }

  return intents.size > 0 ? Array.from(intents) : ["UNCLEAR_QUESTION"];
}

export function assessAccountFit(input: SignalBrainInput): AccountFitAssessment {
  const verifiedSignals: string[] = [];
  const assumptions: string[] = [];
  const missingInformation: string[] = [];
  const combined = compact([
    input.companySizeOrRevenue,
    input.geographyOrMarkets,
    input.paidSearchContext,
    input.contactRole,
    input.observedTrigger,
    input.internalNotes,
  ]).join(" ");
  const normalized = combined.toLowerCase();

  if (/brand ad|brand ads|branded ad|active.*brand|branded-search advertising/.test(normalized)) {
    verifiedSignals.push("Active branded-search advertising was user-provided.");
  }
  if (/organic|seo|strong visibility|strong organic/.test(normalized)) {
    verifiedSignals.push("Strong organic visibility was user-provided.");
  }
  if (/paid search|performance|acquisition|growth/.test(normalized)) {
    verifiedSignals.push(
      "Dedicated Paid Search, Performance, Acquisition, or Growth ownership was user-provided.",
    );
  }
  if (
    /multi-market|multiple markets|multi country|multi-country|global|international|regions/.test(
      normalized,
    )
  ) {
    verifiedSignals.push("Multi-market or regional complexity was user-provided.");
  }
  if (/\$?20m|\$?50m|revenue|employees|spend|investment|budget/.test(normalized)) {
    verifiedSignals.push(
      "Company scale, revenue, employee, or paid-search investment context was user-provided.",
    );
  }
  if (/efficiency|measurement|governance|control|incrementality|cpc/.test(normalized)) {
    verifiedSignals.push(
      "A credible efficiency, measurement, governance, or control pain was user-provided.",
    );
  }
  if (/suppressed|do not contact|dnc/.test(normalized)) {
    verifiedSignals.push(
      "Suppression status was mentioned; treat the account as blocked until checked.",
    );
  }

  if (!input.companyWebsite) {
    missingInformation.push("Company website");
  }
  if (!/brand/.test(normalized)) {
    missingInformation.push("Evidence of meaningful branded-search demand");
  }
  if (!/paid search|performance|acquisition|growth/.test(normalized)) {
    missingInformation.push("Named Paid Search, Performance, Acquisition, or Growth owner");
  }
  if (!/suppressed|do not contact|dnc/.test(normalized)) {
    missingInformation.push("Suppression status");
  }

  if (input.industry) {
    assumptions.push(`Industry context is user-provided: ${input.industry}.`);
  }
  if (input.currentVendor) {
    assumptions.push(`Current vendor/tool is user-provided: ${input.currentVendor}.`);
  }

  let result: AccountFitAssessment["result"] = "Insufficient information";
  if (/suppressed|do not contact|dnc/.test(normalized)) {
    result = "Do not target";
  } else if (verifiedSignals.length >= 4) {
    result = "Strong fit";
  } else if (verifiedSignals.length >= 2) {
    result = "Possible fit";
  }

  return {
    result,
    verifiedSignals,
    assumptions,
    missingInformation,
    recommendedNextResearchStep:
      result === "Insufficient information"
        ? "Verify branded-search activity, a relevant owner, and suppression status before outreach."
        : "Check Do Not Contact status and validate the strongest user-provided fit signal before messaging.",
  };
}

function roleMatches(role: string | undefined, candidates: string[]) {
  const normalized = role?.toLowerCase() ?? "";
  return candidates.find((candidate) => normalized.includes(candidate.toLowerCase()));
}

export function recommendPersona(input: SignalBrainInput): PersonaRecommendation {
  const role = input.contactRole;
  const directPaid = roleMatches(role, tierOneDirectPaidSearch);
  const performance = roleMatches(role, tierOnePerformance);
  const secondary = roleMatches(role, tierTwo);
  const executive = roleMatches(role, tierThree);
  const playbookPersona =
    personas.find((persona) => role && role.toLowerCase().includes(persona.name.toLowerCase())) ??
    personas[0];

  if (directPaid || /paid search/i.test(role ?? "")) {
    return {
      primaryPersona: directPaid ?? "Head or Director of Paid Search",
      secondaryPersona: "VP Performance Marketing",
      reason:
        "Direct Paid Search ownership is closest to branded-search strategy and methodology decisions.",
      bestAngle: "Methodology and control over when branded paid search is useful.",
      suitableCta: "Worth comparing how you decide where paid brand spend is incremental?",
      likelyObjection: "We already manage this internally.",
      whenNotToPrioritize:
        "Do not prioritize if the role is execution-only with no budget or methodology influence.",
    };
  }

  if (performance || /growth|acquisition/i.test(role ?? "")) {
    return {
      primaryPersona: performance ?? "Head of Growth",
      secondaryPersona: "Director of Paid Search",
      reason:
        "Performance, Growth, and Acquisition leaders usually own budget tradeoffs and business outcomes.",
      bestAngle: "Branded-search efficiency as part of acquisition performance.",
      suitableCta: "Open to a short comparison of how brand-search efficiency is measured?",
      likelyObjection: "This is not a priority.",
      whenNotToPrioritize:
        "Do not prioritize if Paid Search ownership is clearly elsewhere and this person is removed from acquisition decisions.",
    };
  }

  if (secondary || /digital|e.?commerce/i.test(role ?? "")) {
    return {
      primaryPersona: secondary ?? "E-commerce Director",
      secondaryPersona: "Paid Search Lead",
      reason:
        "Digital and E-commerce leaders can be strong secondary targets when acquisition or search sits in their remit.",
      bestAngle: "Cross-market control and efficiency without overclaiming performance lift.",
      suitableCta: "Is brand-search efficiency something your team is reviewing this quarter?",
      likelyObjection: "We are happy with the current setup.",
      whenNotToPrioritize:
        "Do not prioritize if they focus only on site merchandising without acquisition ownership.",
    };
  }

  if (executive || /cmo|chief|svp|vp marketing/i.test(role ?? "")) {
    return {
      primaryPersona: executive ?? "VP Marketing",
      secondaryPersona: "VP Performance Marketing",
      reason:
        "Executive sponsors can help route the topic, but seniority alone does not make them the best first target.",
      bestAngle: "Governance and visibility across brand demand and paid-search decisions.",
      suitableCta:
        "Would it be useful to route this to the person who owns Paid Search efficiency?",
      likelyObjection: "Send me a deck.",
      whenNotToPrioritize:
        "Do not prioritize when an operational Paid Search or Performance owner is visible.",
    };
  }

  return {
    primaryPersona: playbookPersona.name,
    secondaryPersona: playbookPersona.secondaryStakeholder,
    reason: playbookPersona.relevance,
    bestAngle: playbookPersona.bestAngle,
    suitableCta: playbookPersona.suitableCta,
    likelyObjection: playbookPersona.commonObjection,
    whenNotToPrioritize: playbookPersona.doNotPrioritizeWhen,
  };
}

export function evaluateClaimSafety(input: SignalBrainInput): ClaimSafetyResult {
  const text = compact([input.question, input.internalNotes]).join(" ");
  const problematicWording: string[] = [];
  if (/\balways\b|\bguarantee(?:d|s)?\b|\bwithout affecting\b/i.test(text)) {
    problematicWording.push("guarantee or certainty language");
  }
  if (/\b\d+%|by half|50 percent|50%/i.test(text)) {
    problematicWording.push("specific unverified performance metric");
  }
  if (
    /\b(adthena|revvim|auction insights).*(bad|worse|limited|inferior|fails|can't|cannot)\b/i.test(
      text,
    )
  ) {
    problematicWording.push("unsupported competitor limitation");
  }
  if (/\bpricing|price|poc|proof of concept|trial|discount|commercial offer\b/i.test(text)) {
    problematicWording.push("pricing, POC, trial, discount, or commercial-offer language");
  }

  if (problematicWording.length === 0) {
    return {
      status: "Safe",
      problematicWording: [],
      reason:
        "No blocked guarantee, commercial-term, competitor, or unsupported metric language was detected.",
      saferAlternative:
        "Keep the claim source-backed and frame Signal as a way to evaluate branded-search decisions.",
    };
  }

  return {
    status: /pricing|poc|trial|discount|commercial/i.test(problematicWording.join(" "))
      ? "Restricted"
      : "Unsupported",
    problematicWording,
    reason:
      "The wording presents unsupported certainty, commercial terms, competitor claims, or unverified metrics.",
    saferAlternative:
      "Signal helps teams evaluate when branded paid search is useful by looking at paid and organic outcomes together.",
  };
}

export function approvedIcpSummary() {
  return coreIcpSignals.join(" ");
}
