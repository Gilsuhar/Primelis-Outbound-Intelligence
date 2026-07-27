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

function roundPercentages(text: string) {
  return text.replace(/\b(\d+)\.(\d+)%/g, (_match, whole, decimal) => {
    const rounded = Number(decimal) >= 5 ? Number(whole) + 1 : Number(whole);
    return `${rounded}%`;
  });
}

function stripSoftFiller(text: string) {
  return text
    .replace(/\busually where\b/gi, "where")
    .replace(/\busually\b/gi, "often")
    .replace(/\btends to\b/gi, "can")
    .replace(/\bgets noisy\b/gi, "gets hard to measure")
    .replace(/\bspend gets noisy\b/gi, "spend gets harder to control")
    .replace(/\bdrifts?\b/gi, "increases")
    .replace(/\bplaying out\b/gi, "showing up")
    .replace(/\bthe tradeoff\b/gi, "the decision")
    .replace(/\bsits in the same place\b/gi, "faces the same decision")
    .replace(/\bcarries the same pressure\b/gi, "has the same pressure")
    .replace(/\bunlock\b/gi, "show");
}

function stripTrailingQuestionWhenCtaExists(body: string, cta: string) {
  if (!cta.trim()) {
    return body;
  }
  const blocks = body.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const last = blocks.at(-1);
  if (!last?.endsWith("?")) {
    return body;
  }
  const withoutQuestion = last.replace(/\s*[^.!?]*\?\s*$/, "").trim();
  const nextBlocks = withoutQuestion ? [...blocks.slice(0, -1), withoutQuestion] : blocks.slice(0, -1);
  return nextBlocks.join("\n\n").trim() || body;
}

function stripSingleStepHeader(text: string) {
  const lines = text.split(/\r?\n/);
  const firstContentIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstContentIndex === -1) {
    return text;
  }
  const firstLine = lines[firstContentIndex].trim();
  if (!/^step\s+\d+\s*(?:[-:–—].*)?$/i.test(firstLine)) {
    return text;
  }
  return [...lines.slice(0, firstContentIndex), ...lines.slice(firstContentIndex + 1)]
    .join("\n")
    .trim();
}

function cleanAiText(text: string, maxLength: number) {
  return stripSingleStepHeader(
    stripSoftFiller(roundPercentages(stripFallbackPhrases(stripCommercialTerms(text)))),
  )
    .replace(/\s+\n/g, "\n")
    .trim()
    .slice(0, maxLength)
    .trim();
}

function hasLowPressureClose(text: string) {
  return /close the loop|not relevant|no problem|leave this|park this|timing|circle back|no need to reply/i.test(
    text,
  );
}

type AiSequenceStep = {
  subjectLine?: string;
  connectionRequest?: string;
  messageBody: string;
  cta: string;
  imagePlaceholder?: string;
  imageContextNote?: string;
};

const imagePlaceholderText = "[Insert relevant SERP or Signal screenshot here]";

function hasScreenshotContext(input: BuildSequenceInput) {
  return Boolean(
    input.screenshotAvailable &&
      [input.screenshotContext, input.screenshotShows].some((value) => value?.trim()),
  );
}

type StepTwoMode = "VISUAL" | "PROOF" | "DIAGNOSTIC";

function proofTextHasMetric(text: string) {
  return /\b\d+(?:\.\d+)?\s*%|\bMQL\b|\bSQL\b|\brevenue\b|\bclicks?\b|\bCPC\b/i.test(text);
}

function stepTwoMode(input: BuildSequenceInput, caseStudyFacts: string[]): StepTwoMode {
  if (hasScreenshotContext(input)) {
    return "VISUAL";
  }
  if (caseStudyFacts.some(proofTextHasMetric)) {
    return "PROOF";
  }
  return "DIAGNOSTIC";
}

function screenshotDetails(input: BuildSequenceInput) {
  return [
    input.screenshotContext,
    input.screenshotShows ? `What it shows: ${input.screenshotShows}` : "",
    input.brandKeyword ? `Brand keyword: ${input.brandKeyword}` : "",
    input.marketCountry ? `Market: ${input.marketCountry}` : "",
    input.device ? `Device: ${input.device}` : "",
    input.observationDate ? `Observed: ${input.observationDate}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function conciseProofText(text: string) {
  const cleaned = stripCommercialTerms(roundPercentages(text))
    .replace(/\s+/g, " ")
    .trim();
  return trimSentences(cleaned, 2);
}

function recordsForPrompt(records: SequenceKnowledgeRecord[]) {
  const firstCaseStudy = records.find((record) => record.type === "CASE_STUDY");
  return records
    .filter((record) => record.type !== "CASE_STUDY" || record.id === firstCaseStudy?.id)
    .slice(0, 12);
}

function normalizeAiStep(step: SequenceStep, aiStep: AiSequenceStep) {
  let messageBody = cleanAiText(aiStep.messageBody, 1600);
  if (messageBody.length < 20) {
    messageBody = step.messageBody;
  }

  let cta = cleanAiText(aiStep.cta, 220);
  if (cta.length === 0) {
    cta = step.cta;
  }

  if (step.purpose === "BREAKUP_CLOSE_LOOP" && !hasLowPressureClose(`${messageBody} ${cta}`)) {
    cta = "No need to reply if timing is wrong.";
  }
  messageBody = stripTrailingQuestionWhenCtaExists(messageBody, cta);

  return {
    ...step,
    subjectLine:
      step.channel === "EMAIL"
        ? cleanAiText(aiStep.subjectLine ?? step.subjectLine ?? "", 160)
        : undefined,
    connectionRequest:
      step.channel === "LINKEDIN" && step.stepNumber === 1
        ? cleanAiText(aiStep.connectionRequest ?? step.connectionRequest ?? "", 300)
        : step.connectionRequest,
    messageBody,
    cta,
    imagePlaceholder: step.imagePlaceholder,
    imageContextNote: step.imageContextNote,
  };
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
  const ctas: Record<SequenceStep["purpose"], string> = {
    FIRST_TOUCH_RELEVANCE: "Do you currently have visibility into those moments?",
    PROBLEM_FRAMING: "How often do you see this across your branded searches?",
    METHODOLOGY_DIFFERENTIATION: "Worth a brief walkthrough?",
    ACCOUNT_SPECIFIC_OBSERVATION: "Would it be useful to check whether this is relevant at your scale?",
    SOCIAL_PROOF: "Would it be useful to compare this with your current branded-search process?",
    TECHNICAL_CLARIFICATION: "Would a brief walkthrough help?",
    LOW_PRESSURE_FOLLOW_UP: "Should I park this for later?",
    BREAKUP_CLOSE_LOOP: "No problem if it isn't a priority right now.",
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
  const referencePurposes: SequenceStep["purpose"][] = [
    "FIRST_TOUCH_RELEVANCE",
    "PROBLEM_FRAMING",
    "METHODOLOGY_DIFFERENTIATION",
    "BREAKUP_CLOSE_LOOP",
  ];
  if (referencePurposes.includes(purpose)) {
    return stripCommercialTerms(body);
  }

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
  stepTwoMode,
  ctaIndex,
}: {
  input: BuildSequenceInput;
  purpose: SequenceStep["purpose"];
  channel: SequenceStep["channel"];
  secondaryFact: string;
  stepTwoMode: StepTwoMode;
  ctaIndex: number;
}) {
  const company = displayCompany(input);
  const simpleSecondaryFact =
    stepTwoMode === "PROOF" ? secondaryFact : humanizeFact(secondaryFact);
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
      `Quick question on ${company}'s branded search: how do you decide when brand ads are genuinely protecting the query, and when organic may have captured the click anyway?`,
      "Signal monitors live Google and Bing results and can adjust coverage as competitor activity changes, rather than leaving brand bids on the same setting throughout the day.",
    ],
    PROBLEM_FRAMING: [
      greeting(input),
      "",
      stepTwoMode === "VISUAL"
        ? "Here's an example of the type of moment Signal monitors:"
        : stepTwoMode === "PROOF"
          ? "Approved proof:"
          : "Branded-search coverage often remains unchanged even though competitor presence can change during the day.",
      stepTwoMode === "VISUAL"
        ? `In this example, ${screenshotDetails(input)}`
        : stepTwoMode === "PROOF"
          ? conciseProofText(simpleSecondaryFact)
          : "The useful diagnostic is simple: can the team see when the brand is alone, when competitors return, and whether bids should change with that condition?",
      stepTwoMode === "VISUAL"
          ? "Signal can identify these conditions automatically and either pause the ad or reduce the bid, depending on the team's strategy."
          : stepTwoMode === "PROOF"
          ? "The useful next step is to compare where paid coverage protects demand and where bids can safely come down."
          : `For ${company}, I would treat that as a visibility question, not as proof about the account.`,
    ],
    METHODOLOGY_DIFFERENTIATION: [
      greeting(input),
      "",
      "Signal continuously checks competitor presence on branded queries.",
      "When the brand is the only advertiser, it can pause the ad or lower the bid. When competition returns, coverage is adjusted again automatically.",
      "The goal is to maintain protection without using the same bid in every search condition.",
    ],
    ACCOUNT_SPECIFIC_OBSERVATION: [
      greeting(input),
      "",
      `The only assumption I would make about ${company} is a light one: branded-search process may be worth checking.`,
      "I would not pitch that as proof. I would use it as a reason to check whether paid brand is still doing work organic cannot do.",
    ],
    SOCIAL_PROOF: [
      greeting(input),
      "",
      "One concrete customer result is more useful than another broad brand-search explanation.",
      simpleSecondaryFact,
      "The practical takeaway is to test where paid coverage is protecting demand and where the bid can safely come down.",
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
      `Keeping this narrow: if paid-brand efficiency becomes relevant at ${input.companyName}, it may be worth a quick check.`,
      "If it is not a current priority, no problem.",
    ],
    BREAKUP_CLOSE_LOOP: [
      greeting(input),
      "",
      "I'll close the loop here.",
      "This may already be something your team manages closely. If not, I can send the short version of how teams review those moments.",
      "No problem if it isn't a priority right now.",
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
    const proofFacts = caseStudyFacts.filter(proofTextHasMetric);
    const selectedStepTwoMode = stepTwoMode(input, proofFacts);
    const primaryFact = productFacts[0]
      ? trimSentences(productFacts[0], 1)
      : "I do not have enough approved Signal knowledge to make a specific factual claim.";
    const secondaryFact = productFacts[1] ? trimSentences(productFacts[1], 1) : primaryFact;
    const purposes: SequencePurpose[] = defaultPurposesForLength();
    const sourceIds = Array.from(new Set(records.flatMap((record) => record.sourceIds)));

    const steps = purposes.map((purpose, index): SequenceStep => {
      const stepNumber = index + 1;
      const channel = channelForStep(input.primaryChannel, index);
      const isFinal = stepNumber === purposes.length;
      const cta = ctaForPurpose(input, purpose, stepNumber, isFinal, channel);
      return {
        stepNumber,
        channel,
        delay: delayFor(stepNumber, purposes.length, input.desiredOverallDuration),
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
          secondaryFact: proofFacts[0] ?? secondaryFact,
          stepTwoMode: selectedStepTwoMode,
          ctaIndex: index,
        }),
        cta,
        imagePlaceholder:
          purpose === "PROBLEM_FRAMING" && hasScreenshotContext(input)
            ? imagePlaceholderText
            : undefined,
        imageContextNote:
          purpose === "PROBLEM_FRAMING" && hasScreenshotContext(input)
            ? `Salesperson note: replace the placeholder with the supplied SERP or Signal screenshot. Use only the supplied context: ${screenshotDetails(input)}`
            : undefined,
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
      const promptRecords = recordsForPrompt(request.records);
      const selectedCaseStudyFacts = promptRecords
        .filter((record) => record.type === "CASE_STUDY")
        .map((record) => record.approvedText)
        .filter(proofTextHasMetric);
      const selectedStepTwoMode = stepTwoMode(request.input, selectedCaseStudyFacts);
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
              screenshotAvailable: request.input.screenshotAvailable,
              screenshotContext: request.input.screenshotContext,
              brandKeyword: request.input.brandKeyword,
              marketCountry: request.input.marketCountry,
              device: request.input.device,
              observationDate: request.input.observationDate,
              screenshotShows: request.input.screenshotShows,
              selectedAngle: result.selectedAngle,
              stepTwoMode: selectedStepTwoMode,
              approvedKnowledge: promptRecords.map((record) => ({
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
              "Template-first task: do not invent a new sequence strategy. Return exactly four sequenceSteps matching brief.sequencePlan.",
              "Use this approved reference as the primary style and structure. Step 1: Hi [First name], Quick question on [Company]'s branded search: how do you decide when brand ads are genuinely protecting the query, and when organic may have captured the click anyway? Signal monitors live Google and Bing results and adjusts branded coverage as competitor activity changes. Do you currently have visibility into those moments?",
              "Reference Step 2 visual mode: Here's a simple example of the type of moment Signal monitors: [placeholder]. In this example, describe only what the user supplied. Signal can identify these conditions automatically and either pause the ad or reduce the bid, depending on the team's strategy. Ask whether they have visibility into similar moments.",
              "Reference Step 3: Signal continuously checks competitor presence on branded queries. When the brand is the only advertiser, it can pause the ad or lower the bid. When competition returns, coverage is adjusted again automatically. End with a brief walkthrough CTA.",
              "Reference Step 4: close the loop, acknowledge they may already manage this, offer one light next step, and do not add new proof or technical detail.",
              "Step 2 mode is preselected by the application as brief.stepTwoMode. If VISUAL, use only supplied screenshot fields and include the exact placeholder through imagePlaceholder, not inside body text. If PROOF, use only the selected named approved case study and exact approved metric. If DIAGNOSTIC, use a conditional general insight with no customer, no metric, and no prospect-specific claim.",
              "Allowed adaptation only: first name, company or brand, role context, supplied screenshot context, selected approved case study, approved product facts, and CTA wording within the approved intent.",
              "Rejected bad example: 'At LELO, branded search can be doing more work than it should if competitors are taking slots or if your own ad is carrying spend when organic already covers the query.' Reject because it assumes competitor activity, wasted spend, and organic coverage.",
              "Rejected bad example: 'A customer example we've seen...' Reject because it is anonymous and has no approved customer or metric.",
              "Never claim the prospect has waste, competitors, crowded queries, high CPC, rising spend, poor incrementality, organic coverage, or inefficient coverage unless that exact verified context was supplied.",
              "Avoid vague AI language: conversion-source data, outcome data, cleaner read, cleaner bid decision, the angle, setup pattern, plain example, real work, doing more work than it should.",
              "Use concrete language: Google Ads, Search Console, conversion data, competitor presence, pause ads, reduce bids, restore coverage, branded-search process.",
              "Keep each body close to the reference length. One idea per step. One CTA per step. No extra paragraphs. No anonymous stories. No repeated product explanation.",
            ],
            approvedFacts: promptRecords.map((record) => record.approvedText).slice(0, 10),
            userProvidedContext: [
              request.input.companyName ? `Company name: ${request.input.companyName}` : "",
              request.input.companyWebsite ? `Company website: ${request.input.companyWebsite}` : "",
              request.input.contactFirstName ? `Prospect first name: ${request.input.contactFirstName}` : "",
              request.input.contactRole ? `Buyer role: ${request.input.contactRole}` : "",
              request.input.industry ? `Industry selected by user: ${request.input.industry}` : "",
              cleanSelection(request.input.companyContext)
                ? `Company context from user: ${cleanSelection(request.input.companyContext)}`
                : "",
              request.input.geographyOrMarkets ? `Markets from user: ${request.input.geographyOrMarkets}` : "",
              request.input.paidSearchContext ? `Paid-search context from user: ${request.input.paidSearchContext}` : "",
              request.input.currentVendor ? `Current vendor from user: ${request.input.currentVendor}` : "",
              cleanSelection(request.input.observedTrigger)
                ? `Outreach reason from user: ${cleanSelection(request.input.observedTrigger)}`
                : "",
              request.input.screenshotAvailable ? "Screenshot or SERP context available: yes" : "Screenshot or SERP context available: no",
              request.input.screenshotContext ? `Screenshot context from user: ${request.input.screenshotContext}` : "",
              request.input.screenshotShows ? `Screenshot shows, according to user: ${request.input.screenshotShows}` : "",
              request.input.brandKeyword ? `Brand keyword from user: ${request.input.brandKeyword}` : "",
              request.input.marketCountry ? `Screenshot market/country from user: ${request.input.marketCountry}` : "",
              request.input.device ? `Screenshot device from user: ${request.input.device}` : "",
              request.input.observationDate ? `Screenshot observation date from user: ${request.input.observationDate}` : "",
            ].filter(Boolean),
            sourceReferences: request.sourceReferences,
            safetyPolicy: result.safetyNotes,
            outputLanguageInstruction: outputLanguageInstruction(request.input.outputLanguage ?? "ENGLISH"),
          },
        });
        if (aiResult.sequenceSteps?.length !== result.steps.length) {
          throw new Error("MALFORMED_RESPONSE");
        }
        const aiSteps =
          result.steps.map((step, index) => {
                const aiStep = aiResult.sequenceSteps?.[index];
                if (!aiStep) {
                  return step;
                }
                return normalizeAiStep(step, aiStep);
              });
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
