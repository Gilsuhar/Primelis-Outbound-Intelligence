import {
  channelForStep,
  defaultPurposesForLength,
  labelForSequenceAngle,
  purposeLabels,
} from "@/features/build-sequence/sequence-policy";
import type {
  BuildSequenceInput,
  SequenceGeneration,
  SequenceKnowledgeRecord,
  SequencePurpose,
  SequenceSourceReference,
  SequenceStep,
} from "@/features/build-sequence/types";
import type { ReplyProviderMetadata } from "@/features/reply-to-prospect/types";
import { outputLanguageInstruction } from "@/lib/output-language";

import { createAiProvider } from "./ai-provider";

export type BuildSequenceProviderRequest = {
  input: BuildSequenceInput;
  records: SequenceKnowledgeRecord[];
  sourceReferences: SequenceSourceReference[];
  generation: Omit<SequenceGeneration, "steps" | "claimsUsed">;
};

export interface BuildSequenceAiProvider {
  metadata: ReplyProviderMetadata;
  generate(request: BuildSequenceProviderRequest): Promise<SequenceGeneration>;
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

function greeting(input: BuildSequenceInput) {
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

function openingFor(input: BuildSequenceInput) {
  const trigger = cleanSelection(input.observedTrigger);
  const company = input.companyName;

  if (!trigger) {
    return `I had ${company} on my list and wanted to sanity-check one brand-search question.`;
  }
  if (/validate branded-search activity|confirm branded-search activity/i.test(trigger)) {
    return `I had ${company} on my list and wanted to sanity-check one brand-search question.`;
  }
  if (/competitors/i.test(trigger)) {
    return `I noticed a possible paid-brand question at ${company}.`;
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

function ctaForStep(stepNumber: number, isFinal: boolean, channel: SequenceStep["channel"]) {
  if (isFinal) {
    return "If this is not relevant, I can close the loop here.";
  }
  if (channel === "LINKEDIN") {
    return stepNumber === 1 ? "Open to connecting?" : "Worth comparing notes?";
  }
  return stepNumber === 1
    ? "Worth a quick compare against how you decide this today?"
    : "Worth comparing notes?";
}

function subjectFor(input: BuildSequenceInput, stepNumber: number) {
  const subjects = [
    `${input.companyName} paid brand question`,
    `Paid brand vs organic at ${input.companyName}`,
    `A practical brand-search check`,
    `Closing the loop`,
    `Close the loop?`,
    `Last note on brand search`,
  ];
  return subjects[stepNumber - 1] ?? `Thought for ${input.companyName}`;
}

function connectionRequestFor(input: BuildSequenceInput) {
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

function accountContextLine(input: BuildSequenceInput) {
  const industryHint = (() => {
    if (!input.industry) {
      return undefined;
    }
    if (/fashion|luxury|retail|e-commerce/i.test(input.industry)) {
      return "brand demand and paid search often sit close to revenue";
    }
    if (/saas|technology|fintech|subscription/i.test(input.industry)) {
      return "paid brand decisions can affect acquisition efficiency";
    }
    return "the paid brand question may be worth validating";
  })();
  const details = [
    industryHint,
    fitSignalForEmail(input.companyContext),
    input.geographyOrMarkets ? `${input.geographyOrMarkets} market context` : undefined,
  ].filter(Boolean);

  if (details.length === 0) {
    return "";
  }

  return `I had ${input.companyName} on my list because brand search can look safe from the outside, while the real question is where paid coverage is still adding value.`;
}

function personaPainLine(input: BuildSequenceInput) {
  const role = input.contactRole.toLowerCase();
  const scaleHint = /\$|revenue|employees|enterprise|multi-market|monthly|spend/i.test(
    input.companyContext ?? "",
  )
    ? " At that scale, small changes in paid brand coverage can affect budget and reporting."
    : "";
  if (/growth|acquisition/i.test(role)) {
    return `The practical question is whether paid brand is helping acquisition efficiency, or whether part of that budget is buying clicks organic would have captured anyway.${scaleHint}`;
  }
  if (/cmo|chief/i.test(role)) {
    return `The hard part is visibility: where paid coverage protects demand, and where it may be spending on demand the brand would capture anyway.${scaleHint}`;
  }
  return `The practical question is not whether to run brand search. It is where paid coverage protects demand, and where organic results can carry more of the outcome.${scaleHint}`;
}

function humanizeFact(fact: string) {
  if (/solo|competitive|ghost|pause|reduce bids|brand.*only advertiser/i.test(fact)) {
    return "Signal helps compare paid coverage with organic results and search-page changes, so the team can decide where brand spend is still useful and where it may be waste.";
  }
  if (/paid.*organic|organic.*paid|serp|google ads|search console|conversion-source|conversion performance|competitive/i.test(fact)) {
    return "Signal helps compare paid coverage with organic results and search-page changes, so the team can decide where brand spend is still useful and where it may be waste.";
  }
  return fact;
}

function customerFacingAngle(angleLabel: string) {
  return angleLabel
    .replace(/methodology comparison/i, "paid and organic search")
    .replace(/market control and visibility/i, "brand-search visibility")
    .replace(/solo.*ghost/i, "paid brand coverage");
}

function bodyForPurpose({
  input,
  purpose,
  channel,
  primaryFact,
  secondaryFact,
}: {
  input: BuildSequenceInput;
  purpose: SequenceStep["purpose"];
  channel: SequenceStep["channel"];
  primaryFact: string;
  secondaryFact: string;
}) {
  const trigger = input.observedTrigger.trim();
  const opening = openingFor(input);
  const context = accountContextLine(input);
  const simplePrimaryFact = humanizeFact(primaryFact);
  const simpleSecondaryFact = humanizeFact(secondaryFact);
  const linesByPurpose: Record<SequenceStep["purpose"], string[]> = {
    FIRST_TOUCH_RELEVANCE: [
      greeting(input),
      "",
      context || opening,
      personaPainLine(input),
      simplePrimaryFact,
    ],
    PROBLEM_FRAMING: [
      greeting(input),
      "",
      "The awkward part with brand search is that performance can look strong even when some paid clicks may not be adding much.",
      "The harder question is where paid coverage is protecting demand, and where organic results would have captured part of the demand anyway.",
      simpleSecondaryFact,
    ],
    METHODOLOGY_DIFFERENTIATION: [
      greeting(input),
      "",
      "The comparison I would suggest is practical: what happens across paid coverage, organic results, and the search page before changing spend.",
      "That gives the team a cleaner way to decide where coverage is needed and where budget may be doing less work.",
    ],
    ACCOUNT_SPECIFIC_OBSERVATION: [
      greeting(input),
      "",
      `${input.companyName} context I would use carefully: ${cleanSelection(trigger) ?? trigger}`,
      "I would treat that as a light hypothesis, not a claim. The useful next step is simply to validate whether paid brand is still doing work organic cannot do.",
    ],
    SOCIAL_PROOF: [
      greeting(input),
      "",
      `There is approved customer evidence available for this channel, but I would use it only as supporting context rather than the whole pitch.`,
      simpleSecondaryFact,
    ],
    TECHNICAL_CLARIFICATION: [
      greeting(input),
      "",
      `A useful question may be how the team compares paid brand ads with organic results before deciding what to change.`,
      simpleSecondaryFact,
    ],
    LOW_PRESSURE_FOLLOW_UP: [
      greeting(input),
      "",
      `Wanted to keep this narrow. If paid brand efficiency is on the radar at ${input.companyName}, it may be worth a quick check.`,
    ],
    BREAKUP_CLOSE_LOOP: [
      greeting(input),
      "",
      "I will close the loop after this note.",
      "If paid brand efficiency becomes a priority later, the useful starting point is a quick look at where paid coverage is helping and where organic already does enough.",
    ],
  };

  const body = linesByPurpose[purpose].join("\n");
  if (channel === "LINKEDIN") {
    return stripCommercialTerms(
      body
        .replace(greeting(input), input.contactFirstName ? `${input.contactFirstName},` : "")
        .replace(/\n\n/g, " ")
        .replace(/\n/g, " ")
        .trim(),
    );
  }
  return stripCommercialTerms(body);
}

function delayFor(stepNumber: number, length: number, desiredOverallDuration: string) {
  if (stepNumber === 1) {
    return "Day 0";
  }
  if (stepNumber === length) {
    return desiredOverallDuration.trim()
      ? `Final touch within ${desiredOverallDuration}`
      : "Day 14";
  }
  return `Day ${(stepNumber - 1) * 3}`;
}

export class DeterministicBuildSequenceProvider implements BuildSequenceAiProvider {
  metadata: ReplyProviderMetadata = {
    providerName: "deterministic-development",
    modelName: "local-sequence-template-v1",
    deterministic: true,
  };

  async generate({
    input,
    records,
    generation,
  }: BuildSequenceProviderRequest): Promise<SequenceGeneration> {
    const angleLabel = labelForSequenceAngle(generation.selectedAngle);
    const emailAngle = customerFacingAngle(angleLabel);
    const productFacts = records
      .filter((record) => record.type === "PRODUCT_TRUTH")
      .map((record) => stripCommercialTerms(record.approvedText));
    const caseStudyFacts = records
      .filter((record) => record.type === "CASE_STUDY")
      .map((record) => stripCommercialTerms(record.approvedText));
    const primaryFact = productFacts[0]
      ? trimSentences(productFacts[0], 1)
      : "I do not have enough approved Signal knowledge to make a specific factual claim.";
    const secondaryFact = productFacts[1] ? trimSentences(productFacts[1], 1) : primaryFact;
    const purposes: SequencePurpose[] = defaultPurposesForLength(
      input.sequenceLength,
      caseStudyFacts.length > 0,
    );
    const sourceIds = Array.from(new Set(records.flatMap((record) => record.sourceIds)));

    const steps = purposes.map((purpose, index): SequenceStep => {
      const stepNumber = index + 1;
      const channel = channelForStep(input.primaryChannel, index);
      const isFinal = stepNumber === input.sequenceLength;
      const cta = ctaForStep(stepNumber, isFinal, channel);
      return {
        stepNumber,
        channel,
        delay: delayFor(stepNumber, input.sequenceLength, input.desiredOverallDuration),
        purpose,
        channelRationale:
          (input.primaryChannel === "MIXED"
            ? channel === "EMAIL"
              ? "Email carries the more complete thought without duplicating LinkedIn copy."
              : "LinkedIn keeps the touch lighter and different from the email copy."
            : `${channel === "EMAIL" ? "Email" : "LinkedIn"} is the selected primary channel.`) +
          " Account context is user-provided until verified.",
        subjectLine: channel === "EMAIL" ? subjectFor(input, stepNumber) : undefined,
        connectionRequest:
          channel === "LINKEDIN" && stepNumber === 1 ? connectionRequestFor(input) : undefined,
        messageBody: bodyForPurpose({
          input,
          purpose,
          channel,
          primaryFact,
          secondaryFact: caseStudyFacts[0] ?? secondaryFact,
        }),
        cta,
        claimsUsed: [
          purpose === "SOCIAL_PROOF"
            ? humanizeFact(caseStudyFacts[0] ?? secondaryFact)
            : humanizeFact(primaryFact),
        ],
        sourceIds,
      };
    });

    return {
      ...generation,
      steps,
      claimsUsed: Array.from(new Set(steps.flatMap((step) => step.claimsUsed))),
      overallStrategy: stripCommercialTerms(
        `Use ${purposeLabels[purposes[0]]} first, then vary the angle across account relevance, paid and organic search, and a low-pressure close. Keep the sequence concise and anchored to ${emailAngle}.`,
      ),
    };
  }
}

export function createBuildSequenceAiProvider(
  env: NodeJS.ProcessEnv = process.env,
): BuildSequenceAiProvider {
  if (env.AI_PROVIDER !== "openai") {
    return new DeterministicBuildSequenceProvider();
  }

  return {
    metadata: {
      providerName: "openai",
      modelName: env.OPENAI_MODEL ?? "not-configured",
      deterministic: false,
    },
    async generate(request) {
      const fallback = new DeterministicBuildSequenceProvider();
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
          workflow: "BUILD_SEQUENCE",
          currentDraft: result.steps.map((step) => step.messageBody).join("\n\n"),
          context: {
            approvedFacts: request.records.map((record) => record.approvedText).slice(0, 10),
            sourceReferences: request.sourceReferences,
            safetyPolicy: result.safetyNotes,
            outputLanguageInstruction: outputLanguageInstruction(request.input.outputLanguage ?? "ENGLISH"),
          },
        });
        return {
          ...result,
          overallStrategy: aiResult.changeSummary ?? result.overallStrategy,
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
