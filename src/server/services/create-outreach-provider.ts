import { labelForOutreachAngle } from "@/features/create-outreach/outreach-policy";
import type {
  CreateOutreachInput,
  OutreachGeneration,
  OutreachKnowledgeRecord,
  OutreachSourceReference,
} from "@/features/create-outreach/types";
import type { ReplyProviderMetadata } from "@/features/reply-to-prospect/types";

import { createAiProvider } from "./ai-provider";

export type OutreachProviderRequest = {
  input: CreateOutreachInput;
  records: OutreachKnowledgeRecord[];
  sourceReferences: OutreachSourceReference[];
  generation: Omit<
    OutreachGeneration,
    | "subjectLines"
    | "connectionRequest"
    | "recommendedMessage"
    | "shorterVersion"
    | "cta"
    | "claimsUsed"
  >;
};

export interface OutreachAiProvider {
  metadata: ReplyProviderMetadata;
  generate(request: OutreachProviderRequest): Promise<OutreachGeneration>;
}

function trimSentences(text: string, maxSentences: number) {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return sentences.slice(0, maxSentences).join(" ");
}

function stripCommercialTerms(text: string) {
  return text.replace(
    /\b(pricing|price|poc|proof of concept|trial|discount|guarantee|guaranteed)\b/gi,
    "commercial details",
  );
}

function greeting(input: CreateOutreachInput) {
  return input.contactFirstName ? `Hi ${input.contactFirstName},` : "Hi,";
}

function ctaFor(input: CreateOutreachInput) {
  if (input.channel === "LINKEDIN") {
    return "Open to a quick exchange on whether this is relevant?";
  }
  return "Worth a short exchange to see if this is relevant?";
}

function subjectLinesFor(input: CreateOutreachInput, angleLabel: string) {
  const company = input.companyName;
  return [
    `${company} and branded-search efficiency`,
    `Idea for ${company}'s brand search`,
    `Question on ${angleLabel}`,
  ];
}

function connectionRequestFor(input: CreateOutreachInput) {
  return `Hi ${input.contactFirstName || "there"} - noticed a reason to compare branded-search methodology at ${input.companyName}. Open to connecting?`;
}

export class DeterministicOutreachProvider implements OutreachAiProvider {
  metadata: ReplyProviderMetadata = {
    providerName: "deterministic-development",
    modelName: "local-outreach-template-v1",
    deterministic: true,
  };

  async generate({
    input,
    records,
    generation,
  }: OutreachProviderRequest): Promise<OutreachGeneration> {
    const productFacts = records
      .filter((record) => record.type === "PRODUCT_TRUTH")
      .map((record) => stripCommercialTerms(record.approvedText));
    const angleLabel = labelForOutreachAngle(generation.selectedAngle);
    const primaryFact = productFacts[0]
      ? trimSentences(productFacts[0], input.desiredLength === "DETAILED" ? 2 : 1)
      : "I do not have enough approved Signal knowledge to make a specific factual claim.";
    const personaPhrase = generation.personaGuidance.emphasis;
    const trigger = input.observedTrigger.trim();
    const assumptionNote = input.paidSearchContext
      ? "Given the paid-search context you shared,"
      : "Based on the outreach trigger you shared,";
    const cta = ctaFor(input);

    const recommended =
      input.channel === "EMAIL"
        ? [
            greeting(input),
            "",
            `${assumptionNote} I thought ${angleLabel} could be worth a look for ${input.companyName}.`,
            `${primaryFact}`,
            `For a ${input.contactRole}, the useful lens is ${personaPhrase}, without assuming details we have not verified.`,
            "",
            cta,
          ].join("\n")
        : [
            `${input.contactFirstName ? `${input.contactFirstName}, ` : ""}${assumptionNote.toLowerCase()} ${angleLabel} may be worth a look at ${input.companyName}.`,
            primaryFact,
            cta,
          ].join(" ");

    const shorter =
      input.channel === "EMAIL"
        ? [
            greeting(input),
            "",
            `${trigger} made me think ${angleLabel} may be relevant for ${input.companyName}. ${trimSentences(primaryFact, 1)}`,
            "",
            cta,
          ].join("\n")
        : `${trigger} made me think ${angleLabel} may be relevant for ${input.companyName}. ${cta}`;

    return {
      ...generation,
      subjectLines: input.channel === "EMAIL" ? subjectLinesFor(input, angleLabel) : [],
      connectionRequest: input.channel === "LINKEDIN" ? connectionRequestFor(input) : undefined,
      recommendedMessage: stripCommercialTerms(recommended),
      shorterVersion: stripCommercialTerms(shorter),
      cta,
      claimsUsed: productFacts.map((fact) => trimSentences(fact, 1)),
    };
  }
}

export function createOutreachAiProvider(env: NodeJS.ProcessEnv = process.env): OutreachAiProvider {
  if (env.AI_PROVIDER !== "openai") {
    return new DeterministicOutreachProvider();
  }

  return {
    metadata: {
      providerName: "openai",
      modelName: env.OPENAI_MODEL ?? "not-configured",
      deterministic: false,
    },
    async generate(request) {
      const fallback = new DeterministicOutreachProvider();
      const result = await fallback.generate(request);
      const provider = createAiProvider(env);
      const providerStatus = await provider.getProviderStatus();
      if (providerStatus.status !== "CONFIGURED") {
        return {
          ...result,
          safetyNotes: [...result.safetyNotes, providerStatus.message],
        };
      }
      try {
        const aiResult = await provider.generateDraft({
          workflow: "CREATE_OUTREACH",
          currentDraft: result.recommendedMessage,
          context: {
            approvedFacts: request.records.map((record) => record.approvedText).slice(0, 10),
            sourceReferences: request.sourceReferences,
            safetyPolicy: result.safetyNotes,
          },
        });
        return {
          ...result,
          recommendedMessage: aiResult.primaryContent,
          shorterVersion: aiResult.shorterAlternative ?? result.shorterVersion,
          cta: aiResult.cta ?? result.cta,
          subjectLines: aiResult.subjectLines ?? result.subjectLines,
          claimsUsed: aiResult.factualClaimsUsed.length
            ? aiResult.factualClaimsUsed
            : result.claimsUsed,
          safetyNotes: [...result.safetyNotes, ...aiResult.uncertaintyNotes],
        };
      } catch {
        return {
          ...result,
          safetyNotes: [
            ...result.safetyNotes,
            "AI provider failed safely; deterministic fallback was used.",
          ],
        };
      }
    },
  };
}
