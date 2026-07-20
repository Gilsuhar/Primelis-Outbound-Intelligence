import {
  channelForStep,
  defaultPurposesForLength,
  labelForSequenceAngle,
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

import { createAiProvider, mapAiProviderError } from "./ai-provider";
import {
  displayCompanyName,
  winningPatternForPurpose,
} from "./winning-message-engine";

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

function displayCompany(input: BuildSequenceInput) {
  return displayCompanyName(input.companyName);
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

function ctaForPurpose(
  input: BuildSequenceInput,
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
      ? "Do you already track this?"
      : "Is this on your radar?";
  }
  const pattern = winningPatternForPurpose(input, purpose, stepNumber - 1);
  if (pattern.cta) {
    return pattern.cta;
  }
  const ctas: Record<SequenceStep["purpose"], string> = {
    FIRST_TOUCH_RELEVANCE: "Do you already have a way to detect that?",
    PROBLEM_FRAMING: "Do you have visibility into when this happens?",
    METHODOLOGY_DIFFERENTIATION: "Is this something your team already checks regularly?",
    ACCOUNT_SPECIFIC_OBSERVATION: "Would it be useful to check whether this is relevant at your scale?",
    SOCIAL_PROOF: "Want the short version of how another team approached this?",
    TECHNICAL_CLARIFICATION: "Would a two-point methodology view help?",
    LOW_PRESSURE_FOLLOW_UP: "Should I park this for later?",
    BREAKUP_CLOSE_LOOP: "If this is not relevant, I can close the loop here.",
  };
  return ctas[purpose];
}

function subjectFor(input: BuildSequenceInput, purpose: SequenceStep["purpose"], stepNumber: number) {
  const pattern = winningPatternForPurpose(input, purpose, stepNumber - 1);
  if (pattern.subject) {
    return pattern.subject;
  }
  const company = displayCompany(input);
  const subjects: Record<SequenceStep["purpose"], string> = {
    FIRST_TOUCH_RELEVANCE: `${company} branded ads question`,
    PROBLEM_FRAMING: `Re: deactivating branded ads`,
    METHODOLOGY_DIFFERENTIATION: `Re: lower branded CPC`,
    ACCOUNT_SPECIFIC_OBSERVATION: `${company}: one brand-search check`,
    SOCIAL_PROOF: `A practical paid-brand example`,
    TECHNICAL_CLARIFICATION: `Paid brand methodology`,
    LOW_PRESSURE_FOLLOW_UP: `Quick follow-up on ${company}`,
    BREAKUP_CLOSE_LOOP: `Closing the loop`,
  };
  return subjects[purpose] ?? `Thought for ${company} ${stepNumber}`;
}

function connectionRequestFor(input: BuildSequenceInput) {
  return `Hi ${input.contactFirstName || "there"} - had a quick paid-brand question for ${displayCompany(input)}. Open to connecting?`;
}

function humanizeFact(fact: string) {
  if (/solo|competitive|ghost|pause|reduce bids|brand.*only advertiser/i.test(fact)) {
    return "Signal helps teams spot those moments, lower or pause branded ads, and bring coverage back when the search page changes.";
  }
  if (/paid.*organic|organic.*paid|serp|google ads|search console|conversion-source|conversion performance|competitive/i.test(fact)) {
    return "Signal helps teams spot those moments, lower or pause branded ads, and bring coverage back when the search page changes.";
  }
  return fact;
}

function customerFacingAngle(angleLabel: string) {
  return angleLabel
    .replace(/methodology comparison/i, "paid and organic search")
    .replace(/market control and visibility/i, "brand-search visibility")
    .replace(/solo.*ghost/i, "paid brand coverage");
}

function roleAngle(input: BuildSequenceInput) {
  const role = input.contactRole.toLowerCase();
  if (/cmo|chief|vp|head|director/.test(role)) {
    return "For a marketing leader, I would frame this as budget control and visibility, not a bid tweak.";
  }
  if (/growth|acquisition|demand/.test(role)) {
    return "For growth, the sharper question is whether paid brand improves acquisition efficiency or just re-buys existing demand.";
  }
  if (/paid search|sem|ppc|performance/.test(role)) {
    return "For paid search, the practical decision is when to stay covered, when to lower bids, and when organic is already enough.";
  }
  if (/ecommerce|e-commerce|digital/.test(role)) {
    return "For digital commerce, the useful angle is protecting high-intent brand demand without paying for clicks the site would get anyway.";
  }
  return "The practical question is where paid brand is still changing the outcome.";
}

function toneLine(input: BuildSequenceInput, purpose: SequenceStep["purpose"]) {
  if (input.desiredTone === "DIRECT") {
    return purpose === "BREAKUP_CLOSE_LOOP"
      ? "I will keep this simple and close the loop here."
      : "The short version: this is about avoiding paid clicks that organic would have won anyway.";
  }
  if (input.desiredTone === "EXECUTIVE") {
    return "The executive version is simple: know when brand spend is protecting revenue, and when it is only adding cost.";
  }
  if (input.desiredTone === "WARM") {
    return "Not assuming this is a problem on your side, but it is often a useful check for brand-heavy search programs.";
  }
  return "";
}

function tailorBody(input: BuildSequenceInput, purpose: SequenceStep["purpose"], body: string) {
  const blocks = body.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const hello = blocks[0]?.startsWith("Hi ") ? blocks[0] : greeting(input);
  const content = blocks[0]?.startsWith("Hi ") ? blocks.slice(1) : blocks;
  const roleSpecific = roleAngle(input);
  const toneSpecific = toneLine(input, purpose);

  if (input.desiredTone === "DIRECT") {
    return stripCommercialTerms(
      [hello, content[0], toneSpecific || roleSpecific, content.at(-1)]
        .filter(Boolean)
        .join("\n\n"),
    );
  }

  if (input.desiredTone === "EXECUTIVE") {
    return stripCommercialTerms(
      [hello, content[0], toneSpecific, roleSpecific, content.at(-1)]
        .filter(Boolean)
        .join("\n\n"),
    );
  }

  if (input.desiredTone === "WARM") {
    return stripCommercialTerms(
      [hello, toneSpecific, ...content.slice(0, 2), content.at(-1)]
        .filter(Boolean)
        .join("\n\n"),
    );
  }

  return stripCommercialTerms(
    [hello, content[0], roleSpecific, ...content.slice(1)].filter(Boolean).join("\n\n"),
  );
}

function bodyForPurpose({
  input,
  purpose,
  channel,
  secondaryFact,
  ctaIndex,
}: {
  input: BuildSequenceInput;
  purpose: SequenceStep["purpose"];
  channel: SequenceStep["channel"];
  secondaryFact: string;
  ctaIndex: number;
}) {
  const trigger = input.observedTrigger.trim();
  const company = displayCompany(input);
  const simpleSecondaryFact = humanizeFact(secondaryFact);
  const pattern = winningPatternForPurpose(input, purpose, ctaIndex);
  const patternBody = pattern.body;
  if (patternBody && purpose !== "SOCIAL_PROOF") {
    if (channel === "LINKEDIN") {
      return stripCommercialTerms(
        tailorBody(input, purpose, patternBody)
          .replace(greeting(input), input.contactFirstName ? `${input.contactFirstName},` : "")
          .replace(/\n\n/g, " ")
          .replace(/\n/g, " ")
          .trim(),
      );
    }
    return tailorBody(input, purpose, patternBody);
  }

  const linesByPurpose: Record<SequenceStep["purpose"], string[]> = {
    FIRST_TOUCH_RELEVANCE: [
      greeting(input),
      "",
      `Quick question on ${company} brand search: how do you decide when branded ads should stay live, and when organic would have captured the click anyway?`,
      "Signal helps teams monitor search results and adjust branded coverage when other advertisers are not bidding, instead of paying for clicks that may not add value.",
    ],
    PROBLEM_FRAMING: [
      greeting(input),
      "",
      "For context, Google does not offer an easy way to automatically pause or adjust branded ads when no other advertisers are bidding.",
      "As a result, many teams keep paying for clicks that could have been captured organically or at a much lower CPC.",
      `That is the gap I would check at ${company}: can you see when this happens, and act on it without a manual review?`,
    ],
    METHODOLOGY_DIFFERENTIATION: [
      greeting(input),
      "",
      "One other angle: this is not always about turning brand ads off.",
      "In some cases, the better move is lowering the bid to the minimum needed to stay covered, especially when the search page is quiet and nobody is pushing CPC up.",
      "That is where Signal can help: keep coverage where it matters, avoid overpaying where it does not.",
    ],
    ACCOUNT_SPECIFIC_OBSERVATION: [
      greeting(input),
      "",
      `The only assumption I would make about ${company} is a light one: ${cleanSelection(trigger) ?? trigger}.`,
      "I would not pitch that as proof. I would use it as a reason to check whether paid brand is still doing work organic cannot do.",
    ],
    SOCIAL_PROOF: [
      greeting(input),
      "",
      "One reason this tends to land: it is not a generic cost-cutting conversation.",
      simpleSecondaryFact,
      "The practical takeaway is to keep coverage where it protects demand, and stop overpaying where organic is already doing the work.",
    ],
    TECHNICAL_CLARIFICATION: [
      greeting(input),
      "",
      "The methodology question is straightforward: before lowering or pausing anything, check paid ads, organic results, and search-page conditions together.",
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
      "If branded-search efficiency becomes a priority later, the useful starting point is straightforward: where is paid coverage protecting demand, and where is it only adding cost?",
    ],
  };

  const body = tailorBody(input, purpose, linesByPurpose[purpose].join("\n"));
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
      const cta = ctaForPurpose(input, purpose, stepNumber, isFinal, channel);
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
          ctaIndex: index,
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
        `Use reply-backed patterns from the winning-message library: direct first-touch question, Google automation gap, method or lower-CPC angle, then a low-pressure close. Keep the sequence concise and anchored to ${emailAngle}.`,
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
          currentDraft: result.steps
            .map((step) =>
              [
                `Step ${step.stepNumber} (${step.channel}, ${step.delay}, ${step.purpose})`,
                step.subjectLine ? `Subject: ${step.subjectLine}` : undefined,
                step.connectionRequest ? `Connection request: ${step.connectionRequest}` : undefined,
                step.messageBody,
                `CTA: ${step.cta}`,
              ]
                .filter(Boolean)
                .join("\n"),
            )
            .join("\n\n---\n\n"),
          context: {
            brief: {
              companyName: request.input.companyName,
              companyWebsite: request.input.companyWebsite,
              contactFirstName: request.input.contactFirstName,
              contactRole: request.input.contactRole,
              industry: request.input.industry,
              companyContext: request.input.companyContext,
              geographyOrMarkets: request.input.geographyOrMarkets,
              paidSearchContext: request.input.paidSearchContext,
              currentVendor: request.input.currentVendor,
              observedTrigger: request.input.observedTrigger,
              primaryChannel: request.input.primaryChannel,
              sequenceLength: request.input.sequenceLength,
              desiredTone: request.input.desiredTone,
              desiredOverallDuration: request.input.desiredOverallDuration,
              selectedAngle: result.selectedAngle,
            },
            writingInstructions: [
              "Rewrite every step as a sendable outbound sequence.",
              "Return sequenceSteps with exactly the same number of steps and the same order as currentDraft.",
              "Each email body should be 55-100 words. Each LinkedIn body should be 25-55 words.",
              "Each step must add a new reason, not repeat the same brand-search question.",
              "The selected buyer role must change the copy: Paid Search gets operational bid/control language, Growth gets CAC/acquisition efficiency, CMO/VP gets budget visibility and business outcome language.",
              "The selected tone must visibly change the copy: DIRECT is shorter and plainer, WARM is softer and less assumptive, EXECUTIVE removes tactical detail and emphasizes business control.",
              "Do not reuse the same opening structure across steps. Avoid starting every step with 'When', 'For context', or 'A useful way'.",
              "Step 1: sharp account-relevant opener. Step 2: problem/gap. Step 3: method or useful contrast. Later steps: proof or low-pressure close.",
              "Do not use fluffy phrases like checking in, wanted to follow up, hope you are well, thought this might be relevant, or I had the company on my list.",
              "Do not invent verified facts about the company. Convert unverified inputs into cautious questions.",
              "Keep one soft CTA per step.",
            ],
            approvedFacts: request.records.map((record) => record.approvedText).slice(0, 10),
            sourceReferences: request.sourceReferences,
            safetyPolicy: result.safetyNotes,
            outputLanguageInstruction: outputLanguageInstruction(request.input.outputLanguage ?? "ENGLISH"),
          },
        });
        const aiSteps =
          aiResult.sequenceSteps?.length === result.steps.length
            ? result.steps.map((step, index) => {
                const aiStep = aiResult.sequenceSteps?.[index];
                if (!aiStep) {
                  return step;
                }
                return {
                  ...step,
                  subjectLine:
                    step.channel === "EMAIL"
                      ? stripCommercialTerms(aiStep.subjectLine ?? step.subjectLine ?? "")
                      : undefined,
                  connectionRequest:
                    step.channel === "LINKEDIN" && step.stepNumber === 1
                      ? stripCommercialTerms(aiStep.connectionRequest ?? step.connectionRequest ?? "")
                      : step.connectionRequest,
                  messageBody: stripCommercialTerms(aiStep.messageBody),
                  cta: stripCommercialTerms(aiStep.cta),
                };
              })
            : result.steps;
        return {
          ...result,
          steps: aiSteps,
          claimsUsed: aiResult.factualClaimsUsed.length
            ? aiResult.factualClaimsUsed
            : result.claimsUsed,
          overallStrategy: aiResult.changeSummary ?? result.overallStrategy,
          safetyNotes: [...result.safetyNotes, ...aiResult.uncertaintyNotes],
        };
      } catch (error) {
        const failure = mapAiProviderError(error);
        return {
          ...result,
          safetyNotes: [
            ...result.safetyNotes,
            `${failure.message} Deterministic fallback was used.`,
          ],
        };
      }
    },
  };
}
