import type {
  CreateOutreachInput,
  OutreachGeneration,
  OutreachKnowledgeRecord,
  OutreachSourceReference,
} from "@/features/create-outreach/types";
import type { ReplyProviderMetadata } from "@/features/reply-to-prospect/types";
import { outputLanguageInstruction } from "@/lib/output-language";

import { createAiProvider } from "./ai-provider";
import {
  compactEmail,
  displayCompanyName,
  linkedinPattern,
  winningPatternForPurpose,
} from "./winning-message-engine";

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
    .replace(/^Strong fit\s*—\s*/i, "")
    .replace(/^Potential fit\s*—\s*/i, "")
    .replace(/^Enterprise\s*—\s*/i, "")
    .replace(/^Core ICP:\s*/i, "")
    .replace(/^Quick discovery:\s*/i, "")
    .trim();
}

const companyForCopy = displayCompanyName;

function triggerPhrase(input: CreateOutreachInput) {
  const trigger = cleanSelection(input.observedTrigger);
  const company = companyForCopy(input.companyName);

  if (!trigger) {
    return `Quick question on ${company}: how do you handle branded ads when nobody else is bidding?`;
  }
  if (/validate branded-search activity|confirm branded-search activity/i.test(trigger)) {
    return `Quick question on ${company}: how do you handle branded ads when nobody else is bidding?`;
  }
  if (/competitors/i.test(trigger)) {
    return `I noticed a paid-brand question at ${company}: what happens when nobody else is bidding?`;
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
  const pattern = winningPatternForPurpose(input, "FIRST_TOUCH_RELEVANCE");
  if (pattern.cta) {
    return pattern.cta;
  }
  const company = companyForCopy(input.companyName);
  if (input.channel === "LINKEDIN") {
    return "Do you already have a way to do that?";
  }
  if (input.desiredTone === "DIRECT") {
    return "Do you already track this today?";
  }
  if (input.desiredTone === "WARM") {
    return `Is this something your team looks at today?`;
  }
  if (input.desiredTone === "EXECUTIVE") {
    return `Is reducing wasted branded spend on the radar at ${company}?`;
  }
  return `Curious how you currently evaluate this at ${company}?`;
}

function subjectLinesFor(input: CreateOutreachInput) {
  const company = companyForCopy(input.companyName);
  const role = input.contactRole.toLowerCase();
  const firstTouch = winningPatternForPurpose(input, "FIRST_TOUCH_RELEVANCE");
  const context = winningPatternForPurpose(input, "PROBLEM_FRAMING", 1);
  const method = winningPatternForPurpose(input, "METHODOLOGY_DIFFERENTIATION", 2);
  if (/growth|acquisition/i.test(role)) {
    return [
      firstTouch.subject,
      `${company} brand search and acquisition efficiency`,
      context.subject,
    ];
  }
  if (/cmo|chief/i.test(role)) {
    return [
      firstTouch.subject,
      `${company} brand-search visibility`,
      method.subject,
    ];
  }
  return [
    firstTouch.subject,
    `When nobody is bidding on ${company}`,
    context.subject,
  ];
}

function connectionRequestFor(input: CreateOutreachInput) {
  return `Hi ${input.contactFirstName || "there"} - had a quick paid-brand question for ${companyForCopy(input.companyName)}. Open to connecting?`;
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
  const company = companyForCopy(input.companyName);
  const details = contextDetails(input);
  if (details.length === 0) {
    return `I had ${company} on my list because branded search can look efficient while still hiding unnecessary spend.`;
  }

  if (details.some((detail) => /brand demand|paid-search|brand-search|spend/i.test(String(detail)))) {
    return `I had ${company} on my list because branded search can look efficient while still hiding unnecessary spend.`;
  }

  return `I had ${company} on my list because branded search can look efficient while still hiding unnecessary spend.`;
}

function personaLine(input: CreateOutreachInput) {
  const role = input.contactRole.toLowerCase();
  const scaleHint = /\$|revenue|employees|enterprise|multi-market|monthly|spend/i.test(
    input.companyContext ?? "",
  )
    ? " At that scale, small changes in paid brand coverage can affect budget and reporting."
    : "";
  if (/cmo|chief/i.test(role)) {
    return `The question is whether paid coverage is still creating incremental value, or whether part of that demand would have been captured organically.${scaleHint}`;
  }
  if (/growth|acquisition/i.test(role)) {
    return `The question is whether paid coverage is still creating incremental value, or whether part of that demand would have been captured organically.${scaleHint}`;
  }
  if (/paid search|sem|performance/i.test(role)) {
    return `The question is whether paid coverage is still creating incremental value, or whether part of that demand would have been captured organically.${scaleHint}`;
  }
  return `The question is whether paid coverage is still creating incremental value, or whether part of that demand would have been captured organically.${scaleHint}`;
}

function humanizeProductFact(fact: string) {
  if (/solo|competitive|ghost|pause|reduce bids|brand.*only advertiser/i.test(fact)) {
    return "Signal helps teams spot those moments, lower or pause branded ads, and bring coverage back when the search page changes.";
  }

  if (/paid.*organic|organic.*paid|serp|competitive/i.test(fact)) {
    return "Signal helps teams spot those moments, lower or pause branded ads, and bring coverage back when the search page changes.";
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
    const firstTouchPattern = winningPatternForPurpose(input, "FIRST_TOUCH_RELEVANCE");
    const methodologyPattern = winningPatternForPurpose(input, "METHODOLOGY_DIFFERENTIATION", 1);
    const cta = firstTouchPattern.cta || ctaFor(input);
    const opening = triggerPhrase(input);
    const factLine =
      primaryFact === "I do not have enough approved Signal knowledge to make a specific factual claim."
        ? firstTouchPattern.body.split("\n").filter(Boolean).at(-1) ??
          "Signal compares paid coverage with organic visibility and live search-page activity, helping teams identify when branded ads are protecting demand and when bids can safely come down."
        : humanizeProductFact(primaryFact);
    const proofLine = caseStudyLine(records);
    const patternParagraphs = firstTouchPattern.body.split(/\n{2,}/).filter(Boolean);
    const context = patternParagraphs[1] ?? contextLine(input);
    const roleLine = patternParagraphs[2] ?? personaLine(input);
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
            linkedinPattern(input),
            input.desiredLength === "DETAILED" ? methodologyPattern.body.replace(/\n+/g, " ") : "",
          ].join(" ");

    const shorter =
      input.channel === "EMAIL"
        ? compactEmail(firstTouchPattern, input)
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
