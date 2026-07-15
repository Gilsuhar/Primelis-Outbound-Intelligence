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
  const opener =
    input.channel === "LINKEDIN" ? "Yes, happy to send it." : "Yes, happy to send it over.";
  const companyLine = input.companyName
    ? `I will keep it focused on the ${input.companyName} question, not a generic overview.`
    : "I will keep it focused, not a generic overview.";
  const usefulLine =
    facts[0] && !/not have enough/i.test(facts[0])
      ? "Short version: Signal is useful when the team wants to know where paid brand coverage is still needed and where organic results may already be doing enough."
      : "Short version: it is about deciding where paid brand coverage is still needed and where organic results may already be doing enough.";
  const cta =
    input.channel === "LINKEDIN"
      ? "I can send the deck and add two bullets most relevant to your setup."
      : "I can send the deck and add two bullets most relevant to your setup.";

  return [opener, companyLine, usefulLine, cta].join(" ");
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

function methodologyReply(input: ReplyToProspectInput) {
  const opener = "Good question.";
  const answer =
    "If no competitors are bidding, I would not automatically keep or pause brand ads. I would first compare paid coverage with organic results to see whether the paid clicks are changing the outcome.";
  const product =
    "Signal helps make that check practical by showing when paid brand is protecting demand and when organic may already be carrying it.";
  const cta =
    input.channel === "LINKEDIN"
      ? "Happy to send the simple version."
      : "Happy to send the simple version if useful.";
  return [opener, answer, product, cta].join(" ");
}

function existingVendorReply(input: ReplyToProspectInput) {
  const opener = "That makes sense.";
  const answer =
    "I would not frame this as replacing what you already use. The useful question is whether your current setup clearly shows when paid brand is still needed versus when organic would have captured the demand anyway.";
  const cta =
    input.channel === "LINKEDIN"
      ? "Worth comparing how you decide that today?"
      : "Worth comparing how you decide that today?";
  return [opener, answer, cta].join(" ");
}

function notInterestedReply(input: ReplyToProspectInput) {
  const opener = "Totally understood.";
  const reason =
    "I reached out because paid brand can be hard to judge from campaign metrics alone, but no need to force it if it is not a priority.";
  const cta =
    input.channel === "LINKEDIN"
      ? "I can close the loop here."
      : "I can close the loop here.";
  return [opener, reason, cta].join(" ");
}

function timingReply(input: ReplyToProspectInput) {
  const opener = "Makes sense.";
  const answer =
    "If timing is not right now, the useful thing to park is the question itself: where is paid brand protecting demand, and where is it just adding cost?";
  const cta =
    input.channel === "LINKEDIN"
      ? "Want me to follow up later?"
      : "Want me to follow up later, or should I close the loop?";
  return [opener, answer, cta].join(" ");
}

function defaultReply(input: ReplyToProspectInput, intents: ProspectIntent[], primaryFact: string, secondaryFact: string) {
  const cta =
    input.channel === "LINKEDIN"
      ? "Worth comparing notes?"
      : "Worth a quick compare against how you decide this today?";
  const bridge = intentBridge(intents);

  return [
    openingFor(input, intents),
    bridge,
    primaryFact,
    !bridge && secondaryFact ? secondaryFact : "",
    cta,
  ]
    .filter(Boolean)
    .join(" ");
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

    const recommendedReply = (() => {
      if (intents.includes("DECK_REQUEST")) {
        return deckReply(input, [primaryFact, secondaryFact].filter(Boolean));
      }
      if (intents.includes("NOT_INTERESTED")) {
        return notInterestedReply(input);
      }
      if (intents.includes("METHODOLOGY_QUESTION") || intents.includes("TECHNICAL_QUESTION")) {
        return methodologyReply(input);
      }
      if (intents.includes("TIMING")) {
        return timingReply(input);
      }
      if (intents.includes("EXISTING_VENDOR")) {
        return existingVendorReply(input);
      }
      return defaultReply(input, intents, primaryFact, secondaryFact);
    })();

    const shorterAlternative = intents.includes("DECK_REQUEST")
      ? [
          input.channel === "LINKEDIN" ? "Yes, happy to send it." : "Yes, happy to send it over.",
          "I will keep it focused on your paid-brand question and add two relevant bullets.",
        ].join(" ")
      : intents.includes("METHODOLOGY_QUESTION") || intents.includes("TECHNICAL_QUESTION")
        ? [
            "Good question.",
            "I would first check whether paid brand clicks are changing the outcome or whether organic would already capture that demand.",
            "Happy to send the simple version.",
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
