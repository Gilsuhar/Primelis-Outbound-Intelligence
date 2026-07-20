import type {
  BuildSequenceInput,
  SequenceAccountSignal,
  SequenceAngle,
  SequenceChannel,
  SequencePersonaGuidance,
  SequencePurpose,
  SequenceStepChannel,
} from "./types";

const angleLabels: Record<SequenceAngle, string> = {
  BRANDED_SEARCH_EFFICIENCY: "branded-search efficiency",
  SOLO_COMPETITIVE_GHOST: "Solo, Competitive, and Ghost search scenarios",
  PAID_ORGANIC_MEASUREMENT: "paid and organic measurement",
  METHODOLOGY_COMPARISON: "methodology comparison",
  MARKET_CONTROL_VISIBILITY: "market control and visibility",
};

export const purposeLabels: Record<SequencePurpose, string> = {
  FIRST_TOUCH_RELEVANCE: "First touch / relevance",
  PROBLEM_FRAMING: "Problem framing",
  METHODOLOGY_DIFFERENTIATION: "Methodology differentiation",
  ACCOUNT_SPECIFIC_OBSERVATION: "Account-specific observation",
  SOCIAL_PROOF: "Social proof",
  TECHNICAL_CLARIFICATION: "Technical clarification",
  LOW_PRESSURE_FOLLOW_UP: "Low-pressure follow-up",
  BREAKUP_CLOSE_LOOP: "Breakup / close-the-loop",
};

export function labelForSequenceAngle(angle: SequenceAngle) {
  return angleLabels[angle];
}

export function getSequencePersonaGuidance(role: string): SequencePersonaGuidance {
  const normalized = role.toLowerCase();

  if (/paid search manager|paid search|sem/.test(normalized)) {
    return {
      persona: "Paid Search leadership",
      emphasis: "operational control",
      rationale:
        "Paid Search leaders usually care about efficiency, methodology, control, and scale.",
    };
  }
  if (/performance|growth/.test(normalized)) {
    return {
      persona: "Performance or Growth leader",
      emphasis: "business outcomes",
      rationale:
        "Performance and Growth leaders usually care about spend efficiency and growth impact.",
    };
  }
  if (/cmo|chief marketing/.test(normalized)) {
    return {
      persona: "CMO",
      emphasis: "governance",
      rationale: "CMOs usually care about governance, visibility, and global consistency.",
    };
  }
  if (/analytics|measurement|data|insight/.test(normalized)) {
    return {
      persona: "Analytics or Measurement stakeholder",
      emphasis: "measurement",
      rationale:
        "Measurement stakeholders usually care about incrementality, paid and organic measurement, and evidence quality.",
    };
  }
  if (/acquisition/.test(normalized)) {
    return {
      persona: "Acquisition leader",
      emphasis: "efficiency",
      rationale:
        "Acquisition leaders usually care about conversion impact and cross-market control.",
    };
  }
  return {
    persona: "Marketing stakeholder",
    emphasis: "business outcomes",
    rationale:
      "The role is broad, so the sequence should stay business-relevant without over-personalizing.",
  };
}

export function detectSequenceAccountSignals(input: BuildSequenceInput): SequenceAccountSignal[] {
  const signals: SequenceAccountSignal[] = [
    {
      label: "Observed trigger",
      detail: input.observedTrigger,
      confidence: "USER_PROVIDED",
    },
  ];

  if (input.companyWebsite) {
    signals.push({
      label: "Company website",
      detail: input.companyWebsite,
      confidence: "VERIFIED",
    });
  }
  if (input.paidSearchContext) {
    signals.push({
      label: "Paid-search context",
      detail: input.paidSearchContext,
      confidence: "USER_PROVIDED",
    });
  }
  if (input.currentVendor) {
    signals.push({
      label: "Current vendor/tool",
      detail: input.currentVendor,
      confidence: "USER_PROVIDED",
    });
  }
  if (input.industry) {
    signals.push({ label: "Industry", detail: input.industry, confidence: "USER_PROVIDED" });
  }
  if (input.companyContext) {
    signals.push({
      label: "Size or revenue context",
      detail: input.companyContext,
      confidence: "USER_PROVIDED",
    });
  }
  if (input.geographyOrMarkets) {
    signals.push({
      label: "Geography or markets",
      detail: input.geographyOrMarkets,
      confidence: "USER_PROVIDED",
    });
  }

  const persona = getSequencePersonaGuidance(input.contactRole);
  signals.push({
    label: "Persona priority",
    detail: persona.emphasis,
    confidence: "INFERRED",
  });

  return signals;
}

export function selectSequenceAngle(input: BuildSequenceInput): {
  angle: SequenceAngle;
  rationale: string;
} {
  const combined = [
    input.contactRole,
    input.industry,
    input.companyContext,
    input.geographyOrMarkets,
    input.paidSearchContext,
    input.currentVendor,
    input.observedTrigger,
    input.internalNotes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/vendor|tool|methodology|adthena|revvim|platform/.test(combined)) {
    return {
      angle: "METHODOLOGY_COMPARISON",
      rationale:
        "The account context mentions a current tool or methodology, so the sequence should compare approach without unsupported competitor claims.",
    };
  }
  if (/market|markets|region|international|geo|country|global/.test(combined)) {
    return {
      angle: "MARKET_CONTROL_VISIBILITY",
      rationale:
        "The account context mentions geography or markets, so the sequence should emphasize control and visibility across markets.",
    };
  }
  if (/organic|measurement|incremental|analytics|data/.test(combined)) {
    return {
      angle: "PAID_ORGANIC_MEASUREMENT",
      rationale:
        "The account context points to measurement, so the sequence should connect paid and organic outcomes.",
    };
  }
  if (/solo|competitive|ghost|auction|competitor/.test(combined)) {
    return {
      angle: "SOLO_COMPETITIVE_GHOST",
      rationale:
        "The account context mentions competitive search conditions, so the safest approved angle is search-scenario methodology.",
    };
  }
  return {
    angle: "BRANDED_SEARCH_EFFICIENCY",
    rationale:
      "The input gives a broad outreach trigger, so the safest angle is branded-search efficiency without invented account facts.",
  };
}

export function channelsForSequence(primaryChannel: SequenceChannel): SequenceStepChannel[] {
  if (primaryChannel === "EMAIL") {
    return ["EMAIL"];
  }
  if (primaryChannel === "LINKEDIN") {
    return ["LINKEDIN"];
  }
  return ["EMAIL", "LINKEDIN"];
}

export function channelForStep(primaryChannel: SequenceChannel, stepIndex: number) {
  if (primaryChannel === "EMAIL") {
    return "EMAIL" satisfies SequenceStepChannel;
  }
  if (primaryChannel === "LINKEDIN") {
    return "LINKEDIN" satisfies SequenceStepChannel;
  }
  return stepIndex % 2 === 0 ? "EMAIL" : "LINKEDIN";
}

export function defaultPurposesForLength(
  length: number,
  hasEligibleSocialProof: boolean,
): SequencePurpose[] {
  const base: SequencePurpose[] = [
    "FIRST_TOUCH_RELEVANCE",
    "PROBLEM_FRAMING",
    "METHODOLOGY_DIFFERENTIATION",
    "ACCOUNT_SPECIFIC_OBSERVATION",
    "TECHNICAL_CLARIFICATION",
    "LOW_PRESSURE_FOLLOW_UP",
  ];
  const withFinal = base.slice(0, Math.max(length - 1, 0));
  if (hasEligibleSocialProof && length >= 4) {
    withFinal[1] = "SOCIAL_PROOF";
  }
  const finalPurposes: SequencePurpose[] = [...withFinal, "BREAKUP_CLOSE_LOOP"];
  return finalPurposes.slice(0, length);
}
