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

function ctaForPurpose(
  purpose: SequenceStep["purpose"],
  stepNumber: number,
  isFinal: boolean,
  channel: SequenceStep["channel"],
) {
  if (isFinal) {
    return "If this is not relevant, I can close the loop here.";
  }
  if (channel === "LINKEDIN") {
    if (stepNumber === 1) {
      return "Open to connecting?";
    }
    return purpose === "METHODOLOGY_DIFFERENTIATION"
      ? "Worth pressure-testing the approach?"
      : "Worth comparing notes?";
  }
  const ctas: Record<SequenceStep["purpose"], string> = {
    FIRST_TOUCH_RELEVANCE: "Worth a quick compare against how you decide this today?",
    PROBLEM_FRAMING: "Is this something your team is already trying to separate?",
    METHODOLOGY_DIFFERENTIATION: "Worth pressure-testing your current method against this?",
    ACCOUNT_SPECIFIC_OBSERVATION: "Would it be useful to check whether this is relevant at your scale?",
    SOCIAL_PROOF: "Want the short version of how another team approached this?",
    TECHNICAL_CLARIFICATION: "Would a two-point methodology view help?",
    LOW_PRESSURE_FOLLOW_UP: "Worth revisiting later if this is on the roadmap?",
    BREAKUP_CLOSE_LOOP: "If this is not relevant, I can close the loop here.",
  };
  return ctas[purpose];
}

function subjectFor(input: BuildSequenceInput, purpose: SequenceStep["purpose"], stepNumber: number) {
  const company = input.companyName;
  const subjects: Record<SequenceStep["purpose"], string> = {
    FIRST_TOUCH_RELEVANCE: `${company} paid brand question`,
    PROBLEM_FRAMING: `When paid brand looks too good`,
    METHODOLOGY_DIFFERENTIATION: `A cleaner brand-search test`,
    ACCOUNT_SPECIFIC_OBSERVATION: `${company}: one brand-search check`,
    SOCIAL_PROOF: `A practical paid-brand example`,
    TECHNICAL_CLARIFICATION: `Paid brand methodology`,
    LOW_PRESSURE_FOLLOW_UP: `Quick follow-up on ${company}`,
    BREAKUP_CLOSE_LOOP: `Closing the loop`,
  };
  return subjects[purpose] ?? `Thought for ${company} ${stepNumber}`;
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

function roleFriendlyPhrase(input: BuildSequenceInput) {
  const role = input.contactRole.toLowerCase();
  if (/paid search|sem|ppc/.test(role)) {
    return "for a paid-search team";
  }
  if (/performance|growth|acquisition/.test(role)) {
    return "for a performance team";
  }
  if (/cmo|chief|vp marketing/.test(role)) {
    return "for a marketing leader";
  }
  if (/e-?commerce|digital/.test(role)) {
    return "for an e-commerce team";
  }
  return "for the team owning brand search";
}

function simpleAccountReason(input: BuildSequenceInput) {
  const company = input.companyName;
  const context = cleanSelection(input.companyContext ?? "") ?? "";
  const industry = input.industry ?? "";
  const paidContext = input.paidSearchContext ?? "";
  if (/brand demand|paid-search owner/i.test(context)) {
    return `I had ${company} on my list because it looks like the kind of account where brand search is worth checking, not assuming.`;
  }
  if (/\$|revenue|employees|enterprise|multi-market/i.test(context)) {
    return `I had ${company} on my list because larger brand accounts can lose budget in small paid-brand decisions.`;
  }
  if (/runs branded-search ads|active/i.test(paidContext)) {
    return `I had ${company} on my list because active brand search is usually worth reviewing with paid and organic together.`;
  }
  if (/fashion|luxury|retail|e-commerce/i.test(industry)) {
    return `I had ${company} on my list because brand demand can make paid-search results look stronger than the real incremental value.`;
  }
  return `I had ${company} on my list for a quick brand-search fit check.`;
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
  secondaryFact,
}: {
  input: BuildSequenceInput;
  purpose: SequenceStep["purpose"];
  channel: SequenceStep["channel"];
  secondaryFact: string;
}) {
  const trigger = input.observedTrigger.trim();
  const opening = openingFor(input);
  const context = accountContextLine(input);
  const accountReason = simpleAccountReason(input);
  const rolePhrase = roleFriendlyPhrase(input);
  const simpleSecondaryFact = humanizeFact(secondaryFact);
  const linesByPurpose: Record<SequenceStep["purpose"], string[]> = {
    FIRST_TOUCH_RELEVANCE: [
      greeting(input),
      "",
      accountReason || context || opening,
      "The question is not whether branded search is good or bad. It is which paid clicks still change the outcome.",
      "Signal helps compare paid ads, organic results, and search-page changes before deciding where spend is still useful.",
    ],
    PROBLEM_FRAMING: [
      greeting(input),
      "",
      "The tricky part is that brand campaigns often look efficient in reports because the customer was already searching for the brand.",
      `That makes the real decision ${rolePhrase}: protect the coverage that matters, and stop paying for demand organic would likely capture anyway.`,
      "That is the gap Signal is meant to make easier to see.",
    ],
    METHODOLOGY_DIFFERENTIATION: [
      greeting(input),
      "",
      "A simple way to test this is to look at three things together: paid coverage, organic visibility, and who else is showing up on the search page.",
      "If paid coverage is protecting demand, keep it. If organic is already carrying the result, reduce the waste. If competitors appear, protect the position.",
    ],
    ACCOUNT_SPECIFIC_OBSERVATION: [
      greeting(input),
      "",
      `The only assumption I would make about ${input.companyName} is a light one: ${cleanSelection(trigger) ?? trigger}.`,
      "I would not pitch that as proof. I would use it as a reason to check whether paid brand is still doing work organic cannot do.",
    ],
    SOCIAL_PROOF: [
      greeting(input),
      "",
      "There is customer evidence behind this, but I would keep it as context rather than making it the whole pitch.",
      simpleSecondaryFact,
      "The practical takeaway is the same: separate useful paid coverage from spend that is no longer changing the outcome.",
    ],
    TECHNICAL_CLARIFICATION: [
      greeting(input),
      "",
      "The methodology question is straightforward: before lowering or pausing anything, compare paid ads with organic results and search-page conditions.",
      "That keeps the conversation away from generic cost-cutting and focused on where paid coverage is actually needed.",
    ],
    LOW_PRESSURE_FOLLOW_UP: [
      greeting(input),
      "",
      `Wanted to keep this narrow. If paid-brand efficiency is on the radar at ${input.companyName}, it may be worth a quick check.`,
      "If it is not a current priority, no problem.",
    ],
    BREAKUP_CLOSE_LOOP: [
      greeting(input),
      "",
      "I will close the loop after this note.",
      "If paid-brand efficiency becomes a priority later, the useful starting point is simple: where is paid coverage protecting demand, and where is it just adding cost?",
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
      const cta = ctaForPurpose(purpose, stepNumber, isFinal, channel);
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
        subjectLine: channel === "EMAIL" ? subjectFor(input, purpose, stepNumber) : undefined,
        connectionRequest:
          channel === "LINKEDIN" && stepNumber === 1 ? connectionRequestFor(input) : undefined,
        messageBody: bodyForPurpose({
          input,
          purpose,
          channel,
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
