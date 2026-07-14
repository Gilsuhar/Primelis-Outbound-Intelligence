import type {
  ProspectIntent,
  ReplyGeneration,
  ReplyKnowledgeRecord,
  ReplyProviderMetadata,
  ReplyToProspectInput,
} from "@/features/reply-to-prospect/types";
import { outputLanguageInstruction } from "@/lib/output-language";

import { createAiProvider } from "./ai-provider";

export type ReplyProviderRequest = {
  input: ReplyToProspectInput;
  intents: ProspectIntent[];
  records: ReplyKnowledgeRecord[];
  safetyWarnings: string[];
};

export interface ReplyAiProvider {
  metadata: ReplyProviderMetadata;
  generate(request: ReplyProviderRequest): Promise<ReplyGeneration>;
}

function openingFor(input: ReplyToProspectInput, intents: ProspectIntent[]) {
  if (intents.includes("NOT_INTERESTED")) {
    return "Totally understood.";
  }
  if (intents.includes("DECK_REQUEST")) {
    return "Yes, happy to send it.";
  }
  if (intents.includes("TECHNICAL_QUESTION") || intents.includes("METHODOLOGY_QUESTION")) {
    return "Good question.";
  }
  if (intents.includes("EXISTING_VENDOR")) {
    return "That makes sense.";
  }
  return input.channel === "LINKEDIN" ? "Thanks for the note." : "Thanks for the note.";
}

function trimSentences(text: string, maxSentences: number) {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return sentences.slice(0, maxSentences).join(" ");
}

function stripDisallowedCommercialTerms(text: string) {
  return text.replace(
    /\b(pricing|price|poc|proof of concept|trial|discount)\b/gi,
    "commercial details",
  );
}

function humanizeFact(fact: string) {
  if (/solo|competitive|ghost|pause|reduce bids|serp|google ads|search console|conversion-source|conversion performance/i.test(fact)) {
    return "The core idea is simple: compare paid brand coverage with organic results before deciding where spend is still needed.";
  }
  return fact;
}

function deckReply(input: ReplyToProspectInput, facts: string[]) {
  const opener = "Yes, happy to send it.";
  const context = input.companyName
    ? `I will keep it focused on the ${input.companyName} angle rather than sending a generic overview.`
    : "I will keep it focused and practical rather than sending a generic overview.";
  const usefulLine =
    facts[0] && !/not have enough/i.test(facts[0])
      ? humanizeFact(trimSentences(facts[0], 1))
      : "The short version: it helps teams decide when paid brand coverage is actually needed, and when organic results may already be doing enough.";
  const cta =
    input.channel === "LINKEDIN"
      ? "I can send the deck and add two bullets on the part most relevant to your setup."
      : "I can send the deck and add two bullets on the part most relevant to your setup.";

  return [opener, context, usefulLine, cta].join(" ");
}

function intentBridge(intents: ProspectIntent[]) {
  if (intents.includes("EXISTING_VENDOR")) {
    return "I would not frame this as replacing what you already use. The question is whether you have a clear way to decide when paid brand is still needed versus what organic already captures.";
  }
  if (intents.includes("METHODOLOGY_QUESTION") || intents.includes("TECHNICAL_QUESTION")) {
    return "I would look at it less as 'are competitors bidding?' and more as 'what would happen if we changed paid coverage?'";
  }
  if (intents.includes("NOT_INTERESTED")) {
    return "No problem. The only reason I reached out is that paid brand can quietly become hard to judge from campaign metrics alone.";
  }
  return undefined;
}

export class DeterministicReplyProvider implements ReplyAiProvider {
  metadata: ReplyProviderMetadata = {
    providerName: "deterministic-development",
    modelName: "local-template-v1",
    deterministic: true,
  };

  async generate({
    input,
    intents,
    records,
    safetyWarnings,
  }: ReplyProviderRequest): Promise<ReplyGeneration> {
    const facts = records
      .filter((record) => record.type === "PRODUCT_TRUTH")
      .map((record) => stripDisallowedCommercialTerms(record.approvedText));
    const rules = records
      .filter((record) => record.type === "MESSAGE_EXAMPLE")
      .map((record) => record.approvedText);
    const primaryFact = facts[0]
      ? humanizeFact(trimSentences(facts[0], input.desiredLength === "DETAILED" ? 3 : 2))
      : "I do not have enough approved Signal knowledge to make a specific factual claim.";
    const secondaryFact = facts[1]
      ? humanizeFact(trimSentences(stripDisallowedCommercialTerms(facts[1]), 1))
      : "";
    const companyPhrase = input.companyName ? ` for ${input.companyName}` : "";
    const cta =
      input.channel === "LINKEDIN"
        ? "Worth comparing notes?"
        : "Worth a quick compare against how you decide this today?";
    const bridge = intentBridge(intents);

    const recommendedReply = intents.includes("DECK_REQUEST")
      ? deckReply(input, [primaryFact, secondaryFact].filter(Boolean))
      : [
          openingFor(input, intents),
          bridge,
          primaryFact,
          !bridge ? secondaryFact : "",
          cta,
        ]
          .filter(Boolean)
          .join(" ");

    const shorterAlternative = intents.includes("DECK_REQUEST")
      ? [
          input.channel === "LINKEDIN" ? "Yes, happy to send it." : "Yes, happy to send it over.",
          "I will keep it focused on when paid brand coverage is useful and where it may be wasteful.",
        ].join(" ")
      : [
          openingFor(input, intents),
          facts[0]
            ? humanizeFact(trimSentences(facts[0], 1))
            : "I can only answer from approved Signal material.",
          input.channel === "LINKEDIN"
            ? "Worth comparing notes?"
            : "Happy to send two tailored bullets.",
        ]
          .filter(Boolean)
          .join(" ");

    const strategyParts = [
      `Detected ${intents.map((intent) => intent.toLowerCase().replaceAll("_", " ")).join(", ")}${companyPhrase}.`,
      "Answer the prospect's question first, use only approved Signal records, and keep the CTA soft.",
      rules.length > 0 ? "Messaging rules were used as guardrails, not as external claims." : "",
    ].filter(Boolean);

    return {
      recommendedReply: stripDisallowedCommercialTerms(recommendedReply),
      shorterAlternative: stripDisallowedCommercialTerms(shorterAlternative),
      responseStrategy: strategyParts.join(" "),
      detectedIntent: intents,
      claimsUsed: facts.map((fact) => trimSentences(fact, 1)),
      safetyWarnings,
    };
  }
}

export function createReplyAiProvider(env: NodeJS.ProcessEnv = process.env): ReplyAiProvider {
  if (env.AI_PROVIDER !== "openai") {
    return new DeterministicReplyProvider();
  }

  return {
    metadata: {
      providerName: "openai",
      modelName: env.OPENAI_MODEL ?? "not-configured",
      deterministic: false,
    },
    async generate(request) {
      const fallback = new DeterministicReplyProvider();
      const result = await fallback.generate(request);
      if (request.intents.includes("DECK_REQUEST")) {
        return result;
      }
      const provider = createAiProvider(env);
      const providerStatus = await provider.getProviderStatus();
      if (providerStatus.status !== "CONFIGURED") {
        return {
          ...result,
          safetyWarnings: [...result.safetyWarnings, providerStatus.message],
        };
      }
      try {
        const aiResult = await provider.refineDraft({
          workflow: "REPLY_TO_PROSPECT",
          currentDraft: result.recommendedReply,
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
            outputLanguageInstruction: outputLanguageInstruction(request.input.outputLanguage ?? "ENGLISH"),
          },
        });
        return {
          ...result,
          recommendedReply: aiResult.primaryContent,
          shorterAlternative: aiResult.shorterAlternative ?? result.shorterAlternative,
          claimsUsed: aiResult.factualClaimsUsed.length
            ? aiResult.factualClaimsUsed
            : result.claimsUsed,
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
