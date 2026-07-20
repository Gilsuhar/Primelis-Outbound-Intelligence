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
  return text
    .replace(
      /\b(pricing|price|poc|proof of concept|trial|discount|guarantee|guaranteed)\b/gi,
      "commercial details",
    )
    .replace(/\bversus\b/gi, "and")
    .replace(/\bbetter than\b/gi, "different from")
    .replace(/\bbeats\b/gi, "differs from")
    .replace(/\b(adthena|revvim|auction insights)\b/gi, "current tools");
}

function stripFallbackPhrases(text: string) {
  return text
    .replace(/Quick question on ([^:]+):/gi, "One narrow paid-brand question for $1:")
    .replace(/^For context,\s*/gim, "")
    .replace(/A useful way to look at this is/gi, "The practical read is")
    .replace(/I will close the loop here\.\s*/gi, "")
    .replace(/If this is not relevant, I can close the loop here\./gi, "If timing is wrong, no need to reply.");
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
  if (/paid search|sem|ppc|performance/.test(role)) {
    return "For paid search, the practical decision is when to stay covered, when to lower bids, and when organic is already enough.";
  }
  if (/cmo|chief|vp|head|director/.test(role)) {
    return "For a marketing leader, I would frame this as budget control and visibility, not a bid tweak.";
  }
  if (/growth|acquisition|demand/.test(role)) {
    return "For growth, the sharper question is whether paid brand improves acquisition efficiency or just re-buys existing demand.";
  }
  if (/ecommerce|e-commerce|digital/.test(role)) {
    return "For digital commerce, the useful angle is protecting high-intent brand demand without paying for clicks the site would get anyway.";
  }
  return "The practical question is where paid brand is still changing the outcome.";
}

function tailorBody(input: BuildSequenceInput, purpose: SequenceStep["purpose"], body: string) {
  const blocks = body.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const hello = blocks[0]?.startsWith("Hi ") ? blocks[0] : greeting(input);
  const content = blocks[0]?.startsWith("Hi ") ? blocks.slice(1) : blocks;
  const roleSpecific = roleAngle(input);

  if (purpose === "BREAKUP_CLOSE_LOOP") {
    const middle =
      input.desiredTone === "EXECUTIVE"
        ? "If paid-brand efficiency becomes relevant later, the useful starting point is budget visibility: where paid coverage protects demand, and where it is only adding cost."
        : "If paid-brand efficiency becomes relevant later, the useful starting point is simple: where coverage protects demand, and where organic would have captured the click anyway.";
    return stripCommercialTerms(
      [hello, "I will close the loop here.", middle, "If this is not relevant right now, no problem."]
        .filter(Boolean)
        .join("\n\n"),
    );
  }

  if (input.desiredTone === "DIRECT") {
    return stripCommercialTerms(
      [hello, content[0], purpose === "FIRST_TOUCH_RELEVANCE" ? roleSpecific : content[1], content.at(-1)]
        .filter(Boolean)
        .join("\n\n"),
    );
  }

  if (input.desiredTone === "EXECUTIVE") {
    return stripCommercialTerms(
      [hello, content[0], purpose === "FIRST_TOUCH_RELEVANCE" ? roleSpecific : content[1], content.at(-1)]
        .filter(Boolean)
        .join("\n\n"),
    );
  }

  if (input.desiredTone === "WARM") {
    return stripCommercialTerms(
      [
        hello,
        "Not assuming this is already a problem on your side, but it is usually worth a light check for brand-heavy search programs.",
        content[0],
        content.at(-1),
      ]
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
  if (patternBody && purpose === "TECHNICAL_CLARIFICATION") {
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
      `Quick question on ${company}: how do you decide when branded ads should stay live, and when organic would have captured the click anyway?`,
      "The decision is practical: stay covered when competitors appear, lower bids when CPC is being pushed up, and avoid paying for demand the organic result would already win.",
      "Signal gives the team a live view of that decision across paid and organic, without turning it into another manual check.",
    ],
    PROBLEM_FRAMING: [
      greeting(input),
      "",
      "For context, Google does not offer an easy way to automatically pause or adjust branded ads when no other advertisers are bidding.",
      "As a result, many teams keep paying for clicks that could have been captured organically or at a much lower CPC.",
      `That is the gap I would check at ${company}: can the team see those quiet search-page moments and act without a manual review?`,
    ],
    METHODOLOGY_DIFFERENTIATION: [
      greeting(input),
      "",
      "A useful way to look at this is not paid and organic in theory, but what is happening on the search page at the moment of the search.",
      "If other advertisers are present, paid coverage may protect demand. If they are absent, the better move may be lowering bids or pausing until the page changes again.",
      "Signal is built to make that decision easier without turning it into a manual check every time.",
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

  const body = tailorBody(input, purpose, linesByPurpose[purpose].join("\n\n"));
  if (channel === "LINKEDIN") {
    return stripFallbackPhrases(
      stripCommercialTerms(
        body
        .replace(greeting(input), input.contactFirstName ? `${input.contactFirstName},` : "")
        .replace(/\n\n/g, " ")
        .replace(/\n/g, " ")
        .trim(),
      ),
    );
  }
  return stripFallbackPhrases(stripCommercialTerms(body));
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
              approvedKnowledge: request.records.slice(0, 12).map((record) => ({
                title: record.title,
                type: record.type,
                approvedText: record.approvedText,
                sourceTitles: record.sourceTitles,
              })),
              sequencePlan: result.steps.map((step) => ({
                stepNumber: step.stepNumber,
                channel: step.channel,
                delay: step.delay,
                purpose: step.purpose,
              })),
            },
            writingInstructions: [
              "Decision hierarchy: approvedKnowledge and approvedFacts are the source of truth for Signal, product behavior, proof, objections, and approved claims.",
              "Use your general B2B and industry knowledge only to choose angle, language, and likely buyer concerns. Never present general model knowledge as a verified fact about the specific company.",
              "If the company is well-known, you may use broad public category knowledge cautiously, such as travel marketplace, SaaS, ecommerce, or enterprise software. Phrase it as context, not as a discovered fact.",
              "Separate verified facts from assumptions in your reasoning. Prospect-facing copy may ask about assumptions, but must not assert unverified details.",
              "Prefer the strongest relevant approvedKnowledge over generic outbound patterns. If approvedKnowledge includes winning-message examples or case studies, borrow the strategic pattern, not the exact wording.",
              "Write the sequence from scratch. Do not rewrite or imitate a local template.",
              "Return sequenceSteps with exactly the same number of steps and the same order as brief.sequencePlan.",
              "Each email body should be 55-100 words. Each LinkedIn body should be 25-55 words.",
              "Each step must add a new reason, not repeat the same brand-search question.",
              "Do not use these fallback phrases or close variants: 'Quick question on', 'For context', 'A useful way to look at this', 'I will close the loop here', 'If this is not relevant, I can close the loop here'.",
              "Do not repeat the same idea in the body and CTA. The final step must close once only.",
              "The selected buyer role must change the copy: Paid Search gets operational bid/control language, Growth gets CAC/acquisition efficiency, CMO/VP gets budget visibility and business outcome language.",
              "If buyer role is missing or generic, write for a paid-brand/search leader without pretending to know the exact title.",
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
                  messageBody: stripFallbackPhrases(stripCommercialTerms(aiStep.messageBody)),
                  cta: stripFallbackPhrases(stripCommercialTerms(aiStep.cta)),
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
