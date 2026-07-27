import { randomUUID } from "node:crypto";

import { z } from "zod";

import {
  channelsForSequence,
  detectSequenceAccountSignals,
  getSequencePersonaGuidance,
  selectSequenceAngle,
} from "@/features/build-sequence/sequence-policy";
import {
  sequenceChannels,
  sequencePurposes,
  sequenceStepChannels,
  sequenceTones,
  type BuildSequenceInput,
  type BuildSequenceResult,
  type SequenceGeneration,
  type SequenceKnowledgeRecord,
  type SequenceSourceReference,
  type SequenceStep,
} from "@/features/build-sequence/types";
import { mergeDefaultSuppressionRecords } from "@/features/do-not-contact/do-not-contact-policy";
import type { DoNotContactRecord } from "@/features/do-not-contact/types";
import { selectProofForContext, validateProofUsage } from "@/features/proof/proof-policy";
import { defaultOutputLanguage, outputLanguages } from "@/lib/output-language";
import { prisma, type MinimalPrismaClient } from "@/lib/prisma";

import {
  createBuildSequenceAiProvider,
  type BuildSequenceAiProvider,
} from "./build-sequence-provider";
import { assertAccountCanGenerate } from "./account-status-service";
import {
  createInitialDraftVersion,
  PrismaDraftVersionPersistence,
} from "./draft-versioning-service";
import { err, ok } from "./result";

const buildSequenceSchema = z.object({
  companyName: z.string().trim().min(1).max(180),
  companyWebsite: z.string().trim().max(240).optional(),
  contactFirstName: z.string().trim().max(80).optional(),
  contactRole: z
    .string()
    .trim()
    .max(160)
    .optional()
    .transform((value) => value || "Head of Performance Marketing"),
  industry: z.string().trim().max(160).optional(),
  companyContext: z
    .string()
    .trim()
    .max(240)
    .optional()
    .transform((value) => value || "Potential fit - validate spend/demand"),
  geographyOrMarkets: z.string().trim().max(240).optional(),
  paidSearchContext: z.string().trim().max(500).optional(),
  currentVendor: z.string().trim().max(160).optional(),
  observedTrigger: z
    .string()
    .trim()
    .max(600)
    .optional()
    .transform((value) => value || "Light discovery before pitching Signal"),
  primaryChannel: z.enum(sequenceChannels),
  sequenceLength: z.union([
    z.literal(4),
    z.coerce.number().pipe(z.literal(4)),
  ]),
  desiredTone: z.enum(sequenceTones),
  desiredOverallDuration: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((value) => value || "12 business days"),
  outputLanguage: z.enum(outputLanguages).optional().default(defaultOutputLanguage),
  accountStatusOverride: z.boolean().optional().default(false),
  internalNotes: z.string().trim().max(1200).optional(),
  screenshotAvailable: z.boolean().optional().default(false),
  screenshotContext: z.string().trim().max(800).optional(),
  brandKeyword: z.string().trim().max(120).optional(),
  marketCountry: z.string().trim().max(120).optional(),
  device: z.string().trim().max(80).optional(),
  observationDate: z.string().trim().max(80).optional(),
  screenshotShows: z.string().trim().max(500).optional(),
  creatorId: z.string().trim().min(1).optional(),
});

const sequenceStepSchema = z.object({
  stepNumber: z.number().int().min(1).max(6),
  channel: z.enum(sequenceStepChannels),
  delay: z.string().trim().min(3).max(120),
  purpose: z.enum(sequencePurposes),
  channelRationale: z.string().trim().min(5).max(240),
  subjectLine: z.string().trim().max(160).optional(),
  connectionRequest: z.string().trim().max(300).optional(),
  messageBody: z.string().trim().min(20).max(1600),
  cta: z.string().trim().max(220),
  imagePlaceholder: z.string().trim().max(120).optional(),
  imageContextNote: z.string().trim().max(1000).optional(),
  claimsUsed: z.array(z.string().trim()).default([]),
  sourceIds: z.array(z.string().trim()).default([]),
});

type Row = Record<string, unknown>;

const requiredBuildSequenceFieldLabels: Record<string, string> = {
  companyName: "Company",
  contactRole: "Buyer role",
  companyContext: "Fit / ICP",
  observedTrigger: "Reason for outreach",
  primaryChannel: "Channel",
  sequenceLength: "Steps",
  desiredTone: "Tone",
  desiredOverallDuration: "Duration",
};

export type BuildSequencePersistence = {
  getActor(actorId: string): Promise<{ id: string; role: string } | null>;
  getSuppressionRecords(): Promise<DoNotContactRecord[]>;
  retrieveEligibleKnowledge(input: BuildSequenceInput): Promise<SequenceKnowledgeRecord[]>;
  persistDraft(input: {
    creatorId: string;
    request: BuildSequenceInput;
    result: Omit<BuildSequenceResult, "draftId">;
  }): Promise<string>;
};

export type BuildSequenceDependencies = {
  provider?: BuildSequenceAiProvider;
  persistence?: BuildSequencePersistence;
};

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asOptionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function containsCompetitorClaim(text: string) {
  return /\b(adthena|revvim|auction insights|better than|beats|versus|competitor claim)\b/i.test(
    text,
  );
}

function containsCommercialTerms(text: string) {
  return /\b(pricing|price|poc|proof of concept|trial|discount|commercial offer)\b/i.test(text);
}

function stripLeadingStepHeader(text: string) {
  return text.replace(/^\s*step\s+\d+\s*(?:[-:–—].*)?\r?\n+/i, "").trim();
}

function sanitizeGeneratedText(text: string) {
  return stripLeadingStepHeader(text)
    .replace(
      /\b(pricing|price|poc|proof of concept|trial|discount|guarantee|guaranteed)\b/gi,
      "commercial details",
    )
    .replace(/\bversus\b/gi, "and")
    .replace(/\bbetter than\b/gi, "different from")
    .replace(/\bbeats\b/gi, "differs from")
    .replace(/\b(adthena|revvim|auction insights)\b/gi, "current tools");
}

function mapKnowledgeRow(row: Row): SequenceKnowledgeRecord {
  return {
    id: asString(row.id),
    title: asString(row.title),
    type: asString(row.type) as SequenceKnowledgeRecord["type"],
    approvalStatus: asOptionalString(row.approvalStatus),
    approvedText:
      asOptionalString(row.approvedWording) ??
      asOptionalString(row.body) ??
      asOptionalString(row.summary) ??
      "",
    channels: asStringArray(row.channels) as SequenceKnowledgeRecord["channels"],
    usageRestrictions: asOptionalString(row.usageRestrictions),
    usageScope: asOptionalString(row.usageScope),
    sourceIds: asStringArray(row.sourceIds),
    sourceTitles: asStringArray(row.sourceTitles),
    sourceDates: asStringArray(row.sourceDates),
  };
}

function allowedKnowledgeChannels(input: BuildSequenceInput) {
  return channelsForSequence(input.primaryChannel);
}

function accountStatusPersistence(persistence: BuildSequencePersistence) {
  return {
    getActor: persistence.getActor.bind(persistence),
    getSuppressionRecords: persistence.getSuppressionRecords.bind(persistence),
    getRecentDrafts: async () => [],
    getRecentAssessments: async () => [],
  };
}

function isKnowledgeItemEligible(record: SequenceKnowledgeRecord, input: BuildSequenceInput) {
  if (record.approvalStatus && record.approvalStatus !== "APPROVED") {
    return false;
  }
  if (record.type === "CASE_STUDY") {
    return isCaseStudyEligible(record);
  }
  if (!record.approvedText.trim() || record.sourceIds.length === 0) {
    return false;
  }
  const allowedChannels = allowedKnowledgeChannels(input);
  if (!(
    record.channels.includes("INTERNAL") ||
    allowedChannels.some((channel) => record.channels.includes(channel))
  )) {
    return false;
  }
  if (record.usageRestrictions?.trim()) {
    return false;
  }
  if (
    record.type === "OBJECTION" &&
    containsCompetitorClaim(`${record.title} ${record.approvedText}`)
  ) {
    return false;
  }
  return true;
}

function isCaseStudyEligible(record: SequenceKnowledgeRecord) {
  return (
    record.type === "CASE_STUDY" &&
    (!record.approvalStatus || record.approvalStatus === "APPROVED") &&
    record.approvedText.trim().length > 0 &&
    record.sourceIds.length > 0
  );
}

function knowledgeRank(record: SequenceKnowledgeRecord, input: BuildSequenceInput) {
  if (record.type !== "CASE_STUDY") {
    return 0;
  }
  const haystack = `${record.title} ${record.approvedText}`.toLowerCase();
  const industry = input.industry?.toLowerCase().trim();
  let rank = 20;
  if (industry && haystack.includes(industry)) {
    rank -= 10;
  }
  if (/fashion|luxury/.test(industry ?? "") && /fashion|luxury|retail/.test(haystack)) {
    rank -= 6;
  }
  if (/saas|software|b2b|data|lead/.test(industry ?? "") && /saas|data|lead|martech/.test(haystack)) {
    rank -= 6;
  }
  if (/retail|e-?commerce|footwear/.test(industry ?? "") && /retail|e-?commerce|footwear/.test(haystack)) {
    rank -= 6;
  }
  return rank;
}

function sourceReferences(records: SequenceKnowledgeRecord[]): SequenceSourceReference[] {
  const references = new Map<string, SequenceSourceReference>();
  for (const record of records) {
    record.sourceIds.forEach((id, index) => {
      if (!references.has(id)) {
        references.set(id, {
          id,
          title: record.sourceTitles[index] ?? id,
          sourceDate: record.sourceDates[index],
        });
      }
    });
  }
  return Array.from(references.values());
}

function knowledgeLimitations(input: BuildSequenceInput, records: SequenceKnowledgeRecord[]) {
  const limitations = new Set<string>();
  if (!input.companyWebsite) {
    limitations.add(
      "Company website was not provided, so account facts are treated conservatively.",
    );
  }
  if (!input.paidSearchContext) {
    limitations.add("No verified paid-search context was provided.");
  }
  if (input.currentVendor) {
    limitations.add(
      "Named vendor context is user-provided; no unsupported vendor claims were used.",
    );
  }
  if (!records.some((record) => record.type === "CASE_STUDY")) {
    limitations.add("No eligible case-study evidence was used in this sequence.");
  }
  if (records.length === 0) {
    limitations.add("No approved eligible Signal knowledge was available for this channel.");
  }
  return Array.from(limitations);
}

function safetyNotes(input: BuildSequenceInput, records: SequenceKnowledgeRecord[]) {
  const notes = new Set<string>();
  const combined = [
    input.currentVendor,
    input.paidSearchContext,
    input.observedTrigger,
    input.internalNotes,
  ]
    .filter(Boolean)
    .join(" ");
  if (containsCompetitorClaim(combined)) {
    notes.add("Vendor-specific claims were excluded unless approved and source-backed.");
  }
  if (containsCommercialTerms(combined)) {
    notes.add("Pricing, POC, trial, discount, and commercial-offer language was blocked.");
  }
  if (records.every((record) => record.type !== "OBJECTION")) {
    notes.add("Vendor objection records were not used.");
  }
  return Array.from(notes);
}

function normalizedMessage(step: SequenceStep) {
  return step.messageBody
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedText(text: string) {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedEntity(text: string) {
  return text
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\.(com|io|co|net|org|ai)$/i, "")
    .replace(/[^a-z0-9]/g, "");
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasVisualContext(input: BuildSequenceInput) {
  return Boolean(
    input.screenshotAvailable &&
      [input.screenshotContext, input.screenshotShows].some((value) => value?.trim()),
  );
}

function normalizedCta(step: SequenceStep) {
  return step.cta
    .toLowerCase()
    .replace(/[^a-z0-9\s?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function questionCount(text: string) {
  return (text.match(/\?/g) ?? []).length;
}

function containsVagueAnonymousCustomerStory(text: string) {
  return /\b(a customer example|one customer found|a client we worked with|we(?:'|’)ve seen with customers|another customer|one customer|a client|one client|a brand we worked with|a team we worked with)\b/i.test(text) ||
    /\b(one|a|another)\s+(customer|client|brand|company|team)\s+(example|found|showed|saw|proved|reduced|cut|saved)\b/i.test(
      text,
    );
}

function containsUnsupportedVisualClaim(text: string) {
  return /\b(screenshot|serp|image|visual|example)\b/i.test(text) &&
    /\bshows|visible|appears|above|below|only advertiser|no other advertiser|solo bidder\b/i.test(
      text,
    );
}

function containsProspectWasteClaim(input: BuildSequenceInput, text: string) {
  const company = escapeRegExp(input.companyName);
  return new RegExp(`\\b${company}\\b.{0,80}\\b(wasting|wasteful|overpaying|unnecessary spend)\\b`, "i").test(
    text,
  );
}

function containsUnsupportedStepOneClaim(input: BuildSequenceInput, step: SequenceStep) {
  const text = `${step.subjectLine ?? ""} ${step.messageBody} ${step.cta}`;
  const verified = [
    input.paidSearchContext,
    input.internalNotes,
    input.screenshotContext,
    input.screenshotShows,
    input.observedTrigger,
  ]
    .filter(Boolean)
    .join(" ");
  const hasSupport = /crowded|competitor|competition|auction|waste|unnecessary spend|spend is high|high spend|weak control|incremental|incrementality/i.test(
    verified,
  );
  if (hasSupport) {
    return false;
  }
  return /\b(crowded|competitors?\s+(?:are\s+)?(?:showing|appearing|present)|waste(?:ful)?|wasting|unnecessary spend|spend is high|high spend|control is weak|weak control|incrementality is poor|poor incrementality|organic already covers|organic covers|organic would have captured)\b/i.test(
    text,
  );
}

function stepHeadingMatches(text: string) {
  return Array.from(text.matchAll(/\bstep\s+([1-6])\b/gi)).map((match) => Number(match[1]));
}

function containsRepeatedStepOrder(text: string, expectedLength: number) {
  const numbers = stepHeadingMatches(text);
  if (numbers.length < expectedLength * 2) {
    return false;
  }
  const expected = Array.from({ length: expectedLength }, (_value, index) => index + 1);
  for (let index = 0; index <= numbers.length - expected.length * 2; index += 1) {
    const first = numbers.slice(index, index + expected.length).join(",");
    const second = numbers.slice(index + expected.length, index + expected.length * 2).join(",");
    if (first === expected.join(",") && second === expected.join(",")) {
      return true;
    }
  }
  return false;
}

function containsStepContamination(step: SequenceStep, expectedLength: number) {
  const body = step.messageBody;
  const headings = stepHeadingMatches(body);
  if (headings.length > 1) {
    return true;
  }
  if (step.stepNumber !== 1 && headings.includes(1)) {
    return true;
  }
  if (containsRepeatedStepOrder(body, expectedLength)) {
    return true;
  }
  if (expectedLength >= 4 && /step\s+1\b[\s\S]*step\s+2\b[\s\S]*step\s+3\b[\s\S]*step\s+4\b/i.test(body)) {
    return true;
  }
  if ((body.match(/\n\s*---+\s*\n/g) ?? []).length > 1) {
    return true;
  }
  return false;
}

function renderedSequenceText(steps: SequenceStep[]) {
  return steps
    .map((step) =>
      [
        `Step ${step.stepNumber} - ${step.delay}`,
        step.subjectLine,
        step.connectionRequest,
        step.imagePlaceholder,
        step.messageBody,
        step.cta,
      ]
        .filter(Boolean)
        .join("\n\n"),
    )
    .join("\n\n---\n\n");
}

function hasDuplicateCompleteSequence(steps: SequenceStep[], generation: SequenceGeneration) {
  const rendered = renderedSequenceText(steps);
  if (containsRepeatedStepOrder(rendered, steps.length)) {
    return true;
  }
  const allText = [
    generation.overallStrategy,
    generation.claimsUsed.join("\n"),
    generation.safetyNotes.join("\n"),
    generation.knowledgeLimitations.join("\n"),
    rendered,
  ].join("\n");
  if (containsRepeatedStepOrder(allText, steps.length)) {
    return true;
  }
  const bodyCounts = new Map<string, number>();
  for (const step of steps) {
    const body = normalizedMessage(step);
    bodyCounts.set(body, (bodyCounts.get(body) ?? 0) + 1);
  }
  return Array.from(bodyCounts.values()).some((count) => count > 1);
}

function ctaIntent(cta: string) {
  const text = normalizedText(cta);
  if (/close|leave|park|timing|no need|not relevant/.test(text)) {
    return "close";
  }
  if (/detect|visibility|track|monitor|see|how often/.test(text)) {
    return "visibility";
  }
  if (/decide|handle|process|evaluate|assess/.test(text)) {
    return "process";
  }
  if (/show|walk|demo|send|share|example|look|review|compare|useful|help/.test(text)) {
    return "show_or_send";
  }
  return text.split(" ").slice(0, 3).join(" ");
}

function hasRepeatedCtaIntent(steps: SequenceStep[]) {
  const intents = steps.map((step) => ctaIntent(step.cta)).filter(Boolean);
  const nonCloseIntents = intents.filter((intent) => intent !== "close");
  return (
    nonCloseIntents.length >= 3 &&
      nonCloseIntents.filter((intent) => intent === "show_or_send").length >=
        nonCloseIntents.length - 1
  );
}

function hasFinalStepPitchRestart(finalStep: SequenceStep) {
  const text = normalizedText(`${finalStep.messageBody} ${finalStep.cta}`);
  return /\b(monitors?|google ads|search console|bing|competitors?|pause|reduce bids|restore coverage|case study|reduced|saved|mql|sql|revenue|clicks|walkthrough|framework|methodology|example)\b/.test(
    text,
  );
}

function containsVagueLanguage(text: string) {
  return /\b(conversion-source data|outcome data|paid brand line|cleaner read|cleaner bid decision|the angle|setup pattern|plain example|the point wasn(?:'|’)t to|the first question is simple|i haven(?:'|’)t tried to over-explain this|demand capture versus spend that is simply there|real work|doing more work than it should|live search-result monitoring to separate demand capture)\b/i.test(
    text,
  );
}

function selectedStepTwoMode(input: BuildSequenceInput, records: SequenceKnowledgeRecord[]) {
  if (hasVisualContext(input)) {
    return "VISUAL" as const;
  }
  if (
    records.some(
      (record) => record.type === "CASE_STUDY" && textHasApprovedMetric(record.approvedText),
    )
  ) {
    return "PROOF" as const;
  }
  return "DIAGNOSTIC" as const;
}

function textHasApprovedMetric(text: string) {
  return /\b\d+(?:\.\d+)?\s*%|\bMQL\b|\bSQL\b|\brevenue\b|\bclicks?\b|\bCPC\b/i.test(text);
}

function validateStepOneReference(step: SequenceStep) {
  const text = `${step.messageBody} ${step.cta}`;
  return (
    /how do you decide|how do you currently|do you currently have visibility/i.test(text) &&
    /Signal monitors live Google and Bing|Signal monitors live/i.test(text) &&
    questionCount(text) <= 2 &&
    !/case study|example|screenshot|\[Insert relevant SERP/i.test(text)
  );
}

function validateStepTwoReference(
  input: BuildSequenceInput,
  step: SequenceStep,
  records: SequenceKnowledgeRecord[],
) {
  const mode = selectedStepTwoMode(input, records);
  const text = `${step.imagePlaceholder ?? ""} ${step.messageBody} ${step.cta}`;
  if (mode === "VISUAL") {
    const visualClaimSentences = text
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) =>
        new RegExp(`\\b${escapeRegExp(input.companyName)}\\b`, "i").test(sentence),
      );
    return (
      step.imagePlaceholder === "[Insert relevant SERP or Signal screenshot here]" &&
      /in this (?:supplied )?example|example of the type of moment/i.test(text) &&
      !visualClaimSentences.some((sentence) =>
        /\b(?:is|shows|appears).*\b(?:only advertiser|no other advertiser|solo bidder)\b/i.test(
          sentence,
        ),
      )
    );
  }
  if (mode === "PROOF") {
    const proofCompanies = caseStudyCompanies(records);
    return (
      proofCompanies.some((company) => new RegExp(`\\b${escapeRegExp(company)}\\b`, "i").test(text)) &&
      textHasApprovedMetric(text) &&
      !containsVagueAnonymousCustomerStory(text)
    );
  }
  return (
    /often remains unchanged|can change during the day|visibility question|diagnostic/i.test(text) &&
    !textHasApprovedMetric(text) &&
    !containsVagueAnonymousCustomerStory(text) &&
    !caseStudyCompanies(records).some((company) =>
      new RegExp(`\\b${escapeRegExp(company)}\\b`, "i").test(text),
    )
  );
}

function validateStepThreeReference(step: SequenceStep) {
  const text = `${step.messageBody} ${step.cta}`;
  return (
    /competitor presence|competitors? (?:are )?(?:present|return)|competition returns/i.test(text) &&
    /pause|lower(?:s)? (?:the )?bid|reduce(?:s)? bids/i.test(text) &&
    /coverage (?:is )?(?:adjusted|restored|comes back)|competition returns/i.test(text) &&
    !textHasApprovedMetric(text)
  );
}

function validateStepFourReference(step: SequenceStep) {
  const text = `${step.messageBody} ${step.cta}`;
  return (
    /close the loop|close/i.test(text) &&
    /already.*manage|not.*priority|no problem|timing/i.test(text) &&
    !/case study|\b\d+(?:\.\d+)?\s*%|\bMQL\b|\bSQL\b|\brevenue\b|\bclicks?\b|\bCPC\b/i.test(text)
  );
}

function hasEntityMismatch(
  input: BuildSequenceInput,
  steps: SequenceStep[],
  records: SequenceKnowledgeRecord[],
) {
  const allowedCompany = normalizedEntity(input.companyName);
  const allowedDomain = input.companyWebsite ? normalizedEntity(input.companyWebsite) : "";
  const proofCompanies = caseStudyCompanies(records).map(normalizedEntity);
  const allowedEntities = new Set(
    [allowedCompany, allowedDomain, ...proofCompanies].filter((entity) => entity.length > 1),
  );
  const knownAccountNames = [
    "nike",
    "booking",
    "bookingcom",
    "uber",
    "mango",
    "apollo",
    "brex",
    "monday",
    "mondaycom",
    "crocs",
    "chloe",
    "dior",
    "ninjatrader",
  ];

  for (const step of steps) {
    const greeting = step.messageBody.match(/\bhi\s+([a-z][a-z'-]{1,40})\b/i);
    if (
      input.contactFirstName &&
      greeting?.[1] &&
      !["there", input.contactFirstName.toLowerCase()].includes(greeting[1].toLowerCase())
    ) {
      return true;
    }
  }

  const finalText = `${steps.at(-1)?.subjectLine ?? ""} ${steps.at(-1)?.messageBody ?? ""} ${steps.at(-1)?.cta ?? ""}`;
  for (const account of knownAccountNames) {
    if (allowedEntities.has(account)) {
      continue;
    }
    if (new RegExp(`\\b${escapeRegExp(account)}(?:\\.com)?\\b`, "i").test(finalText)) {
      return true;
    }
  }
  return false;
}

function similarity(a: string, b: string) {
  const aWords = new Set(a.split(" ").filter((word) => word.length > 3));
  const bWords = new Set(b.split(" ").filter((word) => word.length > 3));
  if (aWords.size === 0 || bWords.size === 0) {
    return 0;
  }
  const intersection = Array.from(aWords).filter((word) => bWords.has(word)).length;
  return intersection / Math.min(aWords.size, bWords.size);
}

function caseStudyCompanies(records: SequenceKnowledgeRecord[]) {
  return records
    .filter((record) => record.type === "CASE_STUDY")
    .map((record) => {
      const match = record.approvedText.match(/Case study:\s*([^.]*)\./i);
      const approvedTextCompany = record.approvedText.match(
        /^\s*([A-Z][A-Za-z0-9&'. -]{1,60}?)\s+(?:cut|cuts|reduced|reduces|lowered|lowers|improved|improves|grew|increased|protected|saved|decreased)\b/,
      );
      return (
        match?.[1] ??
        approvedTextCompany?.[1] ??
        record.title.split(/\s+(?:cuts|reduces|lowers|improves|leads)\s+/i)[0]
      )
        .trim();
    })
    .filter((company) => company.length > 1);
}

function hasMultipleProofCompanies(generation: SequenceGeneration, records: SequenceKnowledgeRecord[]) {
  const rendered = JSON.stringify({
    overallStrategy: generation.overallStrategy,
    claimsUsed: generation.claimsUsed,
    steps: generation.steps,
  }).toLowerCase();
  const mentioned = new Set(
    caseStudyCompanies(records)
      .filter((company) => rendered.includes(company.toLowerCase()))
      .map((company) => company.toLowerCase()),
  );
  return mentioned.size > 1;
}

function validateSequenceGeneration(
  input: BuildSequenceInput,
  generation: SequenceGeneration,
  records: SequenceKnowledgeRecord[] = [],
) {
  const fail = (reason?: string) => {
    void reason;
    return false;
  };
  const parsedSteps = z.array(sequenceStepSchema).safeParse(generation.steps);
  if (!parsedSteps.success) {
    return fail("schema");
  }

  const steps = parsedSteps.data;
  if (steps.length !== input.sequenceLength) {
    return fail("length");
  }
  const stepNumbers = steps.map((step) => step.stepNumber);
  if (!stepNumbers.every((stepNumber, index) => stepNumber === index + 1)) {
    return fail("order");
  }
  const purposes = new Set(steps.map((step) => step.purpose));
  if (purposes.size !== steps.length) {
    return fail("purposes");
  }
  const allowedChannels = channelsForSequence(input.primaryChannel);
  if (!steps.every((step) => allowedChannels.includes(step.channel))) {
    return fail("channel");
  }
  if (hasDuplicateCompleteSequence(steps, generation)) {
    return fail("duplicate-sequence");
  }
  if (steps.some((step) => containsStepContamination(step, input.sequenceLength))) {
    return fail("contamination");
  }
  if (hasEntityMismatch(input, steps, records)) {
    return fail("entity");
  }
  if (
    input.primaryChannel === "MIXED" &&
    !(
      steps.some((step) => step.channel === "EMAIL") &&
      steps.some((step) => step.channel === "LINKEDIN")
    )
  ) {
    return fail("mixed");
  }
  const normalized = steps.map(normalizedMessage);
  for (let index = 0; index < normalized.length; index += 1) {
    for (let compare = index + 1; compare < normalized.length; compare += 1) {
      if (similarity(normalized[index], normalized[compare]) > 0.9) {
        return fail("similarity");
      }
    }
  }
  const ctas = steps.map(normalizedCta).filter(Boolean);
  if (new Set(ctas).size !== ctas.length) {
    return fail("duplicate-cta");
  }
  if (hasRepeatedCtaIntent(steps)) {
    return fail("cta-intent");
  }
  if (steps.some((step) => questionCount(`${step.messageBody} ${step.cta}`) > 2)) {
    return fail("questions");
  }
  if (steps.some((step) => questionCount(step.cta) > 1)) {
    return fail("cta-questions");
  }
  if (steps.some((step) => containsVagueAnonymousCustomerStory(step.messageBody))) {
    return fail("anonymous");
  }
  if (steps.some((step) => containsVagueLanguage(`${step.subjectLine ?? ""} ${step.messageBody} ${step.cta}`))) {
    return fail("vague");
  }
  if (steps[0] && containsUnsupportedStepOneClaim(input, steps[0])) {
    return fail("step1-claim");
  }
  if (!validateStepOneReference(steps[0])) {
    return fail("step1-reference");
  }
  if (!validateStepTwoReference(input, steps[1], records)) {
    return fail("step2-reference");
  }
  if (!validateStepThreeReference(steps[2])) {
    return fail("step3-reference");
  }
  if (!validateStepFourReference(steps[3])) {
    return fail("step4-reference");
  }
  if (!hasVisualContext(input)) {
    if (steps.some((step) => step.imagePlaceholder || step.imageContextNote)) {
      return fail("unexpected-image");
    }
    if (steps.some((step) => containsUnsupportedVisualClaim(step.messageBody))) {
      return fail("unsupported-visual");
    }
  }
  if (hasVisualContext(input)) {
    const stepTwo = steps[1];
    if (!stepTwo?.imagePlaceholder?.includes("[Insert relevant SERP or Signal screenshot here]")) {
      return fail("image-placeholder");
    }
    if (!stepTwo.imageContextNote) {
      return fail("image-note");
    }
  }
  if (steps.some((step) => containsProspectWasteClaim(input, step.messageBody))) {
    return fail("waste");
  }
  if (
    steps.length >= 4 &&
    !(
      steps[0].purpose === "FIRST_TOUCH_RELEVANCE" &&
      steps[1].purpose === "PROBLEM_FRAMING" &&
      steps[2].purpose === "METHODOLOGY_DIFFERENTIATION" &&
      steps.at(-1)?.purpose === "BREAKUP_CLOSE_LOOP"
    )
  ) {
    return fail("progression");
  }
  const finalStep = steps[steps.length - 1];
  const longestEarlierLength = Math.max(
    ...steps.slice(0, -1).map((step) => step.messageBody.length),
  );
  if (finalStep.messageBody.length > longestEarlierLength) {
    return fail("final-length");
  }
  if (
    finalStep.purpose !== "BREAKUP_CLOSE_LOOP" ||
    !/close the loop|not relevant|no problem|leave this|park this|timing|circle back/i.test(
      `${finalStep.messageBody} ${finalStep.cta}`,
    )
  ) {
    return fail("final-close");
  }
  if (hasFinalStepPitchRestart(finalStep)) {
    return fail("final-pitch");
  }
  const rendered = JSON.stringify({
    overallStrategy: generation.overallStrategy,
    claimsUsed: generation.claimsUsed,
    steps: generation.steps,
  });
  if (containsCommercialTerms(rendered) || containsCompetitorClaim(rendered)) {
    return fail("restricted");
  }
  if (hasMultipleProofCompanies(generation, records)) {
    return fail("proof-companies");
  }
  return true;
}

function sanitizeSequenceGeneration(generation: SequenceGeneration): SequenceGeneration {
  return {
    ...generation,
    overallStrategy: sanitizeGeneratedText(generation.overallStrategy),
    claimsUsed: generation.claimsUsed.map(sanitizeGeneratedText),
    steps: generation.steps.map((step) => ({
      ...step,
      subjectLine: step.subjectLine ? sanitizeGeneratedText(step.subjectLine) : undefined,
      connectionRequest: step.connectionRequest
        ? sanitizeGeneratedText(step.connectionRequest)
        : undefined,
      messageBody: sanitizeGeneratedText(step.messageBody),
      cta: sanitizeGeneratedText(step.cta),
      claimsUsed: step.claimsUsed.map(sanitizeGeneratedText),
    })),
  };
}

function openAiFallbackReason(providerName: string, notes: string[]) {
  if (providerName !== "openai") {
    return undefined;
  }
  return notes.find((note) =>
    /fallback was used|provider failed|not configured|authentication failed|rate limit|model was not found|OpenAI rejected|OpenAI request failed|could not parse|did not match the app schema/i.test(
      note,
    ),
  );
}

export class PrismaBuildSequencePersistence implements BuildSequencePersistence {
  constructor(private readonly client: MinimalPrismaClient = prisma) {}

  async getActor(actorId: string) {
    const rows = await this.client.$queryRaw<Row[]>`
      SELECT id, role
      FROM "User"
      WHERE id = ${actorId}
      LIMIT 1
    `;
    const row = rows[0];
    return row ? { id: asString(row.id), role: asString(row.role) } : null;
  }

  async getSuppressionRecords() {
    const rows = await this.client.$queryRaw<Row[]>`
      SELECT id, "companyName", domain, status, "accountOwner", reason, notes, "lastContactDate"::text AS "lastContactDate"
      FROM "SuppressionRecord"
    `;
    const records = rows.map((row) => ({
      id: asString(row.id),
      companyName: asString(row.companyName),
      domain: asString(row.domain) || undefined,
      status: asString(row.status) as DoNotContactRecord["status"],
      owner: asString(row.accountOwner) || undefined,
      reason: asString(row.reason) || undefined,
      notes: asString(row.notes) || undefined,
      lastContactDate: asString(row.lastContactDate) || undefined,
    }));
    return mergeDefaultSuppressionRecords(records);
  }

  async retrieveEligibleKnowledge(input: BuildSequenceInput) {
    const rows = await this.client.$queryRaw<Row[]>`
      SELECT
        ki.id,
        ki.title,
        ki.type,
        ki."approvalStatus",
        ki."approvedWording",
        ki.body,
        ki.summary,
        ki.channels,
        ki."usageRestrictions",
        NULL::text AS "usageScope",
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT s.id), NULL) AS "sourceIds",
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT s.title), NULL) AS "sourceTitles",
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT s."sourceDate"::text), NULL) AS "sourceDates"
      FROM "KnowledgeItem" ki
      LEFT JOIN "_KnowledgeItemSources" kis ON kis."A" = ki.id
      LEFT JOIN "SourceDocument" s ON s.id = kis."B"
      WHERE ki."approvalStatus" = 'APPROVED'
        AND ki.type IN ('PRODUCT_TRUTH', 'MESSAGE_EXAMPLE', 'OBJECTION')
      GROUP BY ki.id

      UNION ALL

      SELECT
        cs.id,
        cs.title,
        'CASE_STUDY' AS type,
        cs."approvalStatus",
        COALESCE(
          cs."approvedExternalWording",
          CONCAT_WS(
            ' ',
            'Case study: ' || cs."companyName" || '.',
            NULLIF(cs."initialProblem", ''),
            NULLIF(cs."signalApproach", ''),
            CASE
              WHEN COUNT(i.id) > 0 THEN 'Industries: ' || STRING_AGG(DISTINCT i.name, ', ')
              ELSE NULL
            END,
            CASE
              WHEN COUNT(csm.id) > 0 THEN
                'Metrics: ' || STRING_AGG(
                  DISTINCT COALESCE(
                    csm."approvedWording",
                    csm."metricName" || ' ' ||
                      CASE csm.direction
                        WHEN 'DECREASE' THEN 'decreased'
                        WHEN 'INCREASE' THEN 'increased'
                        WHEN 'NEUTRAL' THEN 'stayed stable'
                        ELSE 'changed'
                      END ||
                      CASE
                        WHEN csm.value IS NOT NULL AND LOWER(COALESCE(csm.unit, '')) = 'percent' THEN ' by ' || csm.value || '%'
                        WHEN csm.value IS NOT NULL THEN ' by ' || csm.value || COALESCE(' ' || csm.unit, '')
                        ELSE ''
                      END ||
                      COALESCE(' ' || csm.comparison, '')
                  ),
                  '; '
                )
              ELSE NULL
            END,
            'Approved by Primelis for outbound social proof. Frame metrics as observed outcomes, not guarantees.'
          )
        ) AS "approvedWording",
        cs."signalApproach" AS body,
        cs."initialProblem" AS summary,
        ARRAY['EMAIL', 'LINKEDIN']::"Channel"[] AS channels,
        cs."usageRestrictions",
        cs."usageScope"::text AS "usageScope",
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT s.id), NULL) AS "sourceIds",
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT s.title), NULL) AS "sourceTitles",
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT s."sourceDate"::text), NULL) AS "sourceDates"
      FROM "CaseStudy" cs
      LEFT JOIN "_CaseStudySources" css ON css."A" = cs.id
      LEFT JOIN "SourceDocument" s ON s.id = css."B"
      LEFT JOIN "CaseStudyMetric" csm ON csm."caseStudyId" = cs.id
      LEFT JOIN "_CaseStudyIndustries" csi ON csi."A" = cs.id
      LEFT JOIN "Industry" i ON i.id = csi."B"
      WHERE cs."approvalStatus" = 'APPROVED'
      GROUP BY cs.id
      ORDER BY title ASC
    `;
    return rows
      .map(mapKnowledgeRow)
      .filter((record) => {
        if (record.type === "CASE_STUDY") {
          return isCaseStudyEligible(record);
        }
        return isKnowledgeItemEligible(record, input);
      })
      .sort((a, b) => knowledgeRank(a, input) - knowledgeRank(b, input));
  }

  async persistDraft({
    creatorId,
    request,
    result,
  }: {
    creatorId: string;
    request: BuildSequenceInput;
    result: Omit<BuildSequenceResult, "draftId">;
  }) {
    const id = randomUUID();
    await this.client.$executeRaw`
      INSERT INTO "GeneratedDraft" (
        id,
        "userId",
        workflow,
        "promptSnapshot",
        "inputSnapshot",
        "draftContent",
        "alternativeContent",
        "retrievedKnowledgeIds",
        "sourceIds",
        "providerName",
        "modelName",
        "draftStatus",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${id},
        ${creatorId},
        'BUILD_SEQUENCE',
        ${JSON.stringify({
          workflow: "BUILD_SEQUENCE",
          overallStrategy: result.overallStrategy,
          selectedAngle: result.selectedAngle,
          personaEmphasis: result.personaEmphasis,
          sequenceLength: result.sequenceLength,
          overallDuration: result.overallDuration,
          safetyNotes: result.safetyNotes,
        })},
        ${JSON.stringify({ ...request, generatedSequence: result.steps })}::jsonb,
        ${JSON.stringify(result.steps)},
        ${result.overallStrategy},
        ${result.recordsUsed.map((record) => record.id)}::text[],
        ${result.sourceReferences.map((source) => source.id)}::text[],
        ${result.provider.providerName},
        ${result.provider.modelName},
        'DRAFT'::"GeneratedDraftStatus",
        NOW(),
        NOW()
      )
    `;
    await createInitialDraftVersion(
      { generatedDraftId: id, creatorId },
      { persistence: new PrismaDraftVersionPersistence(this.client) },
    );
    return id;
  }
}

export async function generateBuildSequence(
  rawInput: unknown,
  dependencies: BuildSequenceDependencies = {},
) {
  const parsed = buildSequenceSchema.safeParse(rawInput);
  if (!parsed.success) {
    const missingOrInvalidFields = Array.from(
      new Set(
        parsed.error.issues.map((issue) => {
          const field = String(issue.path[0] ?? "");
          return requiredBuildSequenceFieldLabels[field] ?? field;
        }),
      ),
    ).filter(Boolean);
    const message = missingOrInvalidFields.length
      ? `Build Sequence needs: ${missingOrInvalidFields.join(", ")}.`
      : "Build Sequence input is malformed.";
    return err("VALIDATION_ERROR", message);
  }

  const input = parsed.data;
  const creatorId = input.creatorId ?? "seed-sales-user";
  const persistence = dependencies.persistence ?? new PrismaBuildSequencePersistence();
  const actor = await persistence.getActor(creatorId);
  if (!actor || !["SALES_USER", "KNOWLEDGE_ADMIN"].includes(actor.role)) {
    return err("FORBIDDEN", "Only authorized sales or knowledge users can build sequences.");
  }

  const accountStatus = await assertAccountCanGenerate(
    {
      companyName: input.companyName,
      companyDomain: input.companyWebsite,
      overrideRequested: input.accountStatusOverride,
      creatorId,
    },
    dependencies.persistence ? { persistence: accountStatusPersistence(persistence) } : {},
  );
  if (!accountStatus.ok) {
    return accountStatus;
  }

  const provider = dependencies.provider ?? createBuildSequenceAiProvider();
  const eligibleRecords = (await persistence.retrieveEligibleKnowledge(input)).filter((record) => {
    if (record.type === "CASE_STUDY") {
      return isCaseStudyEligible(record);
    }
    return isKnowledgeItemEligible(record, input);
  });
  const proofSelection = selectProofForContext(eligibleRecords, {
    workflow: "BUILD_SEQUENCE",
    companyName: input.companyName,
    industry: input.industry,
    contactRole: input.contactRole,
    question: input.observedTrigger,
    conversation: `${input.companyContext ?? ""} ${input.paidSearchContext ?? ""} ${input.internalNotes ?? ""}`,
    requestedProof: true,
  });
  const records = proofSelection.records as SequenceKnowledgeRecord[];
  const sources = sourceReferences(records);
  const selected = selectSequenceAngle(input);
  const baseGeneration = {
    overallStrategy: "",
    selectedAngle: selected.angle,
    angleRationale: selected.rationale,
    personaEmphasis: getSequencePersonaGuidance(input.contactRole),
    detectedAccountSignals: detectSequenceAccountSignals(input),
    safetyNotes: [...safetyNotes(input, records), ...proofSelection.notes],
    knowledgeLimitations: knowledgeLimitations(input, records),
  };
  const generated = sanitizeSequenceGeneration(
    await provider.generate({
      input,
      records,
      sourceReferences: sources,
      generation: baseGeneration,
    }),
  );
  const fallbackReason = openAiFallbackReason(provider.metadata.providerName, generated.safetyNotes);
  if (fallbackReason) {
    return err(
      "AI_PROVIDER_FAILED",
      `OpenAI did not generate this sequence. ${fallbackReason}`,
    );
  }

  if (!validateSequenceGeneration(input, generated, records)) {
    return err("GENERATION_REJECTED", "Generated sequence failed safety or quality validation.");
  }
  const proofValidation = validateProofUsage({
    output: JSON.stringify({
      overallStrategy: generated.overallStrategy,
      claimsUsed: generated.claimsUsed,
      steps: generated.steps,
    }),
    selectedProof: proofSelection.selectedProof,
    availableProofRecords: eligibleRecords,
    maxMetricMentions: input.sequenceLength > 4 ? 2 : 1,
  });
  if (!proofValidation.ok) {
    return err("GENERATION_REJECTED", `Generated sequence failed proof validation. ${proofValidation.reason}`);
  }

  const resultWithoutId = {
    ...generated,
    sequenceLength: input.sequenceLength,
    overallDuration: input.desiredOverallDuration,
    recordsUsed: records,
    sourceReferences: sources,
    provider: provider.metadata,
  };
  const draftId = await persistence.persistDraft({
    creatorId,
    request: input,
    result: resultWithoutId,
  });

  return ok<BuildSequenceResult>({
    draftId,
    ...resultWithoutId,
  });
}
