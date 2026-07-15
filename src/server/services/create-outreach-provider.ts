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
    return `Quick question on ${company}: how do you handle branded ads when nobody else is bidding?`;
  }
  if (/validate branded-search activity|confirm branded-search activity/i.test(trigger)) {
    return `Quick question on ${company}: how do you handle branded ads when nobody else is bidding?`;
  }
  if (/competitors/i.test(trigger)) {
    return `I noticed a paid-brand question at ${company}: what happens when competitors are not bidding?`;
  }
  if (/efficiency|brand-spend/i.test(trigger)) {
    return `I thought there may be a paid-brand efficiency question worth checking at ${company}.`;
  }
  if (/multi-market|governance|control/i.test(trigger)) {
    return `I thought ${company} may have a useful cross-market brand-search question.`;
  }
  if (/growth|acquisition/i.test(trigger)) {
    return `I thought ${company}'s growth context could make brand-search efficiency worth a look.`;
  }
  return `${trigger} made me think a brand-search efficiency conversation may be relevant for ${company}.`;
}

function ctaFor(input: CreateOutreachInput) {
  if (input.channel === "LINKEDIN") {
    return "Do you already have a way to do that?";
  }
  if (input.desiredTone === "DIRECT") {
    return "Do you already have a way to do that?";
  }
  return "Worth comparing how you handle this today?";
}

function subjectLinesFor(input: CreateOutreachInput) {
  const company = input.companyName;
  const role = input.contactRole.toLowerCase();
  if (/growth|acquisition/i.test(role)) {
    return [
      `${company} brand search and acquisition efficiency`,
      `Quick thought on ${company} paid brand`,
      `Paid brand coverage at ${company}`,
    ];
  }
  if (/cmo|chief/i.test(role)) {
    return [
      `${company} brand-search visibility`,
      `Quick question on paid brand at ${company}`,
      `Paid vs organic coverage at ${company}`,
    ];
  }
  return [
    `${company} paid brand question`,
    `When nobody is bidding on ${company}`,
    `Quick thought on ${company} branded ads`,
  ];
}

function connectionRequestFor(input: CreateOutreachInput) {
  return `Hi ${input.contactFirstName || "there"} - had a quick paid-brand question for ${input.companyName}. Open to connecting?`;
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
    return `Quick question on ${input.companyName}: how do you handle branded ads when nobody else is bidding on your brand?`;
  }

  if (details.some((detail) => /brand demand|paid-search|brand-search|spend/i.test(String(detail)))) {
    return `Quick question on ${input.companyName}: how do you handle branded ads when nobody else is bidding on your brand?`;
  }

  return `Quick question on ${input.companyName}: how do you handle branded ads when nobody else is bidding on your brand?`;
}

function personaLine(input: CreateOutreachInput) {
  const role = input.contactRole.toLowerCase();
  const scaleHint = /\$|revenue|employees|enterprise|multi-market|monthly|spend/i.test(
    input.companyContext ?? "",
  )
    ? " At that scale, small changes in paid brand coverage can affect budget and reporting."
    : "";
  if (/cmo|chief/i.test(role)) {
    return `The tricky part is that branded campaigns can look efficient in reports because the buyer already wanted the brand, even when organic would have captured the click anyway.${scaleHint}`;
  }
  if (/growth|acquisition/i.test(role)) {
    return `The tricky part is that branded campaigns can look efficient in reports because the buyer already wanted the brand, even when organic would have captured the click anyway.${scaleHint}`;
  }
  if (/paid search|sem|performance/i.test(role)) {
    return `The practical question is not whether branded ads are useful. It is knowing when to keep them live, when to lower bids, and when organic can do the work.${scaleHint}`;
  }
  return `The tricky part is that branded campaigns can look efficient in reports because the buyer already wanted the brand, even when organic would have captured the click anyway.${scaleHint}`;
}

function humanizeProductFact(fact: string) {
  if (/solo|competitive|ghost|pause|reduce bids|brand.*only advertiser/i.test(fact)) {
    return "Signal can automatically pause or lower branded ads when paid coverage is not changing the outcome, then bring coverage back when competition returns.";
  }

  if (/paid.*organic|organic.*paid|serp|competitive/i.test(fact)) {
    return "Signal watches paid coverage, organic presence, and competitor activity so the team can decide when to pause, lower bids, or protect the top position.";
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
        ? "Signal helps teams compare branded ads with organic results and competitor activity before deciding whether to keep, lower, or pause paid coverage."
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
