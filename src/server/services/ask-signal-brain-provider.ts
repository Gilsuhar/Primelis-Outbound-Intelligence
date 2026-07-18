import type {
  AccountFitAssessment,
  CaseStudyRecommendation,
  ClaimSafetyResult,
  PersonaRecommendation,
  SignalBrainGeneration,
  SignalBrainInput,
  SignalBrainIntent,
  SignalBrainKnowledgeRecord,
} from "@/features/ask-signal-brain/types";
import type { ReplyProviderMetadata } from "@/features/reply-to-prospect/types";

import { createAiProvider } from "./ai-provider";

export type SignalBrainProviderRequest = {
  input: SignalBrainInput;
  intents: SignalBrainIntent[];
  records: SignalBrainKnowledgeRecord[];
  safetyWarnings: string[];
  accountFit?: AccountFitAssessment;
  personaRecommendation?: PersonaRecommendation;
  claimSafety?: ClaimSafetyResult;
  caseStudyRecommendation?: CaseStudyRecommendation;
};

export interface SignalBrainProvider {
  metadata: ReplyProviderMetadata;
  generate(request: SignalBrainProviderRequest): Promise<SignalBrainGeneration>;
}

const workflowLinks = [
  { label: "Create Outreach", href: "/create-outreach" },
  { label: "Build Sequence", href: "/build-sequence" },
  { label: "Reply to Prospect", href: "/reply-to-prospect" },
  { label: "Signal Playbook", href: "/playbook" },
  { label: "Do Not Contact", href: "/do-not-contact" },
];

function trimSentences(text: string, maxSentences: number) {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return sentences.slice(0, maxSentences).join(" ");
}

function stripBlockedLanguage(text: string) {
  return text
    .replace(
      /\b(pricing|price|poc|proof of concept|trial|discount|commercial offer)\b/gi,
      "commercial terms",
    )
    .replace(/\bguarantee(?:d|s)?\b/gi, "support")
    .replace(/\balways\b/gi, "can");
}

function primaryRecord(records: SignalBrainKnowledgeRecord[]) {
  return (
    records.find((record) => record.type === "PRODUCT_TRUTH") ??
    records.find((record) => record.type === "PLAYBOOK_GUIDANCE") ??
    records[0]
  );
}

function relevantRecords(input: SignalBrainInput, records: SignalBrainKnowledgeRecord[]) {
  const question = [
    input.question,
    input.currentVendor,
    input.paidSearchContext,
    input.observedTrigger,
    input.internalNotes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const keywords = Array.from(
    new Set(
      question
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length > 3),
    ),
  );

  return records
    .map((record) => {
      const haystack = `${record.title} ${record.approvedText}`.toLowerCase();
      const score = keywords.reduce(
        (total, keyword) => total + (haystack.includes(keyword) ? 1 : 0),
        0,
      );
      return { record, score };
    })
    .sort((a, b) => b.score - a.score)
    .filter((item) => item.score > 0)
    .map((item) => item.record);
}

function blendedCtrAnswer() {
  return [
    "Blended CTR is the combined click-through view across paid brand and organic brand results.",
    "The point is not to ask whether paid search looks efficient on its own. The point is to understand the total outcome on the search page: paid clicks, organic clicks, and whether paid coverage is still adding incremental demand.",
    "For Signal, this matters because a brand ad can show strong CTR while organic would have captured much of the demand anyway. Blended CTR helps frame the decision more clearly: keep coverage when it protects demand, lower bids or pause when the paid click is not changing the outcome, and bring coverage back when the page changes.",
  ].join("\n\n");
}

function revvimAnswer() {
  return [
    "Revvim is a relevant branded-search / paid-search optimization setup, so the right answer is not to attack it or force a displacement angle.",
    "The useful question is narrower: does the current setup automatically decide what to do when the search page changes? For example, when nobody else is bidding, can it safely pause or lower brand bids; and when competitors return, can it restore coverage without turning the decision into a manual review?",
    "That is where Signal should be positioned: not as another report, but as a decision layer for paid brand coverage, organic visibility, and live search-page activity.",
  ].join("\n\n");
}

function answerForMode({
  input,
  intents,
  records,
  accountFit,
  personaRecommendation,
  claimSafety,
  caseStudyRecommendation,
}: SignalBrainProviderRequest) {
  const selectedRecords = relevantRecords(input, records);
  const record = selectedRecords[0] ?? primaryRecord(records);
  const baseFact = record
    ? trimSentences(
        stripBlockedLanguage(record.approvedText),
        input.mode === "DETAILED_GUIDANCE" ? 3 : 2,
      )
    : "I do not have enough approved Signal knowledge to make a specific factual claim.";

  const questionText = [input.question, input.currentVendor].filter(Boolean).join(" ");
  if (/\bblended\s+ctr\b/i.test(questionText)) {
    return blendedCtrAnswer();
  }
  if (/\brevvim\b/i.test(questionText)) {
    return revvimAnswer();
  }

  if (input.mode === "ACCOUNT_QUALIFICATION" || intents.includes("ACCOUNT_QUALIFICATION")) {
    return accountFit
      ? `${accountFit.result}. ${accountFit.verifiedSignals.length > 0 ? accountFit.verifiedSignals.join(" ") : "There are not enough verified fit signals yet."}`
      : "Insufficient information. Verify branded-search activity, ownership, and suppression status before outreach.";
  }

  if (input.mode === "PERSONA_RECOMMENDATION" || intents.includes("PERSONA_TARGETING")) {
    return personaRecommendation
      ? `Start with ${personaRecommendation.primaryPersona}; use ${personaRecommendation.secondaryPersona} as the secondary route. ${personaRecommendation.reason}`
      : "Prioritize the person closest to Paid Search or Performance ownership rather than choosing by seniority alone.";
  }

  if (input.mode === "CLAIM_SAFETY_CHECK" || intents.includes("CLAIM_SAFETY")) {
    return claimSafety
      ? `${claimSafety.status}. ${claimSafety.reason}`
      : "Needs revision. Keep claims source-backed and remove certainty language.";
  }

  if (input.mode === "CASE_STUDY_SELECTION" || intents.includes("CASE_STUDY_SELECTION")) {
    return caseStudyRecommendation
      ? `${caseStudyRecommendation.recommendedCaseStudy} is the best available case study. ${caseStudyRecommendation.whyItFits}`
      : "No eligible case study is available for this question. Use a product-truth or methodology angle instead.";
  }

  if (intents.includes("COMPETITOR_CONTEXT")) {
    return [
      "Validate the existing setup first. Do not make unsupported claims about the vendor.",
      baseFact,
      "The useful angle is the decision gap: whether the team can act on search-page changes automatically instead of reviewing paid-brand coverage manually.",
    ].join(" ");
  }

  return baseFact;
}

export class DeterministicSignalBrainProvider implements SignalBrainProvider {
  metadata: ReplyProviderMetadata = {
    providerName: "deterministic-development",
    modelName: "local-signal-brain-v1",
    deterministic: true,
  };

  async generate(request: SignalBrainProviderRequest): Promise<SignalBrainGeneration> {
    const {
      input,
      intents,
      records,
      safetyWarnings,
      accountFit,
      personaRecommendation,
      claimSafety,
      caseStudyRecommendation,
    } = request;
    const directAnswer = stripBlockedLanguage(answerForMode(request));
    const recommendation =
      personaRecommendation?.suitableCta ??
      accountFit?.recommendedNextResearchStep ??
      claimSafety?.saferAlternative ??
      "Use approved Signal knowledge, keep assumptions explicit, and choose the next workflow based on whether you need outreach, a sequence, or a reply.";
    const usedTitles = records.slice(0, 4).map((record) => record.title);

    return {
      directAnswer,
      conciseRecommendation: stripBlockedLanguage(recommendation),
      detectedIntent: intents,
      reasoningSummary: [
        `Mode: ${input.mode.replaceAll("_", " ").toLowerCase()}.`,
        usedTitles.length > 0
          ? `Used approved records: ${usedTitles.join(", ")}.`
          : "No eligible approved records were available, so the answer stayed conservative.",
        "No external research was performed.",
      ].join(" "),
      recommendedNextAction:
        input.mode === "CLAIM_SAFETY_CHECK"
          ? "Revise the claim, then use approved wording in Create Outreach or Reply to Prospect."
          : input.mode === "ACCOUNT_QUALIFICATION"
            ? "Check Do Not Contact, then verify the strongest missing fit signal."
            : "Open the most relevant workflow from the links below.",
      workflowLinks,
      safetyWarnings,
      accountFit,
      personaRecommendation,
      claimSafety,
      caseStudyRecommendation,
    };
  }
}

export function createSignalBrainProvider(
  env: NodeJS.ProcessEnv = process.env,
): SignalBrainProvider {
  if (env.AI_PROVIDER !== "openai") {
    return new DeterministicSignalBrainProvider();
  }

  return {
    metadata: {
      providerName: "openai",
      modelName: env.OPENAI_MODEL ?? "not-configured",
      deterministic: false,
    },
    async generate(request) {
      const fallback = new DeterministicSignalBrainProvider();
      const result = await fallback.generate(request);
      const provider = createAiProvider(env);
      const providerStatus = await provider.getProviderStatus();
      if (providerStatus.status !== "CONFIGURED") {
        return {
          ...result,
          safetyWarnings: [...result.safetyWarnings, providerStatus.message],
        };
      }
      try {
        const aiResult = await provider.answerSignalBrain({
          workflow: "ASK_SIGNAL_BRAIN",
          currentDraft: result.directAnswer,
          context: {
            approvedFacts: request.records.map((record) => record.approvedText).slice(0, 10),
            sourceReferences: request.records.flatMap((record) =>
              record.sourceIds.map((id, index) => ({
                id,
                title: record.sourceTitles[index],
                sourceDate: record.sourceDates[index],
              })),
            ),
            safetyPolicy: result.safetyWarnings,
          },
        });
        return {
          ...result,
          directAnswer: aiResult.primaryContent,
          conciseRecommendation: aiResult.shorterAlternative ?? result.conciseRecommendation,
          safetyWarnings: [...result.safetyWarnings, ...aiResult.uncertaintyNotes],
        };
      } catch {
        return {
          ...result,
          safetyWarnings: [
            ...result.safetyWarnings,
            "AI provider failed safely; deterministic fallback was used.",
          ],
        };
      }
    },
  };
}
