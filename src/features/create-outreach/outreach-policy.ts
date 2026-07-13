import type { AccountSignal, CreateOutreachInput, OutreachAngle, PersonaGuidance } from "./types";

const angleLabels: Record<OutreachAngle, string> = {
  BRANDED_SEARCH_EFFICIENCY: "reducing inefficient branded-search spend",
  SOLO_COMPETITIVE_GHOST: "optimizing across Solo, Competitive, and Ghost scenarios",
  PAID_ORGANIC_MEASUREMENT: "evaluating paid and organic outcomes together",
  METHODOLOGY_COMPARISON: "comparing current methodology",
  MARKET_CONTROL_VISIBILITY: "improving control and visibility across markets",
};

export function labelForOutreachAngle(angle: OutreachAngle) {
  return angleLabels[angle];
}

export function getPersonaGuidance(role: string): PersonaGuidance {
  const normalized = role.toLowerCase();

  if (/paid search manager|paid search/.test(normalized)) {
    return {
      persona: "Paid Search Manager",
      emphasis: "operational control",
      rationale:
        "Paid Search roles usually care about practical control over spend, CPC, and execution.",
    };
  }
  if (/vp performance|performance marketing/.test(normalized)) {
    return {
      persona: "VP Performance Marketing",
      emphasis: "efficiency",
      rationale: "Performance leaders usually care about efficient growth and budget allocation.",
    };
  }
  if (/head of acquisition|acquisition/.test(normalized)) {
    return {
      persona: "Head of Acquisition",
      emphasis: "scale",
      rationale: "Acquisition leaders usually care about repeatable scale without wasted spend.",
    };
  }
  if (/vp growth|growth/.test(normalized)) {
    return {
      persona: "VP Growth",
      emphasis: "business outcomes",
      rationale:
        "Growth leaders usually care about measurable outcomes across acquisition channels.",
    };
  }
  if (/cmo|chief marketing/.test(normalized)) {
    return {
      persona: "CMO",
      emphasis: "governance",
      rationale: "CMOs usually care about visibility, governance, and business impact.",
    };
  }
  if (/analytics|measurement|data/.test(normalized)) {
    return {
      persona: "Analytics or Measurement stakeholder",
      emphasis: "measurement",
      rationale: "Measurement stakeholders usually care about methodology and evidence quality.",
    };
  }
  return {
    persona: "Marketing stakeholder",
    emphasis: "business outcomes",
    rationale:
      "The role is broad, so the safest emphasis is business relevance without over-personalizing.",
  };
}

export function detectAccountSignals(input: CreateOutreachInput): AccountSignal[] {
  const signals: AccountSignal[] = [
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
    signals.push({
      label: "Industry",
      detail: input.industry,
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

  const persona = getPersonaGuidance(input.contactRole);
  signals.push({
    label: "Persona priority",
    detail: persona.emphasis,
    confidence: "INFERRED",
  });

  return signals;
}

export function selectOutreachAngle(input: CreateOutreachInput): {
  angle: OutreachAngle;
  rationale: string;
} {
  const combined = [
    input.contactRole,
    input.paidSearchContext,
    input.currentVendor,
    input.observedTrigger,
    input.internalNotes,
    input.geographyOrMarkets,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/vendor|tool|methodology|adthena|revvim|platform/.test(combined)) {
    return {
      angle: "METHODOLOGY_COMPARISON",
      rationale:
        "The input mentions a current tool or methodology, so the safest angle is comparing approach without making competitor claims.",
    };
  }
  if (/market|markets|region|international|geo|country/.test(combined)) {
    return {
      angle: "MARKET_CONTROL_VISIBILITY",
      rationale:
        "The input mentions markets or geography, so the message should emphasize control and visibility across markets.",
    };
  }
  if (/organic|measurement|incremental|analytics|data/.test(combined)) {
    return {
      angle: "PAID_ORGANIC_MEASUREMENT",
      rationale:
        "The input points to measurement, so the message should connect paid and organic outcomes.",
    };
  }
  if (/solo|competitive|ghost|auction|competitor/.test(combined)) {
    return {
      angle: "SOLO_COMPETITIVE_GHOST",
      rationale:
        "The input mentions competitive search conditions, so Solo, Competitive, and Ghost scenarios are relevant.",
    };
  }
  return {
    angle: "BRANDED_SEARCH_EFFICIENCY",
    rationale:
      "The input gives a broad outreach trigger, so the safest angle is branded-search efficiency without invented account facts.",
  };
}
