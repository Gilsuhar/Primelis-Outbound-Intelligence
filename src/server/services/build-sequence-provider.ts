import {
  channelForStep,
  defaultPurposesForLength,
  labelForSequenceAngle,
} from "@/features/build-sequence/sequence-policy";
import type {
  BuildSequenceDiagnostics,
  BuildSequenceInput,
  MessageStrategy,
  SequenceGeneration,
  SequenceKnowledgeRecord,
  ProspectIntelligence,
  SequencePurpose,
  SequenceSourceReference,
  SequenceStep,
} from "@/features/build-sequence/types";
import type { ReplyProviderMetadata } from "@/features/reply-to-prospect/types";
import { outputLanguageInstruction } from "@/lib/output-language";

import { createAiProvider, mapAiProviderError, shouldUseOpenAiProvider } from "./ai-provider";
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

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nowMs() {
  return Date.now();
}

function protectedKeywordPhrases(intelligence?: ProspectIntelligence) {
  return Array.from(
    new Set(
      [
        ...(intelligence?.serpEvidence.keywords ?? []),
        ...(intelligence?.serpEvidence.soloKeywords ?? []),
        ...(intelligence?.serpEvidence.contestedKeywords ?? []),
        ...(intelligence?.serpEvidence.structuredKeywords.map((keyword) => keyword.term) ?? []),
      ].filter(Boolean),
    ),
  );
}

function stripCommercialTerms(text: string, protectedPhrases: string[] = []) {
  const masks = new Map<string, string>();
  let masked = text;
  protectedPhrases
    .filter((phrase) => phrase.trim().length > 1)
    .forEach((phrase, index) => {
      const token = `__SAFE_KEYWORD_${index}__`;
      masks.set(token, phrase);
      masked = masked.replace(new RegExp(escapeRegExp(phrase), "gi"), token);
    });
  const sanitized = masked
    .replace(
      /\b(pricing|price)\b(?![-\s]page)\b|\b(poc|proof of concept|trial|discount|guarantee|guaranteed)\b/gi,
      "commercial details",
    )
    .replace(/\bversus\b/gi, "and")
    .replace(/\bbetter than\b/gi, "different from")
    .replace(/\bbeats\b/gi, "differs from")
    .replace(/\b(adthena|revvim|auction insights)\b/gi, "current tools");
  return Array.from(masks.entries()).reduce(
    (value, [token, phrase]) => value.replaceAll(token, phrase),
    sanitized,
  );
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

const approvedProofPoints = [
  "AppsFlyer cut branded spend 29% with qualified lead volume up 25% in the first 30 days.",
  "Crocs reduced total branded-search spend by 71.2% while monitoring paid and organic performance.",
  "Dior reduced ad cost by 54% at equal performance.",
] as const;
const bannedRewritePhrases = [
  "our tech",
  "our tool",
  "our platform",
  "leverage",
  "unlock",
  "synergy",
  "seamless",
  "let me know if interested",
  "book a meeting",
];

type StepFactSheet = {
  step: number;
  purpose: SequencePurpose;
  prospect: {
    name: string;
    company: string;
    title: string;
  };
  personalHook: string | null;
  proofPoint: {
    company: string;
    claim: string;
    source: string;
  } | null;
  keywordEvidence: {
    contested?: { term: string; competitor?: string };
    solo?: { term: string };
  };
  cta: string;
  deterministicSubject?: string;
  deterministicBody: string;
  bannedPhrases: string[];
};

type AllowedEntities = {
  properNouns: string[];
  numbers: string[];
};

function hasScreenshotContext(input: BuildSequenceInput) {
  return Boolean(
    input.screenshotAvailable &&
      [input.screenshotContext, input.screenshotShows].some((value) => value?.trim()),
  );
}

function screenshotObservation(input: BuildSequenceInput, intelligence: ProspectIntelligence) {
  const keyword = intelligence.serpEvidence.structuredKeywords.find((item) => item.status === "solo")?.term ??
    intelligence.serpEvidence.keywords[0] ??
    input.brandKeyword;
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

function proofPointForStep(records: SequenceKnowledgeRecord[], purpose: SequencePurpose, ctaIndex: number) {
  const proof = selectedCaseStudy(records);
  if (proof && purpose === "SOCIAL_PROOF") {
    return {
      company: caseStudyCompany(proof),
      claim: proofSummary(proof),
      source: proof.id,
    };
  }
  if (purpose === "SOCIAL_PROOF") {
    const claim = approvedProofPointForStep(ctaIndex);
    return {
      company: claim.split(/\s+/)[0],
      claim,
      source: "approved-static-proof",
    };
  }
  return null;
}

function extractNumbers(text: string) {
  return Array.from(text.matchAll(/\$?\b\d+(?:\.\d+)?%?|\b\d+(?:\.\d+)?\s*(?:days?|months?|years?)\b/gi))
    .map((match) => match[0].trim());
}

function extractCapitalizedPhrases(text: string) {
  return Array.from(
    text.matchAll(/\b[A-Z][A-Za-z0-9&'.-]*(?:\s+[A-Z][A-Za-z0-9&'.-]*){0,3}\b/g),
  )
    .flatMap((match) => match[0].split(/\.\s+/))
    .map((match) => match.trim())
    .filter(Boolean);
}

function allowedEntityVariants(value?: string) {
  if (!value) return [];
  const clean = value.trim();
  if (!clean) return [];
  const tokens = clean.split(/\s+/).filter((token) => /^[A-Z0-9]/.test(token));
  return [clean, ...tokens].filter((item) => item.length > 1);
}

function buildAllowedEntities(sheet: StepFactSheet): AllowedEntities {
  const properNouns = [
    ...allowedEntityVariants(sheet.prospect.name),
    ...allowedEntityVariants(sheet.prospect.company),
    ...allowedEntityVariants(sheet.prospect.title),
    ...extractCapitalizedPhrases(sheet.personalHook ?? ""),
    ...allowedEntityVariants(sheet.proofPoint?.company),
    ...allowedEntityVariants(sheet.keywordEvidence.contested?.term),
    ...allowedEntityVariants(sheet.keywordEvidence.contested?.competitor),
    ...allowedEntityVariants(sheet.keywordEvidence.solo?.term),
    "Signal",
    "Primelis",
    "Google",
    "Google Ads",
    "Ads",
    "Search Console",
    "Bing",
    "SERP",
    "CPC",
    "CAC",
    "KPIs",
    "EMEA",
  ];
  const numbers = [
    ...extractNumbers(sheet.personalHook ?? ""),
    ...extractNumbers(sheet.proofPoint?.claim ?? ""),
    ...extractNumbers(sheet.keywordEvidence.contested?.term ?? ""),
    ...extractNumbers(sheet.keywordEvidence.solo?.term ?? ""),
  ];
  return {
    properNouns: Array.from(new Set(properNouns)),
    numbers: Array.from(new Set(numbers)),
  };
}

function isKnownRewriteStopword(noun: string) {
  return /^(Hi|I|A|An|One|Some|When|That|This|The|For|If|It|Do|Would|Could|Is|Open|Worth|Without|With|Re|Day|Step|Final|Congrats|Congratulations|Your|You|Across|At|Before|Seeing|Which|What|Since|Standard|Adjust|Separating|Want)$/i.test(noun);
}

function entityAllowed(noun: string, allowed: AllowedEntities) {
  const normalized = noun.toLowerCase();
  return allowed.properNouns.some((entity) => {
    const allowedEntity = entity.toLowerCase();
    return normalized.includes(allowedEntity) || allowedEntity.includes(normalized);
  });
}

function wordCount(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

function validateHybridStepRewrite(
  output: { subject?: string; body: string },
  sheet: StepFactSheet,
  allowed: AllowedEntities,
) {
  const failures: string[] = [];
  const subject = output.subject?.trim() ?? "";
  const body = output.body.trim();
  const rendered = `${subject} ${body}`;
  for (const noun of extractCapitalizedPhrases(rendered)) {
    if (isKnownRewriteStopword(noun) || /^[A-Z]{2,5}$/.test(noun)) continue;
    if (!entityAllowed(noun, allowed)) {
      failures.push(`Unrecognized name/entity: ${noun}`);
    }
  }
  for (const number of extractNumbers(rendered)) {
    if (!allowed.numbers.includes(number)) {
      failures.push(`Unrecognized number/stat: ${number}`);
    }
  }
  if (wordCount(body) > 100) failures.push("Over word limit");
  if (/[—–]/.test(rendered)) failures.push("Em dash used");
  if (sheet.bannedPhrases.some((phrase) => rendered.toLowerCase().includes(phrase.toLowerCase()))) {
    failures.push("Contains banned phrase");
  }
  if (subject && subject.includes("!")) {
    failures.push("Subject line style violation");
  }
  const firstSentence = body.split(/[.?!]/)[0] ?? "";
  if (/\b(Signal|Cross-Brand|Primelis)\b/.test(firstSentence)) {
    failures.push("Opens on product, not prospect");
  }
  if (sheet.proofPoint) {
    const mentions = body.match(new RegExp(`\\b${caseInsensitiveEscape(sheet.proofPoint.company)}\\b`, "gi")) ?? [];
    if (mentions.length > 1) failures.push("Proof company mentioned more than once");
  }
  if (failures.length > 0) {
    return { passed: false, failures };
  }
  return { passed: true, failures };
}

function caseInsensitiveEscape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeHybridSubject(subject: string | undefined, fallback: string | undefined) {
  const clean = stripSingleStepHeader(subject ?? "").replace(/!+/g, "").trim();
  if (!clean) {
    return fallback;
  }
  return clean.charAt(0).toLowerCase() + clean.slice(1);
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

function greeting(input: BuildSequenceInput, intelligence?: ProspectIntelligence) {
  const firstName = input.contactFirstName || intelligence?.prospectName;
  return firstName ? `Hi ${firstName},` : "Hi there,";
}

function displayCompany(input: BuildSequenceInput) {
  return displayCompanyName(input.companyName);
}

function displayCompanyFor(input: BuildSequenceInput, intelligence?: ProspectIntelligence) {
  return displayCompanyName(intelligence?.contextInterpretation.currentCompany ?? intelligence?.companyName ?? input.companyName);
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

function subjectFor(
  input: BuildSequenceInput,
  purpose: SequenceStep["purpose"],
  stepNumber: number,
  intelligence?: ProspectIntelligence,
) {
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
  const company = displayCompanyFor(input, intelligence);
  if (purpose === "FIRST_TOUCH_RELEVANCE" && managesMultipleAccounts(input, intelligence)) {
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

function connectionRequestFor(input: BuildSequenceInput, intelligence?: ProspectIntelligence) {
  return `Hi ${input.contactFirstName || "there"} - had a quick paid-brand question for ${displayCompanyFor(input, intelligence)}. Open to connecting?`;
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

function stripStructuredLeadLabel(value: string) {
  return value
    .replace(
      /^\s*(?:prospect|company|role|context|notes?|serp|keywords?|important)\s*:\s*/i,
      "",
    )
    .trim();
}

function sanitizeProspectFacingFact(value: string) {
  return stripStructuredLeadLabel(value)
    .replace(
      /\b(?:prospect|company|role|context|notes?|serp|keywords?|important)\s*:\s*/gi,
      "",
    )
    .replace(/\bover\s+(\$\d+(?:\.\d+)?[KMB])\+/gi, "over $1")
    .replace(/\s+/g, " ")
    .trim();
}

function directProspectFact(input: BuildSequenceInput, fact: string, prospectName?: string) {
  const firstName = input.contactFirstName?.trim() || prospectName?.trim();
  const company = displayCompany(input);
  const sanitized = sanitizeProspectFacingFact(fact).replace(/\.$/, "");
  if (!firstName || !sanitized) {
    return sanitized;
  }
  const namePrefix = new RegExp(`^${escapeRegExp(firstName)}\\s+`, "i");
  if (!namePrefix.test(sanitized)) {
    return sanitized;
  }
  return sanitized
    .replace(new RegExp(`^${escapeRegExp(firstName)}\\s+at\\s+${escapeRegExp(company)}\\s+has\\b`, "i"), "you have")
    .replace(new RegExp(`^${escapeRegExp(firstName)}\\s+at\\s+${escapeRegExp(company)}\\s+is\\b`, "i"), "you're")
    .replace(new RegExp(`^${escapeRegExp(firstName)}\\s+has\\b`, "i"), "you've")
    .replace(new RegExp(`^${escapeRegExp(firstName)}\\s+is\\b`, "i"), "you're")
    .replace(new RegExp(`^${escapeRegExp(firstName)}\\s+recently\\s+joined\\b`, "i"), "you recently joined")
    .replace(new RegExp(`^(?:now\\s+)?works\\s+at\\s+${escapeRegExp(company)}\\s+managing\\b`, "i"), "you're managing")
    .replace(/^manages\b/i, "you manage")
    .replace(/^owns\b/i, "you own")
    .replace(/^leads\b/i, "you lead")
    .replace(/^runs\b/i, "you run")
    .replace(/^hands-on\b/i, "you're hands-on")
    .replace(namePrefix, "you ")
    .replace(/\band is\b/gi, "and are")
    .replace(/\bmaking him\b/gi, "which may make you")
    .replace(/\bmaking her\b/gi, "which may make you")
    .replace(/\bmaking them\b/gi, "which may make you");
}

function customerFacingAngle(angleLabel: string) {
  return angleLabel
    .replace(/methodology comparison/i, "paid-brand search conditions")
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

function managesMultipleAccounts(input: BuildSequenceInput, intelligence?: ProspectIntelligence) {
  const interpretedCurrentContext = intelligence
    ? [
        ...intelligence.contextInterpretation.currentResponsibilities,
        ...intelligence.contextInterpretation.currentPrioritiesOrInterests,
        ...intelligence.contextInterpretation.currentToolsOrChannels,
        ...intelligence.contextInterpretation.commercialSignals,
      ].map((item) => item.text)
    : [];
  return /\b(agency|managed accounts|multiple accounts|client accounts|portfolio|clients?|accounts your team manages)\b/i.test(
    [
      input.companyContext,
      input.industry,
      input.paidSearchContext,
      input.observedTrigger,
      input.internalNotes,
      ...interpretedCurrentContext,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function roleAngle(input: BuildSequenceInput, intelligence?: ProspectIntelligence) {
  const role = buyerRole(input, intelligence).toLowerCase();
  if (managesMultipleAccounts(input, intelligence) && /paid search|sem|ppc|performance/.test(role)) {
    return "The practical takeaway is not the logo. It is deciding when paid coverage is defensive, and when the auction is quiet enough to lower pressure.";
  }
  if (/paid search|sem|ppc|performance/.test(role)) {
    return "For paid search, the practical decision is when to stay covered, and when bids can potentially be reduced while maintaining coverage.";
  }
  if (/cmo|chief|vp|head|director/.test(role)) {
    return "For a marketing leader, I would frame this as budget control and visibility, not a bid tweak.";
  }
  if (/growth|acquisition|demand/.test(role)) {
    return "For growth, the sharper question is whether paid brand improves acquisition efficiency or just re-buys existing demand.";
  }
  if (/ecommerce|e-commerce|digital/.test(role)) {
    return "For digital commerce, the useful angle is protecting high-intent brand demand when competitive pressure is real, without keeping the same pressure in quieter auctions.";
  }
  return "The practical question is where paid brand is still changing the outcome.";
}

function contestedKeyword(intelligence: ProspectIntelligence) {
  return intelligence.serpEvidence.structuredKeywords.find((keyword) => keyword.status === "contested");
}

function soloKeyword(intelligence: ProspectIntelligence) {
  return intelligence.serpEvidence.structuredKeywords.find((keyword) => keyword.status === "solo");
}

function buildStepFactSheet({
  input,
  records,
  step,
  intelligence,
  ctaIndex,
}: {
  input: BuildSequenceInput;
  records: SequenceKnowledgeRecord[];
  step: SequenceStep;
  intelligence: ProspectIntelligence;
  ctaIndex: number;
}): StepFactSheet {
  const contested = contestedKeyword(intelligence);
  const solo = soloKeyword(intelligence);
  const firstName = input.contactFirstName || intelligence.prospectName || "there";
  return {
    step: step.stepNumber,
    purpose: step.purpose,
    prospect: {
      name: firstName,
      company: displayCompanyFor(input, intelligence),
      title: buyerRole(input, intelligence),
    },
    personalHook: firstPersonalFact(intelligence) ?? null,
    proofPoint: proofPointForStep(records, step.purpose, ctaIndex),
    keywordEvidence: {
      contested: contested
        ? { term: contested.term, competitor: contested.competitor }
        : undefined,
      solo: solo ? { term: solo.term } : undefined,
    },
    cta: step.cta,
    deterministicSubject: step.subjectLine,
    deterministicBody: step.messageBody,
    bannedPhrases: bannedRewritePhrases,
  };
}

function firstPersonalFact(intelligence: ProspectIntelligence) {
  const rankedFacts =
    intelligence.selectedInsights.length > 0
      ? intelligence.selectedInsights.map((insight) => insight.text)
      : intelligence.relevantFacts;
  return rankedFacts
    .map((fact) => sanitizeProspectFacingFact(fact))
    .find((fact) =>
      fact &&
      fact.toLowerCase() !== intelligence.companyName?.toLowerCase() &&
      fact.toLowerCase() !== intelligence.prospectName?.toLowerCase() &&
      fact.toLowerCase() !== intelligence.jobTitle?.toLowerCase() &&
      !/^(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z]{2,})+(?:\/)?\.?$/i.test(fact.trim()) &&
      !(/^[A-Z][A-Za-z' -]{1,50}\.?$/.test(fact) && !/[0-9$]|\b(has|managed|exploring|built|led|owns|runs|responsible)\b/i.test(fact)),
    );
}

function responsibilityOpening({
  input,
  intelligence,
  insight,
}: {
  input: BuildSequenceInput;
  intelligence: ProspectIntelligence;
  insight: string;
}) {
  const normalizedInsight = directProspectFact(input, insight, intelligence.prospectName).replace(/\.$/, "");
  if (!normalizedInsight) return undefined;
  if (/^you(?:'ve| are|'re| have|\s)/i.test(normalizedInsight)) {
    return `${normalizedInsight}, so I wanted to ask one narrow branded-search question.`;
  }
  return `Given ${normalizedInsight}, I wanted to ask one narrow branded-search question.`;
}

function scenarioMethod(input: BuildSequenceInput, intelligence: ProspectIntelligence) {
  const accountScope = managesMultipleAccounts(input, intelligence) ? " across the accounts your team manages" : "";
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
  const company = displayCompanyFor(input, intelligence);
  const fact = firstPersonalFact(intelligence);
  if (intelligence.jobTitle && intelligence.persona !== "OTHER" && hasPromotionSignal(input)) {
    return `Congrats on your promotion to ${intelligence.jobTitle}.`;
  }
  if (fact && intelligence.confidence.prospect !== "LOW") {
    return (
      responsibilityOpening({ input, intelligence, insight: fact }) ??
      `For your ${buyerRole(input, intelligence)} role at ${company}, I would keep this to one narrow branded-search question.`
    );
  }
  if (intelligence.jobTitle && intelligence.persona !== "OTHER") {
    return `For your ${intelligence.jobTitle} role at ${company}, I would keep this to one narrow branded-search question.`;
  }
  return `I had ${company} on my list for one narrow branded-search visibility check.`;
}

function prospectLedInsight(
  input: BuildSequenceInput,
  intelligence: ProspectIntelligence,
  strategy: MessageStrategy,
) {
  if (strategy.openingStyle !== "PROSPECT_FACT") {
    return undefined;
  }
  const firstName = input.contactFirstName?.trim() || intelligence.prospectName?.trim();
  const insight = directProspectFact(input, strategy.prospectInsight, firstName);
  if (!insight || (firstName && insight.toLowerCase() === firstName.toLowerCase())) {
    return undefined;
  }
  return responsibilityOpening({
    input,
    intelligence,
    insight,
  });
}

function strategyFirstTouch(
  input: BuildSequenceInput,
  intelligence: ProspectIntelligence,
  strategy: MessageStrategy,
) {
  const prospectInsight = prospectLedInsight(input, intelligence, strategy) ?? accountOpening(input, intelligence);
  return [
    prospectInsight,
    strategy.productGap,
    `The practical question is: ${strategy.businessQuestion.replace(/\?$/, "")}?`,
  ].join("\n\n");
}

function strategyMethodLine(
  input: BuildSequenceInput,
  intelligence: ProspectIntelligence,
  strategy: MessageStrategy,
) {
  if (intelligence.serpScenario === "UNKNOWN") {
    return [
      strategy.primaryAngle,
      strategy.relevantCapability,
      "That changes the workflow from reading lagging campaign reports to deciding coverage from live Google and Bing search-page conditions.",
    ].join("\n\n");
  }
  return [
    strategy.primaryAngle,
    scenarioMethod(input, intelligence),
  ].join("\n\n");
}

function strategyEvidenceLine(intelligence: ProspectIntelligence) {
  const solo = soloKeyword(intelligence);
  const contested = contestedKeyword(intelligence);
  const soloTerm = solo?.term ?? intelligence.serpEvidence.soloKeywords[0];
  const contestedTerm = contested?.term ?? intelligence.serpEvidence.contestedKeywords[0];
  if (intelligence.serpScenario === "SOLO" && soloTerm) {
    return `The concrete query to review is "${soloTerm}". At the time of the check, the brand appeared alone, which does not prove wasted spend but does create a measurement question for coverage and bid pressure.`;
  }
  if (intelligence.serpScenario === "CONTESTED" && contestedTerm) {
    return `The concrete query to review is "${contestedTerm}". At the time of the check, it was a contested brand auction${contested?.competitor ? ` with ${contested.competitor} visible` : ""}, which is where coverage and bid pressure should be measured.`;
  }
  if (intelligence.serpScenario === "MIXED") {
    const examples = [soloTerm, contestedTerm].filter(Boolean).join(" and ");
    return examples
      ? `In the keyword data, the useful sample is ${examples}: one shows quieter coverage and one shows competition. That is why one static branded-bid rule can miss the decision.`
      : "In the supplied evidence, the useful pattern is mixed: some brand auctions are quieter and some show competition. That is why one static branded-bid rule can miss the coverage and bid decision.";
  }
  return "Without account-specific auction evidence, the narrow first check is to compare when the brand is defending against competition and when there is no competitor pressure. That gives the team visibility into auction changes before changing bids.\n\nSignal works alongside your existing Google Ads setup, without requiring the team to rebuild campaigns or change your current bidding strategy.";
}

function tailorBody(
  input: BuildSequenceInput,
  purpose: SequenceStep["purpose"],
  body: string,
  protectedPhrases: string[] = [],
) {
  const referencePurposes: SequenceStep["purpose"][] = [
    "FIRST_TOUCH_RELEVANCE",
    "PROBLEM_FRAMING",
    "METHODOLOGY_DIFFERENTIATION",
    "SOCIAL_PROOF",
    "BREAKUP_CLOSE_LOOP",
  ];
  if (referencePurposes.includes(purpose)) {
    return stripCommercialTerms(body, protectedPhrases);
  }

  const blocks = body.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const hello = blocks[0]?.startsWith("Hi ") ? blocks[0] : greeting(input);
  const content = blocks[0]?.startsWith("Hi ") ? blocks.slice(1) : blocks;
  const roleSpecific = roleAngle(input);

  if (purpose === "BREAKUP_CLOSE_LOOP") {
    const middle =
      input.desiredTone === "EXECUTIVE"
        ? "If paid-brand efficiency becomes relevant later, the useful starting point is budget visibility: where paid coverage protects demand, and where it is only adding cost."
        : "If paid-brand efficiency becomes relevant later, the useful starting point is simple: where coverage protects demand, and where paid coverage may be broader than needed.";
    return stripCommercialTerms(
      [hello, "I will close the loop here.", middle, "If this is not relevant right now, no problem."]
        .filter(Boolean)
        .join("\n\n"),
      protectedPhrases,
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
      protectedPhrases,
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
      protectedPhrases,
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
      protectedPhrases,
    );
  }

  return stripCommercialTerms(
    [hello, content[0], roleSpecific, ...content.slice(1)].filter(Boolean).join("\n\n"),
    protectedPhrases,
  );
}

function bodyForPurpose({
  input,
  purpose,
  channel,
  ctaIndex,
  records,
  intelligence,
  strategy,
}: {
  input: BuildSequenceInput;
  purpose: SequenceStep["purpose"];
  channel: SequenceStep["channel"];
  ctaIndex: number;
  records: SequenceKnowledgeRecord[];
  intelligence: ProspectIntelligence;
  strategy: MessageStrategy;
}) {
  const company = displayCompanyFor(input, intelligence);
  const safeKeywordPhrases = protectedKeywordPhrases(intelligence);
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
  const isManagedPpcSequence = managesMultipleAccounts(input, intelligence) &&
    /paid search|sem|ppc|performance/.test(buyerRole(input, intelligence).toLowerCase());
  const contested = contestedKeyword(intelligence);
  const solo = soloKeyword(intelligence);
  const managedPpcStepOne = hasPromotionSignal(input)
    ? "One challenge that often becomes harder across multiple accounts is branded-search efficiency. A campaign can look strong while still paying the same CPC when the brand auction is quiet."
    : "One challenge across multiple accounts is branded-search efficiency. A campaign can look strong while still paying the same CPC when the brand auction is quiet.";
  const managedPpcStepTwo = contested
    ? [
        `In the keyword data you supplied, "${contested.term}" was a contested brand auction${contested.competitor ? ` with ${contested.competitor} visible` : ""}.`,
        "That is exactly where maintaining coverage can have defensive value.",
        "The point is not to cut every branded bid. It is to tell contested and solo moments apart across the accounts your team manages.",
      ].join("\n\n")
    : "The same branded query can move between two different auctions.\n\nWhen competitors appear, maintaining coverage has real defensive value. When the brand is alone, the same CPC may be more pressure than needed.\n\nThat is the useful method: identify solo periods across the accounts your team manages, lower pressure only where coverage is still protected, and restore defense when competitors return.";
  const managedPpcStepThree = solo
    ? [
        `The useful sample to show is "${solo.term}". In the keyword data you supplied, it was a solo brand auction.`,
        "That does not prove wasted spend, but it is the kind of moment worth checking before keeping one flat branded bid rule.",
        "Signal works alongside your existing Google Ads setup, without requiring the team to rebuild campaigns or change your current bidding strategy.",
      ].join("\n\n")
    : [
        "For a PPC team, the value is not another dashboard.",
        "It is being able to identify solo and contested periods across multiple accounts, then act without manually checking every SERP.",
        hasScreenshotContext(input) || intelligence.serpScenario !== "UNKNOWN"
          ? screenshotObservation(input, intelligence)
          : "Without account-specific SERP evidence, I would keep this as a visibility check: where does the auction change, and how quickly can bids react?",
        "Signal works alongside your existing Google Ads setup, without requiring the team to rebuild campaigns or change your current bidding strategy.",
      ].join("\n\n");
  const managedPpcProofAngle = "The simplest way to evaluate this is one account with meaningful branded-search spend: compare auction conditions, CPC, and paid coverage needs before discussing anything broader.";
  if (patternBody && purpose === "TECHNICAL_CLARIFICATION") {
    if (channel === "LINKEDIN") {
      return stripCommercialTerms(
        tailorBody(input, purpose, patternBody, safeKeywordPhrases)
          .replace(greeting(input), input.contactFirstName ? `${input.contactFirstName},` : "")
          .replace(/\n\n/g, " ")
          .replace(/\n/g, " ")
          .trim(),
        safeKeywordPhrases,
      );
    }
    return tailorBody(input, purpose, patternBody, safeKeywordPhrases);
  }

  const linesByPurpose: Record<SequenceStep["purpose"], string[]> = {
    FIRST_TOUCH_RELEVANCE: [
      greeting(input, intelligence),
      "",
      isManagedPpcSequence
        ? accountOpening(input, intelligence)
        : strategyFirstTouch(input, intelligence, strategy),
      isManagedPpcSequence ? managedPpcStepOne : "",
    ],
    PROBLEM_FRAMING: [
      greeting(input, intelligence),
      "",
      isManagedPpcSequence
        ? managedPpcStepTwo
        : strategyMethodLine(input, intelligence, strategy),
      isManagedPpcSequence
        ? ""
        : intelligence.persona === "GROWTH"
          ? "For growth teams, the goal is not just lower spend; it is knowing whether paid brand is changing conversion outcomes."
          : "That lets the team adjust coverage with evidence, without assuming every quiet auction means inefficient spend.",
    ],
    METHODOLOGY_DIFFERENTIATION: [
      greeting(input, intelligence),
      "",
      isManagedPpcSequence
        ? managedPpcStepThree
        : strategyEvidenceLine(intelligence),
      isManagedPpcSequence
        ? ""
        : intelligence.serpScenario === "UNKNOWN"
          ? ""
          : "Signal works alongside your existing Google Ads setup, without requiring the team to rebuild campaigns or change your current bidding strategy.",
    ],
    ACCOUNT_SPECIFIC_OBSERVATION: [
      greeting(input, intelligence),
      "",
      `The only assumption I would make about ${company} is a light one: branded-search process may be worth checking.`,
      "I would not pitch that as proof. I would use it as a reason to check whether paid coverage still matches the actual auction pressure.",
    ],
    SOCIAL_PROOF: [
      greeting(input, intelligence),
      "",
      proofLine,
      isManagedPpcSequence ? managedPpcProofAngle : roleAngle(input, intelligence),
    ],
    TECHNICAL_CLARIFICATION: [
      greeting(input, intelligence),
      "",
      "The methodology question is straightforward: before lowering or pausing anything, check live search-page conditions and paid coverage signals together.",
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

  const body = tailorBody(input, purpose, linesByPurpose[purpose].join("\n\n"), safeKeywordPhrases);
  if (channel === "LINKEDIN") {
    return stripFallbackPhrases(
      stripCommercialTerms(
        body
        .replace(greeting(input), input.contactFirstName ? `${input.contactFirstName},` : "")
        .replace(/\n\n/g, " ")
        .replace(/\n/g, " ")
        .trim(),
        safeKeywordPhrases,
      ),
    );
  }
  return stripFallbackPhrases(stripCommercialTerms(body, safeKeywordPhrases));
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
        subjectLine: channel === "EMAIL" ? subjectFor(input, purpose, stepNumber, generation.prospectIntelligence) : undefined,
        connectionRequest:
          channel === "LINKEDIN" && stepNumber === 1 ? connectionRequestFor(input, generation.prospectIntelligence) : undefined,
        messageBody: bodyForPurpose({
          input,
          purpose,
          channel,
          ctaIndex: index,
          records,
          intelligence: generation.prospectIntelligence,
          strategy: generation.messageStrategy,
        }),
        cta,
        imagePlaceholder: undefined,
        imageContextNote:
          purpose === "PROBLEM_FRAMING"
            ? hasScreenshotContext(input)
              ? `Salesperson note: attach or insert the supplied SERP or Signal screenshot outside the email body. Use only the supplied context: ${[input.screenshotContext?.trim(), screenshotObservation(input, generation.prospectIntelligence)].filter(Boolean).join(" ")}`
              : "Salesperson note: attach the relevant prospect SERP screenshot outside the email body before sending. Do not claim unsupported observations."
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
        [
          `Strategy planner: ${generation.messageStrategy.prospectInsight}`,
          generation.messageStrategy.businessQuestion,
          `Gap: ${generation.messageStrategy.productGap}`,
          `Capability: ${generation.messageStrategy.relevantCapability}`,
          `Narrative objectives: ${generation.messageStrategy.sequenceNarrative.map((item) => item.objective).join(" ")}`,
          `Keep the sequence concise and anchored to ${emailAngle}.`,
        ].join(" "),
        protectedKeywordPhrases(generation.prospectIntelligence),
      ),
    };
  }
}

async function rewriteStepWithHybrid({
  provider,
  request,
  step,
  sheet,
  allowed,
  priorFailures,
}: {
  provider: ReturnType<typeof createAiProvider>;
  request: BuildSequenceProviderRequest;
  step: SequenceStep;
  sheet: StepFactSheet;
  allowed: AllowedEntities;
  priorFailures?: string[];
}) {
  const promptFailureLine = priorFailures?.length
    ? `Previous rewrite failed validation for: ${priorFailures.join("; ")}. Fix only those issues.`
    : "";
  const aiResult = await provider.generateDraft({
    workflow: "BUILD_SEQUENCE",
    currentDraft: JSON.stringify({
      subject: step.subjectLine,
      body: step.messageBody,
      cta: step.cta,
    }),
    userInstruction: promptFailureLine,
    context: {
      brief: {
        sequenceLength: 1,
        factSheet: sheet,
        allowedEntities: allowed,
        messageStrategy: request.generation.messageStrategy,
        selectedGoldStandardExamples: request.generation.selectedGoldStandardExamples.map((example) => ({
          id: example.id,
          outcome: example.outcome,
          reasoningTags: example.reasoningTags,
          whyItWorked: example.whyItWorked,
          subject: example.subject,
          body: example.body,
        })),
      },
      writingInstructions: [
        "Rewrite only this one outbound step.",
        "Use only the closed factSheet and allowedEntities. If a fact is not listed, it does not exist for this email.",
        "Follow the messageStrategy for the step objective, new information, and CTA intent.",
        "Use selectedGoldStandardExamples only as reasoning-quality inspiration. Do not copy exact wording, sentence structure, subject pattern, or CTA.",
        "Do not follow a fixed email template. Build the strongest narrative for this specific prospect.",
        "Return exactly one sequenceSteps item.",
        "Keep the required CTA meaning. The application will keep the deterministic CTA field.",
        "Do not add company names, people, competitors, numbers, or claims outside allowedEntities.",
        "Keep body under 100 words. No em dashes. No banned phrases.",
      ],
      approvedFacts: [
        `Prospect: ${sheet.prospect.name}, ${sheet.prospect.title} at ${sheet.prospect.company}`,
        sheet.personalHook ? `Personal detail: ${sheet.personalHook}` : "No personal detail provided.",
        sheet.proofPoint
          ? `Proof point: ${sheet.proofPoint.company}: ${sheet.proofPoint.claim}`
          : "No proof point for this step.",
        sheet.keywordEvidence.contested
          ? `Contested keyword evidence: ${sheet.keywordEvidence.contested.term}${sheet.keywordEvidence.contested.competitor ? ` with ${sheet.keywordEvidence.contested.competitor}` : ""}`
          : "No contested keyword evidence.",
        sheet.keywordEvidence.solo
          ? `Solo keyword evidence: ${sheet.keywordEvidence.solo.term}`
          : "No solo keyword evidence.",
        `Required CTA: ${sheet.cta}`,
      ],
      userProvidedContext: [],
      sourceReferences: request.sourceReferences,
      safetyPolicy: request.generation.safetyNotes,
      outputLanguageInstruction: outputLanguageInstruction(request.input.outputLanguage ?? "ENGLISH"),
    },
  });
  const suggestion = aiResult.sequenceSteps?.[0];
  if (!suggestion) {
    return { step, accepted: false, failures: ["Missing sequence step"] };
  }
  const candidate = {
    ...step,
    subjectLine: step.channel === "EMAIL" ? normalizeHybridSubject(suggestion.subjectLine, step.subjectLine) : undefined,
    messageBody: stripFallbackPhrases(stripCommercialTerms(suggestion.messageBody)),
    cta: step.cta,
  };
  const validation = validateHybridStepRewrite(
    { subject: candidate.subjectLine, body: candidate.messageBody },
    sheet,
    allowed,
  );
  if (!validation.passed) {
    return { step, accepted: false, failures: validation.failures };
  }
  return { step: candidate, accepted: true, failures: [] };
}

async function hybridRewriteSequence({
  provider,
  request,
  result,
}: {
  provider: ReturnType<typeof createAiProvider>;
  request: BuildSequenceProviderRequest;
  result: SequenceGeneration;
}) {
  const rewritten = await Promise.all(result.steps.map(async (step, index) => {
    const sheet = buildStepFactSheet({
      input: request.input,
      records: request.records,
      step,
      intelligence: request.generation.prospectIntelligence,
      ctaIndex: index,
    });
    const allowed = buildAllowedEntities(sheet);
    const diagnostics: NonNullable<BuildSequenceDiagnostics["stepRewriteDiagnostics"]>[number] = {
      stepNumber: step.stepNumber,
      retryUsed: false,
      fallbackUsed: false,
      firstFailures: [],
      retryFailures: [],
    };
    try {
      const firstStarted = nowMs();
      const first = await rewriteStepWithHybrid({ provider, request, step, sheet, allowed });
      diagnostics.firstCallDurationMs = nowMs() - firstStarted;
      if (first.accepted) {
        return {
          step: first.step,
          note: `Hybrid rewrite accepted for step ${step.stepNumber}.`,
          diagnostics,
        };
      }
      diagnostics.firstFailures = first.failures;
      diagnostics.retryUsed = true;
      const retryStarted = nowMs();
      const retry = await rewriteStepWithHybrid({
        provider,
        request,
        step,
        sheet,
        allowed,
        priorFailures: first.failures,
      });
      diagnostics.retryDurationMs = nowMs() - retryStarted;
      if (retry.accepted) {
        return {
          step: retry.step,
          note: `Hybrid rewrite accepted on retry for step ${step.stepNumber}.`,
          diagnostics,
        };
      }
      diagnostics.retryFailures = retry.failures;
      diagnostics.fallbackUsed = true;
      return {
        step,
        note: `Hybrid rewrite fell back for step ${step.stepNumber}: ${retry.failures.join("; ") || first.failures.join("; ")}.`,
        diagnostics,
      };
    } catch (error) {
      const failure = mapAiProviderError(error);
      diagnostics.fallbackUsed = true;
      diagnostics.retryFailures = [failure.message];
      return {
        step,
        note: `Hybrid rewrite fell back for step ${step.stepNumber}: ${failure.message}`,
        diagnostics,
      };
    }
  }));
  return {
    ...result,
    steps: rewritten.map((item) => item.step),
    safetyNotes: [...result.safetyNotes, ...rewritten.map((item) => item.note)],
    diagnostics: {
      ...result.diagnostics,
      stepRewriteDiagnostics: rewritten.map((item) => item.diagnostics),
    },
  };
}

export function createBuildSequenceAiProvider(
  env: NodeJS.ProcessEnv = process.env,
): BuildSequenceAiProvider {
  if (!shouldUseOpenAiProvider(env)) {
    return new DeterministicBuildSequenceProvider();
  }

  return {
    metadata: {
      providerName: "openai",
      modelName: env.OPENAI_MODEL ?? "gpt-5-mini",
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
        return await hybridRewriteSequence({ provider, request, result });
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
