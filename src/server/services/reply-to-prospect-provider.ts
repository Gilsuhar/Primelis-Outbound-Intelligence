import type {
  ProspectIntent,
  ReplyGeneration,
  ReplyKnowledgeRecord,
  ReplyProviderMetadata,
  ReplyToProspectInput,
} from "@/features/reply-to-prospect/types";
import { outputLanguageInstruction } from "@/lib/output-language";

import { createAiProvider, mapAiProviderError } from "./ai-provider";

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

function deckReply(input: ReplyToProspectInput) {
  const opener =
    input.channel === "LINKEDIN" ? "Yes, happy to send it." : "Yes, happy to send it over.";
  const companyLine = input.companyName
    ? `I will keep it focused on the ${input.companyName} paid-brand question, not a generic overview.`
    : "I will keep it focused on the paid-brand question, not a generic overview.";
  const usefulLine =
    "Short version: Google does not make it easy to pause or down-bid brand ads when no competitors are bidding. Signal catches those moments, lowers or pauses bids when the paid click is not changing the outcome, and restores coverage when competition returns.";
  const cta =
    input.channel === "LINKEDIN"
      ? "I can send the deck with two bullets that match your setup."
      : "I can send the deck with two bullets that match your setup.";

  return [opener, companyLine, usefulLine, cta].join(" ");
}

function intentBridge(intents: ProspectIntent[]) {
  if (intents.includes("EXISTING_VENDOR")) {
    return "I would not position this as a replacement. The useful gap is the decision layer: when to keep paid brand live, when to lower bids, and when organic is already enough.";
  }
  if (intents.includes("METHODOLOGY_QUESTION") || intents.includes("TECHNICAL_QUESTION")) {
    return "I would look at it less as 'are competitors bidding?' and more as 'what would happen if we changed paid coverage?'";
  }
  if (intents.includes("NOT_INTERESTED")) {
    return "No problem. The only reason I reached out is that paid brand can quietly become hard to judge from campaign metrics alone.";
  }
  return undefined;
}

function detectedVendor(message: string) {
  const text = message.toLowerCase();
  if (/\brevvim\b/.test(text)) {
    return "Revvim";
  }
  if (/\badthena\b/.test(text)) {
    return "Adthena";
  }
  if (/\bauction insights\b/.test(text)) {
    return "Auction Insights";
  }
  return "your current setup";
}

function methodologyReply(input: ReplyToProspectInput) {
  const opener = "Good question.";
  const answer =
    "If no competitors are bidding, I would not automatically keep or pause brand ads. The first check is whether the paid click is changing the outcome, or whether organic would have captured most of that demand anyway.";
  const product =
    "Signal makes that decision practical by looking at paid coverage, organic visibility, and live search-page activity before bids change.";
  const cta =
    input.channel === "LINKEDIN"
      ? "Happy to send the simple version."
      : "Happy to send the simple version if useful.";
  return [opener, answer, product, cta].join(" ");
}

function existingVendorReply(input: ReplyToProspectInput) {
  const vendor = detectedVendor(input.prospectMessage);
  const opener = vendor === "your current setup" ? "That makes sense." : `That makes sense - ${vendor} is a serious setup.`;
  if (vendor === "Revvim") {
    const answer =
      input.desiredLength === "SHORT"
        ? "The gap I would check is narrower: can the setup decide when to pause, lower CPC, or stay covered as the search page changes?"
        : "The gap I would check is narrower: when no one is bidding, can the setup pause or lower CPC without losing the click; and when competitors come back, can it restore coverage without turning the decision into a manual review?";
    const cta = "Is that decision automated already on your side?";
    return [opener, answer, cta].join(" ");
  }
  const answer =
    vendor === "Auction Insights"
      ? "The gap I would check is whether those signals turn into action: pause when nobody else is bidding, lower CPC when coverage is still needed, and bring coverage back when the page changes."
      : "The gap I would check is whether your setup moves from visibility to action: pause, lower CPC, or stay covered based on what is actually happening on the search page.";
  const cta =
    input.channel === "LINKEDIN"
      ? "Is that automated today?"
      : "Is that automated today, or still reviewed manually?";
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
      ? "Do you already have a way to catch this?"
      : "Is this already part of your paid-brand review?";
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
        return deckReply(input);
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
          "I will keep it focused on the paid-brand question and add two relevant bullets.",
        ].join(" ")
      : intents.includes("METHODOLOGY_QUESTION") || intents.includes("TECHNICAL_QUESTION")
        ? [
            "Good question.",
            "I would first check whether paid brand clicks are changing the outcome or whether organic would already capture that demand.",
            "Happy to send the simple version.",
          ].join(" ")
        : intents.includes("EXISTING_VENDOR")
          ? [
              detectedVendor(input.prospectMessage) === "your current setup"
                ? "Makes sense."
                : `Makes sense - ${detectedVendor(input.prospectMessage)} is a serious setup.`,
              detectedVendor(input.prospectMessage) === "Revvim"
                ? "The gap I would check is whether it also lowers CPC when other advertisers are present, while keeping you covered."
                : "The gap I would check is whether you can lower or pause brand ads when nobody else is bidding, then bring coverage back when the page changes.",
              detectedVendor(input.prospectMessage) === "Revvim"
                ? "Is that already covered on your side?"
                : "Is that already automated on your side?",
            ].join(" ")
      : [
          openingFor(input, intents),
          facts[0]
            ? humanizeFact(trimSentences(facts[0], 1))
            : "I can only answer from approved Signal material.",
          input.channel === "LINKEDIN"
            ? "Do you already track this today?"
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
          context: {
            brief: {
              prospectMessage: request.input.prospectMessage,
              companyName: request.input.companyName,
              contactRole: request.input.contactRole,
              channel: request.input.channel,
              desiredTone: request.input.desiredTone,
              desiredLength: request.input.desiredLength,
              contextNotes: request.input.contextNotes,
              detectedIntent: request.intents,
            },
            writingInstructions: [
              "Write the reply from scratch from the prospect message, brief, and approved facts. Do not imitate a local template.",
              "Answer the prospect's actual question first.",
              "Sound like a calm senior seller, not support documentation.",
              "If the prospect asks for a deck, acknowledge it and ask the minimum useful follow-up or offer to send the relevant short material, using only approved facts.",
              "If they mention Adthena, Revvim, Auction Insights, an agency, or Google Ads, do not attack the vendor. Position Signal as the decision layer for paid-brand coverage.",
              "Keep it short enough to send as-is. No bullets unless the prospect explicitly asked for detail.",
              "Use one useful distinction: visibility, decision automation, paid vs organic, or when bids can safely come down.",
              "End with one low-pressure next question.",
            ],
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
      } catch (error) {
        const failure = mapAiProviderError(error);
        return {
          ...result,
          safetyWarnings: [
            ...result.safetyWarnings,
            `${failure.message} Deterministic fallback was used.`,
          ],
        };
      }
    },
  };
}
