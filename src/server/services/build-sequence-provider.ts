import {
  channelForStep,
  defaultPurposesForLength,
  labelForSequenceAngle,
} from "@/features/build-sequence/sequence-policy";
import type {
  BuildSequenceInput,
  SequenceGeneration,
  SequenceKnowledgeRecord,
  ProspectIntelligence,
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
  return stripSingleStepHeader(text)
    .replace(/^For context,\s*/gim, "")
    .replace(/A useful way to look at this is/gi, "The practical read is")
    .replace(/I will close the loop here\.\s*/gi, "")
    .replace(/If this is not relevant, I can close the loop here\./gi, "If timing is wrong, no need to reply.");
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

const imagePlaceholderText = "{{! Insert screenshot }}";
const approvedProofPoints = [
  "AppsFlyer cut branded spend 29% with qualified lead volume up 25% in the first 30 days.",
  "Crocs reduced total branded-search spend by 71.2% while monitoring paid and organic performance.",
  "Dior reduced ad cost by 54% at equal performance.",
] as const;

function hasScreenshotContext(input: BuildSequenceInput) {
  return Boolean(
    input.screenshotAvailable &&
      [input.screenshotContext, input.screenshotShows].some((value) => value?.trim()),
  );
}

function screenshotObservation(input: BuildSequenceInput, intelligence: ProspectIntelligence) {
  const keyword = intelligence.serpEvidence.keywords[0] ?? input.brandKeyword;
  const observedAt = input.observationDate ? ` at the time of the ${input.observationDate} check` : "";
  const market = input.marketCountry ? ` in ${input.marketCountry}` : "";
  const shows = input.screenshotShows?.trim();
  if (shows) {
    return `At the time of the check${market}, the supplied evidence shows ${shows.replace(/\.$/, "")}. This is only a snapshot, but it is a useful reason to measure whether the bid should change over time.`;
  }
  if (keyword) {
    return `At the time of the check${market}, "${keyword}" was part of the branded-query sample${observedAt}. That does not prove inefficiency, but it is worth measuring how the auction changes over time.`;
  }
  return "At the time of the check, the supplied SERP evidence gives a snapshot of branded-search conditions. That does not prove inefficiency, but it is worth measuring how those conditions change over time.";
}

function selectedCaseStudy(records: SequenceKnowledgeRecord[]) {
  return records.find((record) => record.type === "CASE_STUDY");
}

function caseStudyCompany(record: SequenceKnowledgeRecord) {
  const explicit = record.approvedText.match(/\bCase study:\s*([^.\n]+)[.\n]/i);
  if (explicit?.[1]) {
    return explicit[1].trim();
  }
  const approvedTextLead = record.approvedText.match(
    /^\s*([A-Z][A-Za-z0-9&'. -]{1,60}?)\s+(?:cut|cuts|reduced|reduces|lowered|lowers|improved|improves|grew|increased|protected|saved|decreased)\b/,
  );
  if (approvedTextLead?.[1]) {
    return approvedTextLead[1].trim();
  }
  const titleLead = record.title.split(/\s+(?:cuts|cut|reduces|reduced|lowers|lowered|improves|improved|leads|saved)\s+/i)[0];
  return titleLead.trim();
}

function proofSummary(record: SequenceKnowledgeRecord) {
  return trimSentences(
    record.approvedText
      .replace(/\bCase study:\s*([^.\n]+)[.\n]\s*/i, "")
      .replace(/\s*Approved by Primelis for outbound social proof\..*$/i, "")
      .replace(/\s+/g, " ")
      .trim(),
    2,
  );
}

function customerProofLine(records: SequenceKnowledgeRecord[]) {
  const proof = selectedCaseStudy(records);
  if (!proof) {
    return approvedProofPoints[0];
  }
  const company = caseStudyCompany(proof);
  const summary = proofSummary(proof);
  if (!summary) {
    return approvedProofPoints[0];
  }
  return `${company} example: ${summary}`;
}

function approvedProofPointForStep(ctaIndex: number) {
  return approvedProofPoints[ctaIndex % approvedProofPoints.length];
}

function approvedProofPointExcluding(customerName: string, ctaIndex: number) {
  const normalizedCustomer = customerName.toLowerCase();
  const available = approvedProofPoints.filter(
    (proofPoint) => !proofPoint.toLowerCase().startsWith(normalizedCustomer),
  );
  return available[ctaIndex % available.length] ?? approvedProofPointForStep(ctaIndex);
}

function recordsForPrompt(records: SequenceKnowledgeRecord[]) {
  const firstCaseStudy = records.find((record) => record.type === "CASE_STUDY");
  return records
    .filter((record) => record.type !== "CASE_STUDY" || record.id === firstCaseStudy?.id)
    .slice(0, 12);
}

function greeting(input: BuildSequenceInput, intelligence?: ProspectIntelligence) {
  const firstName = input.contactFirstName || intelligence?.prospectName;
  return firstName ? `Hi ${firstName},` : "Hi there,";
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
  purpose: SequenceStep["purpose"],
) {
  const ctas: Record<SequenceStep["purpose"], string> = {
    FIRST_TOUCH_RELEVANCE: "Do you have anything in place for that today?",
    PROBLEM_FRAMING: "Is your team able to detect these moments automatically?",
    METHODOLOGY_DIFFERENTIATION: "Worth a quick look?",
    ACCOUNT_SPECIFIC_OBSERVATION: "Would it be useful to check whether this is relevant at your scale?",
    SOCIAL_PROOF: "Open to a quick overview?",
    TECHNICAL_CLARIFICATION: "Would a brief walkthrough help?",
    LOW_PRESSURE_FOLLOW_UP: "Should I park this for later?",
    BREAKUP_CLOSE_LOOP: "Happy to share more if useful.",
  };
  return ctas[purpose];
}

function subjectFor(input: BuildSequenceInput, purpose: SequenceStep["purpose"], stepNumber: number) {
  const pattern = winningPatternForPurpose(input, purpose, stepNumber - 1);
  const referencePurposes: SequencePurpose[] = [
    "FIRST_TOUCH_RELEVANCE",
    "PROBLEM_FRAMING",
    "METHODOLOGY_DIFFERENTIATION",
    "BREAKUP_CLOSE_LOOP",
  ];
  if (pattern.subject && !referencePurposes.includes(purpose)) {
    return pattern.subject;
  }
  const company = displayCompany(input);
  if (purpose === "FIRST_TOUCH_RELEVANCE" && managesMultipleAccounts(input)) {
    return "branded search across managed accounts";
  }
  const subjects: Record<SequenceStep["purpose"], string> = {
    FIRST_TOUCH_RELEVANCE: `${company} branded search visibility`,
    PROBLEM_FRAMING: `Re: ${company} SERP visibility`,
    METHODOLOGY_DIFFERENTIATION: `Re: Signal and branded CPC`,
    ACCOUNT_SPECIFIC_OBSERVATION: `${company}: one brand-search check`,
    SOCIAL_PROOF: `A practical paid-brand example`,
    TECHNICAL_CLARIFICATION: `Paid brand methodology`,
    LOW_PRESSURE_FOLLOW_UP: `Quick follow-up on ${company}`,
    BREAKUP_CLOSE_LOOP: `Quick follow-up`,
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

function buyerRole(input: BuildSequenceInput, intelligence?: ProspectIntelligence) {
  return intelligence?.jobTitle || input.contactRole;
}

function hasPromotionSignal(input: BuildSequenceInput) {
  return /\b(promoted|promotion|new role|stepped into|recently became|congrats|congratulations)\b/i.test(
    [
      input.prospectContext,
      input.observedTrigger,
      input.internalNotes,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function managesMultipleAccounts(input: BuildSequenceInput) {
  return /\b(agency|managed accounts|multiple accounts|client accounts|portfolio|clients?|accounts your team manages)\b/i.test(
    [
      input.companyContext,
      input.industry,
      input.prospectContext,
      input.paidSearchContext,
      input.observedTrigger,
      input.internalNotes,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function roleAngle(input: BuildSequenceInput, intelligence?: ProspectIntelligence) {
  const role = buyerRole(input, intelligence).toLowerCase();
  if (managesMultipleAccounts(input) && /paid search|sem|ppc|performance/.test(role)) {
    return "For a PPC team managing several accounts, the practical decision is when coverage is defensive and when the auction is quiet enough to lower pressure.";
  }
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

function firstPersonalFact(intelligence: ProspectIntelligence) {
  return intelligence.relevantFacts.find(
    (fact) => !/^(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z]{2,})+(?:\/)?\.?$/i.test(fact.trim()),
  );
}

function scenarioProblem(input: BuildSequenceInput, intelligence: ProspectIntelligence) {
  const evidence = intelligence.serpEvidence;
  const scope = managesMultipleAccounts(input) ? " across multiple accounts" : "";
  if (intelligence.serpScenario === "SOLO") {
    const sample = evidence.soloKeywords.slice(0, 2).join(", ");
    return sample
      ? `One challenge${scope} is branded-search efficiency: ${sample} showed a quiet auction in the sample, where CPC may deserve a closer look.`
      : `One challenge${scope} is branded-search efficiency. A campaign can look healthy while still paying the same CPC during quiet brand auctions.`;
  }
  if (intelligence.serpScenario === "CONTESTED") {
    const sample = evidence.contestedKeywords.slice(0, 2).join(", ");
    return sample
      ? `One challenge${scope} is deciding the right CPC when competitors appear on terms like ${sample}. Visibility may matter, but the defensive bid still has to be measured.`
      : `One challenge${scope} is deciding the right CPC when competitors appear on branded terms. Visibility may matter, but the defensive bid still has to be measured.`;
  }
  if (intelligence.serpScenario === "MIXED") {
    return `One challenge${scope} is that the same brand program can contain two auctions: some queries are quiet, while others have visible competition. One static brand-bid rule usually misses that difference.`;
  }
  return `Without reliable SERP evidence, I would keep this as a visibility question${scope}: how quickly can the team see when branded-search competition changes and know whether bids should change with it?`;
}

function scenarioMethod(input: BuildSequenceInput, intelligence: ProspectIntelligence) {
  const accountScope = managesMultipleAccounts(input) ? " across the accounts your team manages" : "";
  if (intelligence.serpScenario === "SOLO") {
    return `The useful method is to identify solo periods${accountScope}, reduce CPC only where coverage is still protected, and restore defense when competitors return.`;
  }
  if (intelligence.serpScenario === "CONTESTED") {
    return "When competitors are present, the goal is defensive efficiency: stay covered, but find the minimum CPC or position needed to maintain performance.";
  }
  if (intelligence.serpScenario === "MIXED") {
    return `The same branded query can move between two very different auctions${accountScope}: defend contested terms, and reduce pressure when the page is quiet.`;
  }
  return "Signal monitors Google and Bing SERPs minute by minute, then connects that visibility with Google Ads, Search Console, and conversion signals so bid decisions follow the search page.";
}

function accountOpening(input: BuildSequenceInput, intelligence: ProspectIntelligence) {
  const company = displayCompany(input);
  const fact = firstPersonalFact(intelligence);
  if (fact && intelligence.confidence.prospect !== "LOW") {
    return `I noticed this about ${company}: ${fact.replace(/\.$/, "")}.`;
  }
  if (intelligence.jobTitle && intelligence.persona !== "OTHER") {
    if (hasPromotionSignal(input)) {
      return `Congrats on the move to ${intelligence.jobTitle}.`;
    }
    return `For your ${intelligence.jobTitle} role at ${company}, I would keep this to one narrow branded-search question.`;
  }
  return `Quick question on ${company}'s branded search: how do you track changes in the competitive landscape and know when your bids should change?`;
}

function tailorBody(input: BuildSequenceInput, purpose: SequenceStep["purpose"], body: string) {
  const referencePurposes: SequenceStep["purpose"][] = [
    "FIRST_TOUCH_RELEVANCE",
    "PROBLEM_FRAMING",
    "METHODOLOGY_DIFFERENTIATION",
    "SOCIAL_PROOF",
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
      [
        hello,
        ...(content.length <= 2
          ? content
          : [content[0], purpose === "FIRST_TOUCH_RELEVANCE" ? roleSpecific : content[1], content.at(-1)]),
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
  }

  if (input.desiredTone === "EXECUTIVE") {
    return stripCommercialTerms(
      [
        hello,
        ...(content.length <= 2
          ? content
          : [content[0], purpose === "FIRST_TOUCH_RELEVANCE" ? roleSpecific : content[1], content.at(-1)]),
      ]
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
  ctaIndex,
  records,
  intelligence,
}: {
  input: BuildSequenceInput;
  purpose: SequenceStep["purpose"];
  channel: SequenceStep["channel"];
  ctaIndex: number;
  records: SequenceKnowledgeRecord[];
  intelligence: ProspectIntelligence;
}) {
  const company = displayCompany(input);
  const pattern = winningPatternForPurpose(input, purpose, ctaIndex);
  const patternBody = pattern.body;
  const proof = selectedCaseStudy(records);
  const selectedProofLine = proof ? customerProofLine(records) : undefined;
  const proofLine =
    proof && purpose === "SOCIAL_PROOF"
      ? selectedProofLine ?? approvedProofPointForStep(ctaIndex)
      : proof
        ? approvedProofPointExcluding(caseStudyCompany(proof), ctaIndex)
        : approvedProofPointForStep(ctaIndex);
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
      greeting(input, intelligence),
      "",
      accountOpening(input, intelligence),
      scenarioProblem(input, intelligence),
    ],
    PROBLEM_FRAMING: [
      greeting(input, intelligence),
      "",
      scenarioMethod(input, intelligence),
      intelligence.persona === "GROWTH"
        ? "For growth teams, the goal is not just lower spend; it is knowing whether paid brand is changing conversion outcomes."
        : "That lets the team adjust coverage with evidence, without assuming every quiet auction means inefficient spend.",
    ],
    METHODOLOGY_DIFFERENTIATION: [
      greeting(input, intelligence),
      "",
      hasScreenshotContext(input) || intelligence.serpScenario !== "UNKNOWN"
        ? screenshotObservation(input, intelligence)
        : "Without account-specific SERP evidence, I would not claim what is happening on the page. The safer starting point is visibility: how often does the branded auction change, and how quickly can bids react?",
      "Signal works alongside your existing Google Ads setup, without requiring the team to rebuild campaigns or change your current bidding strategy.",
    ],
    ACCOUNT_SPECIFIC_OBSERVATION: [
      greeting(input, intelligence),
      "",
      `The only assumption I would make about ${company} is a light one: branded-search process may be worth checking.`,
      "I would not pitch that as proof. I would use it as a reason to check whether paid brand is still doing work organic cannot do.",
    ],
    SOCIAL_PROOF: [
      greeting(input, intelligence),
      "",
      proofLine,
      roleAngle(input, intelligence),
    ],
    TECHNICAL_CLARIFICATION: [
      greeting(input, intelligence),
      "",
      "The methodology question is straightforward: before lowering or pausing anything, check paid ads, organic results, and search-page conditions together.",
      "That keeps the conversation away from generic cost-cutting and focused on where paid coverage is actually needed.",
    ],
    LOW_PRESSURE_FOLLOW_UP: [
      greeting(input, intelligence),
      "",
      `Keeping this narrow: if paid-brand efficiency becomes relevant at ${input.companyName}, it may be worth a quick check.`,
      "If it is not a current priority, no problem.",
    ],
    BREAKUP_CLOSE_LOOP: [
      greeting(input, intelligence),
      "",
      "Not sure if this is a priority right now.",
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
    const primaryFact = productFacts[0]
      ? trimSentences(productFacts[0], 1)
      : "I do not have enough approved Signal knowledge to make a specific factual claim.";
    const purposes: SequencePurpose[] = defaultPurposesForLength();
    const sourceIds = Array.from(new Set(records.flatMap((record) => record.sourceIds)));
    const proofLine = customerProofLine(records);
    const deterministicClaims = [
      "Signal monitors Google and Bing SERPs minute by minute.",
      "Signal works alongside the existing Google Ads setup without rebuilding campaigns or changing the current bidding strategy.",
      proofLine,
    ].filter((claim): claim is string => Boolean(claim));

    const steps = purposes.map((purpose, index): SequenceStep => {
      const stepNumber = index + 1;
      const channel = channelForStep(input.primaryChannel, index);
      const cta = ctaForPurpose(purpose);
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
          ctaIndex: index,
          records,
          intelligence: generation.prospectIntelligence,
        }),
        cta,
        imagePlaceholder:
          purpose === "PROBLEM_FRAMING"
            ? imagePlaceholderText
            : undefined,
        imageContextNote:
          purpose === "PROBLEM_FRAMING"
            ? hasScreenshotContext(input)
              ? `Salesperson note: replace the placeholder with the supplied SERP or Signal screenshot. Use only the supplied context: ${[input.screenshotContext?.trim(), screenshotObservation(input, generation.prospectIntelligence)].filter(Boolean).join(" ")}`
              : "Salesperson note: insert the relevant prospect SERP screenshot before sending. Do not claim unsupported observations."
            : undefined,
        claimsUsed: [
          purpose === "METHODOLOGY_DIFFERENTIATION" && proofLine
            ? proofLine
            : purpose === "FIRST_TOUCH_RELEVANCE"
              ? deterministicClaims[0]
              : humanizeFact(primaryFact),
        ],
        sourceIds,
      };
    });

    return {
      ...generation,
      steps,
      claimsUsed: Array.from(new Set([...deterministicClaims, ...steps.flatMap((step) => step.claimsUsed)])),
      overallStrategy: stripCommercialTerms(
        `Use prospect intelligence first, then the ${generation.prospectIntelligence.serpScenario.toLowerCase()} SERP scenario: relevance, scenario method, account evidence, and one proof-led conversion step. Keep the sequence concise and anchored to ${emailAngle}.`,
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
              prospectContext: request.input.prospectContext,
              serpEvidence: request.input.serpEvidence,
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
              prospectIntelligence: request.generation.prospectIntelligence,
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
              "Do not return a free-form sequence. The application owns the four rendered emails.",
              "Return only concise optional wording suggestions inside the provided sequenceSteps shape. The application may ignore any field that violates the deterministic renderer.",
              "Do not change step purpose, CTA category, approved proof points, screenshot placeholder, or sequence order.",
              "Avoid organic-cannibalization claims unless explicitly supplied by the user.",
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
        return {
          ...result,
          safetyNotes: [
            ...result.safetyNotes,
            ...aiResult.uncertaintyNotes,
            "Deterministic renderer controlled the final sequence structure.",
          ],
        };
      } catch (error) {
        const failure = mapAiProviderError(error);
        return {
          ...result,
          safetyNotes: [
            ...result.safetyNotes,
            `${failure.message} Deterministic renderer controlled the final sequence structure.`,
          ],
        };
      }
    },
  };
}
