import { z } from "zod";

import {
  extractProspect,
  normalizeDomain,
  normalizeLinkedInUrl,
} from "@/features/build-sequence/prospect-memory";
import type { ProspectExtraction } from "@/features/build-sequence/types";
import { mapAiProviderError, shouldUseOpenAiProvider } from "./ai-provider";

const confidenceSchema = z.preprocess((value) => {
  if (typeof value === "number") {
    if (value >= 0.8) return "HIGH";
    if (value >= 0.5) return "MEDIUM";
    return "LOW";
  }
  return value === null ? undefined : value;
}, z.enum(["LOW", "MEDIUM", "HIGH"]).optional().default("MEDIUM"));
const optionalText = (max: number) =>
  z.preprocess(
    (value) => value === null ? undefined : value,
    z.string().trim().max(max).optional(),
  );
const factSchema = z.object({
  text: z.string().trim().min(1).max(260),
  category: optionalText(80),
  sourceEvidence: z.string().trim().min(1).max(320),
  confidence: confidenceSchema,
});

const semanticExtractionSchema = z.object({
  identity: z.object({
    firstName: optionalText(80),
    lastName: optionalText(120),
    fullName: optionalText(180),
    email: optionalText(180),
    linkedinUrl: optionalText(240),
  }).default({}),
  company: z.object({
    companyName: optionalText(180),
    companyDomain: optionalText(180),
    website: optionalText(240),
    industry: optionalText(160),
    market: optionalText(160),
  }).default({}),
  role: z.object({
    jobTitle: optionalText(180),
    seniority: optionalText(80),
    persona: optionalText(80),
  }).default({}),
  prospectFacts: z.array(factSchema).max(12).default([]),
  companyFacts: z.array(factSchema).max(10).default([]),
  serpEvidence: z.array(z.object({
    keyword: z.string().trim().min(1).max(140),
    observation: z.string().trim().min(1).max(260),
    competitor: optionalText(120),
    scenarioHint: z.enum(["SOLO", "CONTESTED", "MIXED", "UNKNOWN"]).optional().default("UNKNOWN"),
    sourceEvidence: z.string().trim().min(1).max(320),
  })).max(12).default([]),
  notes: z.array(factSchema).max(10).default([]),
});

type SemanticExtraction = z.infer<typeof semanticExtractionSchema>;

export type SemanticIntakeMode = "AI_SEMANTIC" | "DETERMINISTIC_FALLBACK";

export type SemanticIntakeResult = {
  extraction: ProspectExtraction;
  mode: SemanticIntakeMode;
  rejectedFacts: string[];
  fallbackReason?: string;
};

export type SemanticExtractionProvider = (rawText: string) => Promise<unknown>;

function compact(value?: string) {
  return value?.replace(/\s+/g, " ").trim();
}

function stripSourceLabel(value: string) {
  return value
    .replace(/^\s*(?:about|linkedin|notes?|prospect|company|serp|role|title|context|keywords?|important)\s*:\s*/i, "")
    .trim();
}

function isNoEvidenceStatement(value?: string) {
  return /\b(?:no|without|none|not)\s+(?:verified\s+)?(?:serp|keyword|keywords?|evidence|screenshot)\b/i.test(value ?? "");
}

function normalizeForGrounding(value?: string) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[$€£]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isRoleOrSeniorityFragment(value?: string) {
  const normalized = normalizeForGrounding(value);
  if (!normalized) return false;
  const roleWords = new Set([
    "head",
    "senior",
    "paid",
    "director",
    "manager",
    "vp",
    "vice",
    "president",
    "lead",
    "growth",
    "performance",
    "search",
    "marketing",
    "acquisition",
    "demand",
    "ppc",
    "sem",
  ]);
  const tokens = normalized.split(" ").filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => roleWords.has(token));
}

function isGrounded(rawText: string, value?: string) {
  const normalizedRaw = normalizeForGrounding(rawText);
  const normalizedValue = normalizeForGrounding(value);
  if (!normalizedValue) return false;
  if (normalizedRaw.includes(normalizedValue)) return true;
  const tokens = normalizedValue.split(" ").filter((token) => token.length > 2);
  if (tokens.length < 3) return false;
  const matched = tokens.filter((token) => normalizedRaw.includes(token)).length;
  return matched / tokens.length >= 0.82;
}

function groundedField(rawText: string, value?: string) {
  const cleaned = compact(value);
  return cleaned && isGrounded(rawText, cleaned) ? cleaned : undefined;
}

function groundedFacts(
  rawText: string,
  facts: Array<{ text: string; sourceEvidence: string; confidence?: string }>,
  rejectedFacts: string[],
) {
  return facts
    .filter((fact) => {
      const grounded = isGrounded(rawText, fact.sourceEvidence) && isGrounded(rawText, fact.text);
      if (!grounded) rejectedFacts.push(fact.text);
      return grounded;
    })
    .map((fact) => compact(stripSourceLabel(fact.text)))
    .filter((fact): fact is string => Boolean(fact))
    .slice(0, 8);
}

function groundedSerpEvidence(
  rawText: string,
  serpEvidence: SemanticExtraction["serpEvidence"],
  rejectedFacts: string[],
): ProspectExtraction["serpEvidence"] {
  return serpEvidence
    .filter((item) => {
      const grounded =
        !isNoEvidenceStatement(item.sourceEvidence) &&
        !isNoEvidenceStatement(item.observation) &&
        isGrounded(rawText, item.sourceEvidence) &&
        isGrounded(rawText, item.keyword) &&
        isGrounded(rawText, item.observation);
      if (!grounded) rejectedFacts.push(`${item.keyword} - ${item.observation}`);
      return grounded;
    })
    .map((item) => ({
      keyword: item.keyword,
      status: item.scenarioHint === "MIXED" ? "UNKNOWN" : item.scenarioHint,
      competitors:
        item.competitor && isGrounded(rawText, item.competitor) ? [item.competitor] : undefined,
      observation: item.observation,
    }))
    .slice(0, 8);
}

function mergeSemanticExtraction(
  rawText: string,
  deterministic: ProspectExtraction,
  semantic: SemanticExtraction,
) {
  const rejectedFacts: string[] = [];
  const groundedSemanticFirstName = isRoleOrSeniorityFragment(semantic.identity.firstName)
    ? undefined
    : groundedField(rawText, semantic.identity.firstName);
  const groundedSemanticFullName = groundedField(rawText, semantic.identity.fullName);
  const groundedSemanticCompany = groundedField(rawText, semantic.company.companyName);
  const deterministicLooksLikeCompany =
    deterministic.firstName &&
    groundedSemanticCompany &&
    normalizeForGrounding(deterministic.firstName) === normalizeForGrounding(groundedSemanticCompany);
  const deterministicCompanyLooksLikePerson =
    deterministic.companyName &&
    groundedSemanticFirstName &&
    normalizeForGrounding(deterministic.companyName) === normalizeForGrounding(groundedSemanticFirstName);
  const companyDomain =
    deterministic.companyDomain ??
    normalizeDomain(groundedField(rawText, semantic.company.companyDomain)) ??
    normalizeDomain(groundedField(rawText, semantic.company.website));
  const fullName =
    deterministicLooksLikeCompany
      ? groundedSemanticFullName ?? groundedSemanticFirstName
      : deterministic.fullName ?? groundedSemanticFullName;
  const deterministicFirstName = isRoleOrSeniorityFragment(deterministic.firstName)
    ? undefined
    : deterministic.firstName;
  const firstName =
    deterministicLooksLikeCompany
      ? groundedSemanticFirstName ?? groundedSemanticFullName?.split(/\s+/)[0]
      : deterministicFirstName ??
    groundedSemanticFirstName ??
    fullName?.split(/\s+/)[0];
  const lastName =
    deterministic.lastName ??
    groundedField(rawText, semantic.identity.lastName) ??
    (fullName && fullName.split(/\s+/).length > 1 ? fullName.split(/\s+/).slice(1).join(" ") : undefined);
  const prospectFacts = [
    ...groundedFacts(rawText, semantic.prospectFacts, rejectedFacts),
    ...deterministic.prospectFacts,
  ];
  const companyFacts = [
    ...groundedFacts(rawText, semantic.companyFacts, rejectedFacts),
    ...[semantic.company.industry, semantic.company.market]
      .map((fact) => groundedField(rawText, fact))
      .filter((fact): fact is string => Boolean(fact)),
    ...deterministic.companyFacts,
  ];
  const notes = [
    ...groundedFacts(rawText, semantic.notes, rejectedFacts),
    ...deterministic.notes,
  ];
  const serpEvidence = [
    ...groundedSerpEvidence(rawText, semantic.serpEvidence, rejectedFacts),
    ...deterministic.serpEvidence,
  ];

  return {
    extraction: {
      ...deterministic,
      firstName,
      lastName,
      fullName,
      email: deterministic.email ?? groundedField(rawText, semantic.identity.email)?.toLowerCase(),
      linkedinUrl:
        deterministic.linkedinUrl ??
        normalizeLinkedInUrl(groundedField(rawText, semantic.identity.linkedinUrl)),
      jobTitle: deterministic.jobTitle ?? groundedField(rawText, semantic.role.jobTitle),
      companyName:
        deterministicCompanyLooksLikePerson
          ? groundedSemanticCompany
          : deterministic.companyName ?? groundedSemanticCompany,
      companyDomain,
      prospectFacts: Array.from(new Set(prospectFacts)).slice(0, 8),
      companyFacts: Array.from(new Set(companyFacts)).slice(0, 6),
      linkedinInsights: deterministic.linkedinInsights,
      notes: Array.from(new Set(notes)).slice(0, 6),
      serpEvidence: Array.from(
        new Map(serpEvidence.map((item) => [`${item.keyword}-${item.status}-${item.observation}`, item])).values(),
      ).slice(0, 8),
      confidence: {
        identity: fullName || deterministic.email || deterministic.linkedinUrl ? 0.86 : deterministic.confidence.identity,
        company: deterministic.companyName || semantic.company.companyName ? 0.82 : deterministic.confidence.company,
        extraction: 0.82,
      },
    } satisfies ProspectExtraction,
    rejectedFacts,
  };
}

async function callOpenAiSemanticExtraction(rawText: string, env: NodeJS.ProcessEnv = process.env) {
  if (!shouldUseOpenAiProvider(env) || !env.OPENAI_API_KEY) {
    throw new Error("SEMANTIC_AI_NOT_CONFIGURED");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
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
          "Extract only facts explicitly present in the raw prospect context. Return JSON only. Every fact, note, and SERP observation must include exact sourceEvidence copied from the input. Do not infer achievements, competitors, SERP scenarios, spend, roles, or companies that are not in the input.",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify({
                  instruction:
                    "Return JSON only. The JSON must match the outputContract exactly and must not include markdown.",
                  rawProspectContext: rawText,
                  outputContract: {
                    identity: { firstName: "string?", lastName: "string?", fullName: "string?", email: "string?", linkedinUrl: "string?" },
                    company: { companyName: "string?", companyDomain: "string?", website: "string?", industry: "string?", market: "string?" },
                    role: { jobTitle: "string?", seniority: "string?", persona: "string?" },
                    prospectFacts: "array of { text, category, sourceEvidence, confidence }",
                    companyFacts: "array of { text, category, sourceEvidence, confidence }",
                    serpEvidence: "array of { keyword, observation, competitor?, scenarioHint, sourceEvidence }",
                    notes: "array of { text, sourceEvidence, confidence }",
                  },
                }),
              },
            ],
          },
        ],
        text: { format: { type: "json_object" } },
        reasoning: { effort: "minimal" },
        max_output_tokens: 3000,
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
        .map((contentPart) => contentPart.text)
        .filter((text): text is string => Boolean(text))
        .join("\n");
    if (!content) throw new Error("MALFORMED_RESPONSE");
    return JSON.parse(content) as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

export async function extractProspectSemantic(
  rawText: string,
  options: {
    provider?: SemanticExtractionProvider;
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<SemanticIntakeResult> {
  const deterministic = extractProspect({ rawText });
  try {
    const rawSemantic = options.provider
      ? await options.provider(rawText)
      : await callOpenAiSemanticExtraction(rawText, options.env);
    const semantic = semanticExtractionSchema.parse(rawSemantic);
    const merged = mergeSemanticExtraction(rawText, deterministic, semantic);
    const acceptedCount =
      merged.extraction.prospectFacts.length +
      merged.extraction.companyFacts.length +
      merged.extraction.serpEvidence.length +
      merged.extraction.notes.length;
    if (acceptedCount === 0 && merged.rejectedFacts.length > 0) {
      return {
        extraction: deterministic,
        mode: "DETERMINISTIC_FALLBACK",
        rejectedFacts: merged.rejectedFacts,
        fallbackReason: "Semantic extraction returned no grounded facts.",
      };
    }
    return {
      extraction: merged.extraction,
      mode: "AI_SEMANTIC",
      rejectedFacts: merged.rejectedFacts,
    };
  } catch (error) {
    const status = mapAiProviderError(error);
    return {
      extraction: deterministic,
      mode: "DETERMINISTIC_FALLBACK",
      rejectedFacts: [],
      fallbackReason: status.message,
    };
  }
}
