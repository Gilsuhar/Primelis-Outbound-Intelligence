import type {
  CreateOutreachInput,
  OutreachGeneration,
  OutreachKnowledgeRecord,
  OutreachSourceReference,
} from "@/features/create-outreach/types";
import type { ReplyProviderMetadata } from "@/features/reply-to-prospect/types";
import { outputLanguageInstruction } from "@/lib/output-language";

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
    | "emailSections"
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
  return input.contactFirstName ? `Hi ${input.contactFirstName},` : "Hi there,";
}

function cleanSelection(value?: string) {
  if (!value) {
    return undefined;
  }
  return value
    .replace(/^Strong fit\s*-\s*/i, "")
    .replace(/^Possible fit\s*-\s*/i, "")
    .replace(/^Core ICP:\s*/i, "")
    .replace(/^Quick discovery:\s*/i, "")
    .trim();
}

function triggerPhrase(input: CreateOutreachInput) {
  const trigger = cleanSelection(input.observedTrigger);
  const company = input.companyName;

  if (!trigger) {
    return `I thought ${company} could be worth a focused brand-search conversation.`;
  }
  if (/validate branded-search activity|confirm branded-search activity/i.test(trigger)) {
    return `I thought ${company} could be worth a quick brand-search fit check.`;
  }
  if (/competitors/i.test(trigger)) {
    return `I noticed a possible brand-search efficiency angle at ${company}.`;
  }
  if (/efficiency|brand-spend/i.test(trigger)) {
    return `I thought there may be a brand-spend efficiency question worth checking at ${company}.`;
  }
  if (/multi-market|governance|control/i.test(trigger)) {
    return `I thought ${company} may have a useful cross-market brand-search control question.`;
  }
  if (/growth|acquisition/i.test(trigger)) {
    return `I thought ${company}'s growth context could make brand-search efficiency worth a look.`;
  }
  return `${trigger} made me think a brand-search efficiency conversation may be relevant for ${company}.`;
}

function ctaFor(input: CreateOutreachInput) {
  if (input.channel === "LINKEDIN") {
    return "Open to comparing notes?";
  }
  return "Worth comparing how you decide this today?";
}

function subjectLinesFor(input: CreateOutreachInput) {
  const company = input.companyName;
  return [
    `${company} brand-search question`,
    `Paid + organic at ${company}`,
    `${company} brand-spend check`,
  ];
}

function connectionRequestFor(input: CreateOutreachInput) {
  return `Hi ${input.contactFirstName || "there"} - noticed a potential brand-search efficiency question at ${input.companyName}. Open to connecting?`;
}

function fitSignalForEmail(value?: string) {
  const clean = cleanSelection(value);
  if (!clean) {
    return undefined;
  }
  if (/\$|revenue|employees|enterprise|multi-market|multi-country/i.test(clean)) {
    return "a larger paid-search setup where small brand decisions can affect spend";
  }
  if (/monthly|spend/i.test(clean)) {
    return "active brand-search spend where efficiency can matter";
  }
  if (/brand demand|paid-search owner/i.test(clean)) {
    return "clear brand demand and someone owning paid search";
  }
  if (/validate brand demand|not enough signal|unknown/i.test(clean)) {
    return "a brand-demand question worth checking first";
  }
  return clean.toLowerCase();
}

function contextDetails(input: CreateOutreachInput) {
  return [
    fitSignalForEmail(input.companyContext),
    input.geographyOrMarkets ? `${input.geographyOrMarkets} market context` : undefined,
  ].filter(Boolean);
}

function contextLine(input: CreateOutreachInput) {
  const details = contextDetails(input);
  if (details.length === 0) {
    return `I thought ${input.companyName} could be worth a quick brand-search fit check.`;
  }

  if (details.some((detail) => /brand demand|paid-search|brand-search|spend/i.test(String(detail)))) {
    return `I had ${input.companyName} on my list because branded search is one of those channels where spend can look safe, but the real question is whether paid coverage is still adding value.`;
  }

  return `I had ${input.companyName} on my list because there may be a practical brand-search efficiency question worth checking.`;
}

function personaLine(input: CreateOutreachInput) {
  const scaleHint = /\$|revenue|employees|enterprise|multi-market|monthly|spend/i.test(
    input.companyContext ?? "",
  )
    ? " At that scale, even small changes in paid brand coverage can affect budget and reporting."
    : "";
  return `The hard part is separating brand clicks worth paying for from demand organic search may already capture.${scaleHint}`;
}

function humanizeProductFact(fact: string) {
  if (/solo|competitive|ghost|pause|reduce bids|brand.*only advertiser/i.test(fact)) {
    return "Signal helps compare paid brand ads with organic results and changes in the search page, so the team can see where coverage is useful and where spend may be wasted.";
  }

  if (/paid.*organic|organic.*paid|serp|competitive/i.test(fact)) {
    return "Signal compares paid brand ads with organic visibility and search-page changes, so the team can make a clearer decision before changing coverage or spend.";
  }

  return fact;
}

function caseStudyLine(records: OutreachKnowledgeRecord[]) {
  const caseStudy = records.find((record) => record.type === "CASE_STUDY");
  if (!caseStudy) {
    return undefined;
  }

  return `Optional proof point: ${trimSentences(caseStudy.approvedText, 1)}`;
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
    const primaryFact = productFacts[0]
      ? trimSentences(productFacts[0], input.desiredLength === "DETAILED" ? 2 : 1)
      : "I do not have enough approved Signal knowledge to make a specific factual claim.";
    const cta = ctaFor(input);
    const context = contextLine(input);
    const opening = triggerPhrase(input);
    const roleLine = personaLine(input);
    const factLine =
      primaryFact === "I do not have enough approved Signal knowledge to make a specific factual claim."
        ? "Signal is used to compare paid brand activity with organic visibility and live competitive conditions before changing spend."
        : humanizeProductFact(primaryFact);
    const proofLine = caseStudyLine(records);
    const emailSections = [
      {
        label: "INTRO" as const,
        text: `${greeting(input)}\n\n${context}`,
      },
      {
        label: "PAIN POINT" as const,
        text: roleLine,
      },
      {
        label: "SOLUTION" as const,
        text: [factLine, proofLine].filter(Boolean).join("\n\n"),
      },
      {
        label: "SOFT CTA" as const,
        text: cta,
      },
    ];

    const recommended =
      input.channel === "EMAIL"
        ? emailSections.map((section) => section.text).join("\n\n")
        : [
            `${input.contactFirstName ? `${input.contactFirstName}, ` : ""}${opening}`,
            factLine,
            cta,
          ].join(" ");

    const shorter =
      input.channel === "EMAIL"
        ? [
            greeting(input),
            "",
            `${opening} ${trimSentences(factLine, 1)}`,
            "",
            cta,
          ].join("\n")
        : `${opening} ${cta}`;

    return {
      ...generation,
      subjectLines: input.channel === "EMAIL" ? subjectLinesFor(input) : [],
      connectionRequest: input.channel === "LINKEDIN" ? connectionRequestFor(input) : undefined,
      recommendedMessage: stripCommercialTerms(recommended),
      emailSections: emailSections.map((section) => ({
        ...section,
        text: stripCommercialTerms(section.text),
      })),
      shorterVersion: stripCommercialTerms(shorter),
      cta,
      claimsUsed: [
        ...productFacts.map((fact) => trimSentences(fact, 1)),
        ...records
          .filter((record) => record.type === "CASE_STUDY")
          .map((record) => trimSentences(record.approvedText, 1)),
      ],
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
            outputLanguageInstruction: outputLanguageInstruction(request.input.outputLanguage ?? "ENGLISH"),
          },
        });
        return {
          ...result,
          recommendedMessage: aiResult.primaryContent,
          emailSections: result.emailSections,
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
