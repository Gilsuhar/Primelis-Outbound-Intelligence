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
  return input.contactFirstName ? `Hi ${input.contactFirstName},` : "Hi,";
}

function ctaForStep(stepNumber: number, isFinal: boolean, channel: SequenceStep["channel"]) {
  if (isFinal) {
    return "If this is not relevant, I can close the loop here.";
  }
  if (channel === "LINKEDIN") {
    return stepNumber === 1 ? "Open to connecting?" : "Worth a quick exchange if this is relevant?";
  }
  return stepNumber === 1
    ? "Worth a short exchange to see if this is relevant?"
    : "Would it be useful to compare notes?";
}

function subjectFor(input: BuildSequenceInput, stepNumber: number, angleLabel: string) {
  const subjects = [
    `${input.companyName} and ${angleLabel}`,
    `Question on ${input.companyName}'s brand search`,
    `Methodology thought for ${input.companyName}`,
    `Following up on ${angleLabel}`,
    `Close the loop?`,
    `Last note on brand search`,
  ];
  return subjects[stepNumber - 1] ?? `Thought for ${input.companyName}`;
}

function connectionRequestFor(input: BuildSequenceInput) {
  return `Hi ${input.contactFirstName || "there"} - noticed a reason to compare brand-search methodology at ${input.companyName}. Open to connecting?`;
}

function bodyForPurpose({
  input,
  purpose,
  channel,
  primaryFact,
  secondaryFact,
  angleLabel,
}: {
  input: BuildSequenceInput;
  purpose: SequenceStep["purpose"];
  channel: SequenceStep["channel"];
  primaryFact: string;
  secondaryFact: string;
  angleLabel: string;
}) {
  const trigger = input.observedTrigger.trim();
  const persona = input.contactRole;
  const sharedCaution = "I am treating the account details as user-provided, not verified facts.";
  const linesByPurpose: Record<SequenceStep["purpose"], string[]> = {
    FIRST_TOUCH_RELEVANCE: [
      greeting(input),
      "",
      `Using only the user-provided trigger, ${trigger} made me think ${angleLabel} could be relevant for ${input.companyName}.`,
      primaryFact,
      `For a ${persona}, the practical question is whether the methodology gives enough confidence to act without over-assuming the account context.`,
    ],
    PROBLEM_FRAMING: [
      greeting(input),
      "",
      "The pattern I would frame is not simply more reporting; it is knowing where paid brand spend is actually helping and where it may be inefficient.",
      secondaryFact,
    ],
    METHODOLOGY_DIFFERENTIATION: [
      greeting(input),
      "",
      `One reason this may be worth a look is methodology: ${primaryFact}`,
      "I am not making a claim about any current vendor, just suggesting a comparison of approach.",
    ],
    ACCOUNT_SPECIFIC_OBSERVATION: [
      greeting(input),
      "",
      `${input.companyName} context I would use carefully: ${trigger}`,
      `${sharedCaution} That makes this a light hypothesis rather than a hard claim.`,
    ],
    SOCIAL_PROOF: [
      greeting(input),
      "",
      `There is approved customer evidence available for this channel, but I would use it only as supporting context rather than the whole pitch.`,
      secondaryFact,
    ],
    TECHNICAL_CLARIFICATION: [
      greeting(input),
      "",
      `A useful technical question may be how paid and organic brand-search signals are evaluated together before deciding what to change.`,
      secondaryFact,
    ],
    LOW_PRESSURE_FOLLOW_UP: [
      greeting(input),
      "",
      `I wanted to follow up without overloading the thread. The narrow question is whether ${angleLabel} is worth a quick comparison for ${input.companyName}.`,
    ],
    BREAKUP_CLOSE_LOOP: [
      greeting(input),
      "",
      `I will close the loop after this note. If ${angleLabel} is not relevant right now, no problem.`,
      "If it becomes a priority later, the useful starting point would be the methodology question rather than a generic platform overview.",
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
          input.primaryChannel === "MIXED"
            ? channel === "EMAIL"
              ? "Email carries the more complete thought without duplicating LinkedIn copy."
              : "LinkedIn keeps the touch lighter and different from the email copy."
            : `${channel === "EMAIL" ? "Email" : "LinkedIn"} is the selected primary channel.`,
        subjectLine: channel === "EMAIL" ? subjectFor(input, stepNumber, angleLabel) : undefined,
        connectionRequest:
          channel === "LINKEDIN" && stepNumber === 1 ? connectionRequestFor(input) : undefined,
        messageBody: bodyForPurpose({
          input,
          purpose,
          channel,
          primaryFact,
          secondaryFact: caseStudyFacts[0] ?? secondaryFact,
          angleLabel,
        }),
        cta,
        claimsUsed: [
          purpose === "SOCIAL_PROOF" ? (caseStudyFacts[0] ?? secondaryFact) : primaryFact,
        ],
        sourceIds,
      };
    });

    return {
      ...generation,
      steps,
      claimsUsed: Array.from(new Set(steps.flatMap((step) => step.claimsUsed))),
      overallStrategy: stripCommercialTerms(
        `Use ${purposeLabels[purposes[0]]} first, then vary the angle across methodology, account context, and a low-pressure close. Keep the sequence concise and anchored to ${angleLabel}.`,
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
