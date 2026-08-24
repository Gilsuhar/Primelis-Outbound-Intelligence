import { z } from "zod";

import { selectGoldStandardExamples } from "@/features/build-sequence/gold-standard-examples";
import { planMessageStrategy } from "@/features/build-sequence/strategy-planner";
import type {
  BuildSequenceInput,
  GoldStandardExample,
  MessageStrategy,
  ProspectIntelligence,
  SequenceKnowledgeRecord,
} from "@/features/build-sequence/types";
import { mapAiProviderError, shouldUseOpenAiProvider } from "./ai-provider";

const approvedCapabilities = [
  {
    id: "LIVE_SERP_COMPETITION",
    text: "Signal monitors live Google and Bing SERP competition so branded-search decisions can respond to what is actually on the page.",
  },
  {
    id: "SOLO_PERIOD_DETECTION",
    text: "Signal detects solo branded-search periods so teams can reduce pressure only when coverage is still protected.",
  },
  {
    id: "AUCTION_CONDITION_BIDDING",
    text: "Signal separates solo and contested branded auctions so bids and coverage can change by auction condition.",
  },
  {
    id: "PAID_ORGANIC_MEASUREMENT",
    text: "Signal connects SERP visibility with Google Ads, Search Console, and conversion data so teams can evaluate paid coverage decisions.",
  },
  {
    id: "MARKET_VISIBILITY",
    text: "Signal gives teams market-level branded-search visibility across Google and Bing before they change coverage or bids.",
  },
] as const;

const approvedProductGaps = [
  {
    id: "GOOGLE_ADS_LIVE_COMPETITION_GAP",
    text: "Google Ads reports performance, but it does not clearly show when branded bids should change because live SERP competition changed.",
  },
  {
    id: "STATIC_BID_RULE_GAP",
    text: "A single branded-bid rule can treat different auction conditions alike even when the SERP changes.",
  },
  {
    id: "MINIMUM_DEFENSIVE_CPC_GAP",
    text: "Google Ads can show performance, but it does not clearly answer the minimum CPC needed when another advertiser appears.",
  },
  {
    id: "QUIET_AUCTION_PRESSURE_GAP",
    text: "Google Ads can show branded campaign performance, but it does not clearly separate quiet auctions from defensive ones.",
  },
  {
    id: "UNKNOWN_SERP_VISIBILITY_GAP",
    text: "Without verified SERP evidence, the safest gap is visibility: how the team sees changing branded-search competition before changing bids.",
  },
] as const;

function normalizeStrategyStep(value: unknown, index: number) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const evidenceItems = Array.isArray(record.keyPoints)
    ? record.keyPoints
    : Array.isArray(record.groundedInputs)
      ? record.groundedInputs
      : undefined;
  const keyPoints = Array.isArray(evidenceItems)
    ? evidenceItems.filter((item): item is string => typeof item === "string").join(" ")
    : undefined;
  const objective = record.objective ?? record.goal ?? record.purpose;
  const newInformation = record.newInformation ?? keyPoints ?? record.angle ?? objective;
  return {
    ...record,
    stepNumber: record.stepNumber ?? record.step ?? index + 1,
    objective,
    newInformation,
    angle: record.angle ?? objective ?? newInformation,
    evidenceToUse: record.evidenceToUse ?? keyPoints ?? newInformation,
    proofToUseId: record.proofToUseId ?? record.proofPointId ?? record.proofToUse,
    CTAIntent: record.CTAIntent ?? record.callToAction ?? record.ctaIntent,
    avoidRepeating:
      record.avoidRepeating ??
      "Do not repeat the previous email's prospect insight, product gap, proof point, or CTA.",
  };
}

const strategyStepSchema = z.preprocess((value) => normalizeStrategyStep(value, 0), z.object({
  stepNumber: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  objective: z.string().trim().min(8).max(220),
  newInformation: z.string().trim().min(8).max(220),
  angle: z.string().trim().min(4).max(220),
  evidenceToUse: z.string().trim().min(4).max(220),
  proofToUseId: z.string().trim().max(120).optional(),
  CTAIntent: z.string().trim().min(4).max(260),
  avoidRepeating: z.string().trim().min(4).max(220),
}));

const optionalText = (max: number) =>
  z.preprocess((value) => (value === null ? undefined : value), z.string().trim().max(max).optional());

const optionalId = optionalText(120);

const confidenceSchema = z.preprocess((value) => {
  if (typeof value !== "number") return value;
  if (value >= 0.78) return "HIGH";
  if (value >= 0.45) return "MEDIUM";
  return "LOW";
}, z.enum(["HIGH", "MEDIUM", "LOW"]));

const sequenceNarrativeSchema = z.preprocess((value) => {
  if (!Array.isArray(value)) return value;
  if (value.every((item) => typeof item === "string")) {
    return value.map((item, index) => ({
      stepNumber: index + 1,
      objective: item,
      newInformation: item,
      angle: item,
      evidenceToUse: "Use only grounded inputs from the matching email step plan.",
      CTAIntent: "Use the matching email step plan CTA intent.",
      avoidRepeating: "Avoid repeating earlier email information.",
    }));
  }
  return value.map((item, index) => normalizeStrategyStep(item, index));
}, z.array(strategyStepSchema).length(4));

const emailStepPlansSchema = z.preprocess((value) => {
  if (!Array.isArray(value)) return value;
  return value.map((item, index) => normalizeStrategyStep(item, index));
}, z.array(strategyStepSchema).length(4));

const openingStyleSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const allowed = [
    "PROSPECT_FACT",
    "ACCOUNT_OBSERVATION",
    "BUSINESS_QUESTION",
    "SERP_EVIDENCE",
    "MARKET_INSIGHT",
  ] as const;
  return allowed.find((item) => value.split("|").map((part) => part.trim()).includes(item)) ?? value;
}, z.enum([
  "PROSPECT_FACT",
  "ACCOUNT_OBSERVATION",
  "BUSINESS_QUESTION",
  "SERP_EVIDENCE",
  "MARKET_INSIGHT",
]));

const aiStrategySchema = z.object({
  prospectInsight: z.string().trim().min(4).max(260),
  whyNow: z.string().trim().min(8).max(420),
  primaryAngle: z.string().trim().min(8).max(420),
  secondaryAngle: optionalText(260),
  businessQuestion: z.string().trim().min(8).max(220),
  productGapId: z.string().trim().min(1).max(120),
  relevantCapabilityId: z.string().trim().min(1).max(120),
  proofPointId: optionalId,
  openingStyle: openingStyleSchema,
  sequenceNarrative: sequenceNarrativeSchema,
  emailStepPlans: emailStepPlansSchema,
  whyThisShouldResonate: z.string().trim().min(8).max(520),
  confidence: confidenceSchema,
  groundingReferences: z.preprocess(
    (value) => (typeof value === "string" ? [value] : value),
    z.array(z.string().trim().min(1).max(260)).min(1).max(12),
  ),
  selectedGoldStandardExampleIds: z.preprocess(
    (value) => (value === null ? [] : value),
    z.array(z.string().trim().min(1).max(120)).max(3).default([]),
  ),
});

type AiStrategy = z.infer<typeof aiStrategySchema>;

export type AiMessageStrategyProviderRequest = {
  input: BuildSequenceInput;
  intelligence: ProspectIntelligence;
  approvedCapabilities: typeof approvedCapabilities;
  approvedProductGaps: typeof approvedProductGaps;
  proofRecords: Array<{ id: string; text: string }>;
  goldStandardExamples: Array<Pick<GoldStandardExample, "id" | "reasoningTags" | "whyItWorked" | "outcome">>;
  validationFeedback?: string[];
};

export type AiMessageStrategyProvider = (
  request: AiMessageStrategyProviderRequest,
) => Promise<unknown>;

function normalize(value?: string) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[$€£]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isGrounded(allowedText: string, value?: string) {
  const comparableValue = value
    ?.trim()
    .replace(/^(?:prospect fact|company fact|approved product gap|approved capability|proof record|gold standard example):\s*/i, "");
  const normalizedAllowed = normalize(allowedText);
  const normalizedValue = normalize(comparableValue);
  if (!normalizedValue) return false;
  if (
    /^(prospectFacts|companyFacts|likelyPriorities|approvedCapabilities|approvedProductGaps|proofRecords|goldStandardExamples)(?:\b|:)/i.test(
      value?.trim() ?? "",
    )
  ) {
    return true;
  }
  if (normalizedAllowed.includes(normalizedValue)) return true;
  const tokens = normalizedValue.split(" ").filter((token) => token.length > 2);
  if (tokens.length < 3) return false;
  const matched = tokens.filter((token) => normalizedAllowed.includes(token)).length;
  return matched / tokens.length >= 0.78;
}

function proofRecords(records: SequenceKnowledgeRecord[]) {
  return records
    .filter((record) => record.type === "CASE_STUDY")
    .map((record) => ({ id: record.id, text: record.approvedText }));
}

function sourceText({
  input,
  intelligence,
  records,
}: {
  input: BuildSequenceInput;
  intelligence: ProspectIntelligence;
  records: SequenceKnowledgeRecord[];
}) {
  return [
    input.rawProspectContext,
    input.prospectContext,
    input.companyContext,
    input.paidSearchContext,
    input.serpEvidence,
    input.internalNotes,
    input.companyName,
    input.contactFirstName,
    input.contactRole,
    input.industry,
    input.geographyOrMarkets,
    intelligence.prospectName,
    intelligence.companyName,
    intelligence.jobTitle,
    ...intelligence.selectedInsights.flatMap((insight) => [
      insight.text,
      insight.groundingReference,
      insight.reasonSelected,
    ]),
    ...intelligence.relevantFacts,
    ...intelligence.companyContext,
    ...intelligence.serpEvidence.observations,
    ...intelligence.serpEvidence.keywords,
    ...intelligence.serpEvidence.competitors,
    ...approvedCapabilities.flatMap((item) => [item.id, item.text]),
    ...approvedProductGaps.flatMap((item) => [item.id, item.text]),
    ...records.map((record) => record.id),
    ...records.map((record) => record.approvedText),
  ]
    .filter(Boolean)
    .join("\n");
}

function textHasUnsupportedSerpClaim(text: string, scenario: ProspectIntelligence["serpScenario"]) {
  if (scenario !== "UNKNOWN") return false;
  const cleaned = text
    .replace(/approvedProductGaps?:[^"{}[\]]+/gi, " ")
    .replace(/UNKNOWN_SERP_VISIBILITY_GAP/gi, " ");
  return (
    /\b(?:supplied|verified|observed|keyword data|screenshot|evidence)\b[^.?!]{0,120}\b(?:solo|contested|competitor appeared|competitor visible|brand is alone|auction is quiet|quiet auction)\b/i.test(cleaned) ||
    /\b(?:your|their|this|the|current|brand|branded)\b[^.?!]{0,80}\b(?:auction|SERP|keyword|query)\b[^.?!]{0,80}\b(?:is|was|were|appears|looks|shows)\b[^.?!]{0,40}\b(?:solo|contested|quiet|alone)\b/i.test(cleaned)
  );
}

function containsUnsupportedOrganicClaim(text: string) {
  return /\borganic is already enough\b|\borganic would have captured\b|\bwould have captured organically\b/i.test(text);
}

function numbers(text: string) {
  return Array.from(text.matchAll(/(?:[$€£]\s*)?\d+(?:[.,]\d+)?\s*(?:%|m|k|b|million|billion)?\+?/gi)).map((match) =>
    normalize(match[0]),
  ).filter((number) => !/^[1-4]$/.test(number));
}

function validateNumbers(allowedText: string, text: string) {
  const allowed = normalize(allowedText);
  return numbers(text).every((number) => allowed.includes(number.replace(/\s+/g, " ")) || allowed.includes(number.replace(/\+/g, "")));
}

function hasDistinctNarrative(steps: AiStrategy["emailStepPlans"]) {
  const values = steps.map((step) => normalize(`${step.objective} ${step.newInformation} ${step.angle}`));
  return new Set(values).size === steps.length;
}

function validateAiStrategy({
  strategy,
  input,
  intelligence,
  records,
}: {
  strategy: AiStrategy;
  input: BuildSequenceInput;
  intelligence: ProspectIntelligence;
  records: SequenceKnowledgeRecord[];
}) {
  const issues: string[] = [];
  const allowedText = sourceText({ input, intelligence, records });
  const capability = approvedCapabilities.find((item) => item.id === strategy.relevantCapabilityId);
  const productGap = approvedProductGaps.find((item) => item.id === strategy.productGapId);
  const proofs = proofRecords(records);
  const proof = strategy.proofPointId
    ? proofs.find((item) => item.id === strategy.proofPointId)
    : undefined;
  const approvedReferenceText = [
    ...approvedCapabilities.flatMap((item) => [item.id, item.text]),
    ...approvedProductGaps.flatMap((item) => [item.id, item.text]),
    ...proofs.flatMap((item) => [item.id, item.text]),
  ].join("\n");

  if (!capability) issues.push("Capability id is not approved.");
  if (!productGap) issues.push("Product gap id is not approved.");
  if (strategy.proofPointId && !proof) issues.push("Proof point id is not approved.");
  if (strategy.secondaryAngle && normalize(strategy.secondaryAngle) === normalize(strategy.primaryAngle)) {
    issues.push("Secondary angle duplicates primary angle.");
  }
  if (containsUnsupportedOrganicClaim(JSON.stringify(strategy))) {
    issues.push("Strategy contains unsupported organic-capture wording.");
  }
  if (textHasUnsupportedSerpClaim(JSON.stringify(strategy), intelligence.serpScenario)) {
    issues.push("Strategy makes a SERP claim despite UNKNOWN evidence.");
  }
  if (!validateNumbers(allowedText, JSON.stringify(strategy))) {
    issues.push("Strategy contains numbers not present in allowed prospect context or approved knowledge.");
  }
  if (!hasDistinctNarrative(strategy.emailStepPlans)) {
    issues.push("Email step plans do not add distinct information.");
  }

  for (const reference of strategy.groundingReferences) {
    if (!isGrounded(`${allowedText}\n${approvedReferenceText}`, reference)) {
      issues.push(`Grounding reference is unsupported: ${reference}`);
    }
  }

  if (strategy.openingStyle === "PROSPECT_FACT" && intelligence.selectedInsights.length === 0) {
    issues.push("Opening style uses prospect fact without selected commercial prospect insights.");
  }
  if (strategy.confidence === "HIGH" && intelligence.relevantFacts.length === 0 && intelligence.confidence.serp !== "HIGH") {
    issues.push("High confidence is unsupported by weak prospect and SERP context.");
  }

  return {
    ok: issues.length === 0,
    issues,
    capability,
    productGap,
    proof,
  };
}

function toMessageStrategy({
  ai,
  productGap,
  capability,
  proof,
  goldStandards,
}: {
  ai: AiStrategy;
  productGap: { text: string };
  capability: { text: string };
  proof?: { text: string };
  goldStandards: GoldStandardExample[];
}): MessageStrategy {
  return {
    prospectInsight: ai.prospectInsight,
    whyNow: ai.whyNow,
    businessQuestion: ai.businessQuestion,
    productGap: productGap.text,
    primaryAngle: ai.primaryAngle,
    secondaryAngle: ai.secondaryAngle,
    relevantCapability: capability.text,
    proofPoint: proof?.text,
    whyThisShouldResonate: ai.whyThisShouldResonate,
    openingStyle: ai.openingStyle,
    sequenceNarrative: ai.sequenceNarrative.map((step) => ({
      step: step.stepNumber,
      objective: step.objective,
      newInformation: step.newInformation,
      angle: step.angle,
      evidenceToUse: step.evidenceToUse,
      proofToUse: step.proofToUseId,
      ctaIntent: step.CTAIntent,
      avoidRepeating: step.avoidRepeating,
    })),
    emailStepPlans: ai.emailStepPlans.map((step) => ({
      stepNumber: step.stepNumber,
      objective: step.objective,
      newInformation: step.newInformation,
      angle: step.angle,
      evidenceToUse: step.evidenceToUse,
      proofToUse: step.proofToUseId,
      CTAIntent: step.CTAIntent,
      avoidRepeating: step.avoidRepeating,
    })),
    confidence: ai.confidence,
    selectedGoldStandardExampleIds: ai.selectedGoldStandardExampleIds.filter((id) =>
      goldStandards.some((example) => example.id === id),
    ),
    groundingReferences: ai.groundingReferences,
    plannerMode: "AI_STRATEGY",
  };
}

function parseJsonObject(content: string) {
  const trimmed = content.trim();
  if (trimmed.startsWith("```")) {
    return JSON.parse(trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim());
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("MALFORMED_RESPONSE");
  }
}

function nowMs() {
  return Date.now();
}

async function callOpenAiStrategyPlanner(
  request: AiMessageStrategyProviderRequest,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (!shouldUseOpenAiProvider(env) || !env.OPENAI_API_KEY) {
    throw new Error("STRATEGY_AI_NOT_CONFIGURED");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55_000);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || "gpt-5-mini",
        instructions:
          "Plan the outbound message strategy only. Use only grounded prospect/account inputs and approved capability/product gap/proof ids. Do not write email copy. Do not invent product behavior, customers, competitors, initiatives, budgets, markets, or SERP evidence. Gold standards are reasoning examples only; do not copy their wording or structure. Return JSON only.",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify({
                  instruction:
                    "Choose the strongest prospect-specific WHY. Return valid JSON matching the contract. Use ids for productGapId, relevantCapabilityId, proofPointId, and selectedGoldStandardExampleIds.",
                  prospectContext: {
                    raw: request.input.rawProspectContext,
                    companyName: request.input.companyName,
                    contactFirstName: request.input.contactFirstName,
                    contactRole: request.input.contactRole,
                    selectedCommercialInsights: request.intelligence.selectedInsights,
                    supportingProspectFacts: request.intelligence.relevantFacts,
                    companyFacts: request.intelligence.companyContext,
                    persona: request.intelligence.persona,
                    seniority: request.intelligence.seniority,
                    jobTitle: request.intelligence.jobTitle,
                    serpScenario: request.intelligence.serpScenario,
                    serpEvidence: request.intelligence.serpEvidence,
                    likelyPriorities: request.intelligence.likelyPriorities,
                  },
                  approvedCapabilities: request.approvedCapabilities,
                  approvedProductGaps: request.approvedProductGaps,
                  proofRecords: request.proofRecords,
                  goldStandardExamples: request.goldStandardExamples,
                  validationFeedback: request.validationFeedback,
                  outputContract: {
                    prospectInsight: "grounded string",
                    whyNow: "grounded reason to contact now",
                    primaryAngle: "prospect-specific angle",
                    secondaryAngle: "optional distinct angle",
                    businessQuestion: "buyer-facing question",
                    productGapId: "approvedProductGaps id",
                    relevantCapabilityId: "approvedCapabilities id",
                    proofPointId: "optional proofRecords id",
                    openingStyle: "PROSPECT_FACT | ACCOUNT_OBSERVATION | BUSINESS_QUESTION | SERP_EVIDENCE | MARKET_INSIGHT",
                    sequenceNarrative:
                      "4 items: { stepNumber, objective, newInformation, angle, evidenceToUse, proofToUseId?, CTAIntent, avoidRepeating }",
                    emailStepPlans:
                      "same 4-step structure with distinct newInformation across steps",
                    whyThisShouldResonate: "why this exact strategy fits the supplied facts",
                    confidence: "HIGH | MEDIUM | LOW",
                    groundingReferences: "strings copied or closely grounded in provided context/approved facts",
                    selectedGoldStandardExampleIds: "ids only; reasoning influence, no copying",
                  },
                  strictRules: [
                    "Use selectedCommercialInsights as the primary basis for why this prospect is relevant. Do not use a weaker supportingProspectFact when a stronger selectedCommercialInsight exists.",
                    "Do not use raw LinkedIn headlines, bare titles, bare company names, section labels, or decorative personal history as prospectInsight.",
                    "Avoid default openings like 'I saw that', 'I noticed that', 'I came across', or 'I saw your profile'. Connect the selected responsibility to the business question instead.",
                    "emailStepPlans must be an array of 4 objects with exactly: stepNumber, objective, newInformation, angle, evidenceToUse, CTAIntent, avoidRepeating, optional proofToUseId.",
                    "sequenceNarrative must use the same 4-object shape, not plain strings.",
                    "openingStyle must be one enum value, not a list.",
                    "Do not include meeting lengths, day counts, percentages, spend amounts, or numeric claims unless the exact number appears in prospect context or approved proof.",
                    "If serpScenario is UNKNOWN, do not say solo period, solo auction, contested auction, quiet auction, competitor appeared, or brand is alone.",
                  ],
                }),
              },
            ],
          },
        ],
        text: { format: { type: "json_object" } },
        reasoning: { effort: "minimal" },
        max_output_tokens: 3600,
      }),
    });
    if (!response.ok) throw new Error(`PROVIDER_HTTP_${response.status}`);
    const payload = (await response.json()) as {
      output_text?: string;
      output?: Array<{ content?: Array<{ text?: string }> }>;
    };
    const content =
      payload.output_text ??
      payload.output
        ?.flatMap((item) => item.content ?? [])
        .map((part) => part.text)
        .filter((text): text is string => Boolean(text))
        .join("\n");
    if (!content) throw new Error("MALFORMED_RESPONSE");
    return parseJsonObject(content);
  } finally {
    clearTimeout(timeout);
  }
}

function deterministicFallback({
  input,
  intelligence,
  records,
  diagnostics,
}: {
  input: BuildSequenceInput;
  intelligence: ProspectIntelligence;
  records: SequenceKnowledgeRecord[];
  diagnostics?: MessageStrategy["diagnostics"];
}) {
  return {
    ...planMessageStrategy({ input, intelligence, records }),
    plannerMode: "DETERMINISTIC_FALLBACK" as const,
    diagnostics: diagnostics
      ? {
          ...diagnostics,
          fallbackUsed: true,
        }
      : undefined,
  };
}

export async function planAiMessageStrategy({
  input,
  intelligence,
  records,
  provider,
  env,
}: {
  input: BuildSequenceInput;
  intelligence: ProspectIntelligence;
  records: SequenceKnowledgeRecord[];
  provider?: AiMessageStrategyProvider;
  env?: NodeJS.ProcessEnv;
}): Promise<MessageStrategy> {
  const goldStandards = selectGoldStandardExamples({ intelligence, primaryAngle: intelligence.primaryAngle });
  const proofOptions = proofRecords(records);
  const baseRequest: AiMessageStrategyProviderRequest = {
    input,
    intelligence,
    approvedCapabilities,
    approvedProductGaps,
    proofRecords: proofOptions,
    goldStandardExamples: goldStandards.map((example) => ({
      id: example.id,
      reasoningTags: example.reasoningTags,
      whyItWorked: example.whyItWorked,
      outcome: example.outcome,
    })),
  };

  const callProvider = async (validationFeedback?: string[]) => {
    const started = nowMs();
    const raw = provider
      ? await provider({ ...baseRequest, validationFeedback })
      : await callOpenAiStrategyPlanner({ ...baseRequest, validationFeedback }, env);
    const durationMs = nowMs() - started;
    const parsed = aiStrategySchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ai: undefined,
        durationMs,
        validation: {
          ok: false,
          issues: parsed.error.issues.map((issue) => `Strategy response schema mismatch at ${issue.path.join(".") || "root"}: ${issue.message}`),
          capability: undefined,
          productGap: undefined,
          proof: undefined,
        },
      };
    }
    const ai = parsed.data;
    const validation = validateAiStrategy({ strategy: ai, input, intelligence, records });
    if (!validation.ok || !validation.capability || !validation.productGap) {
      return { ai, validation, durationMs };
    }
    return { ai, validation, durationMs };
  };

  try {
    const first = await callProvider();
    const diagnostics: NonNullable<MessageStrategy["diagnostics"]> = {
      firstCallDurationMs: first.durationMs,
      retryUsed: false,
      fallbackUsed: false,
      firstIssues: first.validation.issues,
      retryIssues: [],
    };
    if (first.ai && first.validation.ok && first.validation.capability && first.validation.productGap) {
      const strategy = toMessageStrategy({
        ai: first.ai,
        capability: first.validation.capability,
        productGap: first.validation.productGap,
        proof: first.validation.proof,
        goldStandards,
      });
      return { ...strategy, diagnostics };
    }
    const second = await callProvider(first.validation.issues);
    diagnostics.retryUsed = true;
    diagnostics.retryDurationMs = second.durationMs;
    diagnostics.retryIssues = second.validation.issues;
    if (second.ai && second.validation.ok && second.validation.capability && second.validation.productGap) {
      const strategy = toMessageStrategy({
        ai: second.ai,
        capability: second.validation.capability,
        productGap: second.validation.productGap,
        proof: second.validation.proof,
        goldStandards,
      });
      return { ...strategy, diagnostics };
    }
    return deterministicFallback({ input, intelligence, records, diagnostics });
  } catch (error) {
    void mapAiProviderError(error);
    return deterministicFallback({
      input,
      intelligence,
      records,
      diagnostics: {
        retryUsed: false,
        fallbackUsed: true,
        firstIssues: [error instanceof Error ? error.message : String(error)],
        retryIssues: [],
      },
    });
  }
}

export const messageStrategyPlannerInternals = {
  approvedCapabilities,
  approvedProductGaps,
  parseAiStrategy: (raw: unknown) => aiStrategySchema.safeParse(raw),
  validateAiStrategy,
};
