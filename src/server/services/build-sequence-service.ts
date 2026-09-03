import { randomUUID } from "node:crypto";

import { z } from "zod";

import {
  channelsForSequence,
  detectSequenceAccountSignals,
  getSequencePersonaGuidance,
  selectSequenceAngle,
} from "@/features/build-sequence/sequence-policy";
import { buildProspectIntelligence } from "@/features/build-sequence/prospect-intelligence";
import { selectGoldStandardExamples } from "@/features/build-sequence/gold-standard-examples";
import {
  factsFromExtraction,
  mergeProspectRecord,
  normalizeDomain,
  normalizeLinkedInUrl,
  resolveIdentity,
} from "@/features/build-sequence/prospect-memory";
import {
  sequenceChannels,
  sequencePurposes,
  sequenceStepChannels,
  sequenceTones,
  type BuildSequenceDiagnostics,
  type BuildSequenceInput,
  type BuildSequenceResult,
  type ExtractedFact,
  type IdentityResolution,
  type ProspectExtraction,
  type ProspectMemory,
  type ProspectRecord,
  type ProspectSource,
  type ProspectSourceType,
  type SequenceGeneration,
  type SequenceKnowledgeRecord,
  type SequenceSourceReference,
  type SequenceStep,
} from "@/features/build-sequence/types";
import type { AccountStatusResult } from "@/features/account-status/types";
import { mergeDefaultSuppressionRecords } from "@/features/do-not-contact/do-not-contact-policy";
import type { DoNotContactRecord } from "@/features/do-not-contact/types";
import { selectProofForContext } from "@/features/proof/proof-policy";
import { defaultOutputLanguage, outputLanguages } from "@/lib/output-language";
import { prisma, type MinimalPrismaClient } from "@/lib/prisma";

import {
  createBuildSequenceAiProvider,
  DeterministicBuildSequenceProvider,
  type BuildSequenceAiProvider,
} from "./build-sequence-provider";
import { checkAccountStatus } from "./account-status-service";
import {
  createInitialDraftVersion,
  PrismaDraftVersionPersistence,
} from "./draft-versioning-service";
import {
  extractProspectSemantic,
  type SemanticExtractionProvider,
} from "./prospect-semantic-intake";
import {
  planAiMessageStrategy,
  type AiMessageStrategyProvider,
} from "./message-strategy-planner";
import { err, ok } from "./result";

const buildSequenceSchema = z
  .object({
    rawProspectContext: z.string().trim().max(12000).optional(),
    prospectId: z.string().trim().max(120).optional(),
    companyName: z.string().trim().max(180).optional().default(""),
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
    prospectContext: z.string().trim().max(6000).optional(),
    serpEvidence: z.string().trim().max(3000).optional(),
    keywords: z
      .array(
        z.object({
          term: z.string().trim().max(120),
          status: z.enum(["solo", "contested"]),
          competitor: z.string().trim().max(120).optional(),
          note: z.string().trim().max(240).optional(),
        }),
      )
      .max(5)
      .optional()
      .transform((keywords) =>
        keywords
          ?.map((keyword) => ({
            ...keyword,
            competitor: keyword.competitor || undefined,
            note: keyword.note || undefined,
          }))
          .filter((keyword) => keyword.term),
      ),
    internalNotes: z.string().trim().max(1200).optional(),
    screenshotAvailable: z.boolean().optional().default(false),
    screenshotContext: z.string().trim().max(800).optional(),
    brandKeyword: z.string().trim().max(120).optional(),
    marketCountry: z.string().trim().max(120).optional(),
    device: z.string().trim().max(80).optional(),
    observationDate: z.string().trim().max(80).optional(),
    screenshotShows: z.string().trim().max(500).optional(),
    creatorId: z.string().trim().min(1).optional(),
  })
  .superRefine((value, context) => {
    if (!value.companyName && !value.rawProspectContext) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["companyName"],
        message: "Company or prospect context is required.",
      });
    }
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
  getRecentDrafts?(): Promise<
    Array<{
      id: string;
      workflow: string;
      companyName?: string;
      companyDomain?: string;
      createdAt?: string;
    }>
  >;
  getRecentAssessments?(): Promise<
    Array<{
      id: string;
      companyName: string;
      domain?: string;
      qualificationResult: string;
      recommendedNextAction?: string;
      createdAt?: string;
    }>
  >;
  retrieveEligibleKnowledge(input: BuildSequenceInput): Promise<SequenceKnowledgeRecord[]>;
  listProspects?(creatorId: string): Promise<ProspectRecord[]>;
  createProspectMemory?(input: {
    creatorId: string;
    extraction: ProspectExtraction;
    rawText: string;
    sourceType?: ProspectSourceType;
    identityResolution: IdentityResolution;
  }): Promise<ProspectMemory>;
  updateProspectMemory?(input: {
    prospectId: string;
    extraction: ProspectExtraction;
    rawText: string;
    sourceType?: ProspectSourceType;
    identityResolution: IdentityResolution;
  }): Promise<ProspectMemory>;
  persistDraft(input: {
    creatorId: string;
    prospectId?: string;
    request: BuildSequenceInput;
    result: Omit<BuildSequenceResult, "draftId">;
  }): Promise<string>;
};

export type BuildSequenceDependencies = {
  provider?: BuildSequenceAiProvider;
  persistence?: BuildSequencePersistence;
  semanticExtractionProvider?: SemanticExtractionProvider;
  messageStrategyProvider?: AiMessageStrategyProvider;
};

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asOptionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asIsoString(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" && value.length > 0 ? value : new Date().toISOString();
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function mapProspectRow(row: Row): ProspectRecord {
  return {
    id: asString(row.id),
    firstName: asOptionalString(row.firstName),
    lastName: asOptionalString(row.lastName),
    fullName: asOptionalString(row.fullName),
    email: asOptionalString(row.email),
    jobTitle: asOptionalString(row.jobTitle),
    companyName: asOptionalString(row.companyName),
    companyDomain: asOptionalString(row.companyDomain),
    linkedinUrl: asOptionalString(row.linkedinUrl),
    status: asString(row.status) as ProspectRecord["status"],
    createdAt: asIsoString(row.createdAt),
    updatedAt: asIsoString(row.updatedAt),
  };
}

function mapProspectSourceRow(row: Row): ProspectSource {
  return {
    id: asString(row.id),
    prospectId: asString(row.prospectId),
    type: asString(row.type) as ProspectSource["type"],
    rawContent: asString(row.rawContent),
    sourceLabel: asOptionalString(row.sourceLabel),
    sourceUrl: asOptionalString(row.sourceUrl),
    createdAt: asIsoString(row.createdAt),
  };
}

function serpEvidenceText(extraction: ProspectExtraction) {
  return extraction.serpEvidence
    .filter((item) => item.status === "SOLO" || item.status === "CONTESTED")
    .map((item) =>
      [
        item.keyword,
        item.status === "SOLO"
          ? "solo"
          : item.status === "CONTESTED"
            ? `${item.competitors?.join(", ") || "competitor"} appeared`
            : "unknown",
        item.observation,
      ]
        .filter(Boolean)
        .join(" - "),
    )
    .join("\n");
}

function keywordEvidenceFromExtraction(extraction: ProspectExtraction) {
  return extraction.serpEvidence
    .filter((item) => item.status === "SOLO" || item.status === "CONTESTED")
    .map((item) => ({
      term: item.keyword,
      status: item.status === "SOLO" ? "solo" as const : "contested" as const,
      competitor: item.competitors?.[0],
      note: item.observation,
    }))
    .slice(0, 5);
}

function normalizedInputFromExtraction(
  input: BuildSequenceInput,
  extraction?: ProspectExtraction,
): BuildSequenceInput {
  if (!extraction) {
    return {
      ...input,
      companyName: input.companyName,
      companyContext: input.companyContext || "Potential fit - validate spend/demand",
      observedTrigger: input.observedTrigger || "Light discovery before pitching Signal",
    };
  }
  const extractedContext = [
    ...extraction.prospectFacts,
    ...extraction.linkedinInsights,
    ...extraction.notes,
  ].join("\n");
  const extractedCompanyContext = extraction.companyFacts.join("\n");
  const extractedSerp = serpEvidenceText(extraction);
  return {
    ...input,
    companyName: input.companyName || extraction.companyName || "the account",
    companyWebsite: input.companyWebsite || extraction.companyDomain,
    contactFirstName: input.contactFirstName || extraction.firstName,
    contactRole:
      input.contactRole && input.contactRole !== "Head of Performance Marketing"
        ? input.contactRole
        : extraction.jobTitle || input.contactRole,
    companyContext:
      input.companyContext || extractedCompanyContext || "Potential fit - validate spend/demand",
    observedTrigger:
      input.observedTrigger ||
      extraction.prospectFacts[0] ||
      "Light discovery before pitching Signal",
    prospectContext: [input.prospectContext, extractedContext].filter(Boolean).join("\n"),
    serpEvidence: input.serpEvidence || extractedSerp || undefined,
    keywords: input.keywords?.length ? input.keywords : keywordEvidenceFromExtraction(extraction),
  };
}

async function persistProspectMemory({
  creatorId,
  input,
  persistence,
  semanticExtractionProvider,
}: {
  creatorId: string;
  input: BuildSequenceInput;
  persistence: BuildSequencePersistence;
  semanticExtractionProvider?: SemanticExtractionProvider;
}) {
  const rawText = input.rawProspectContext?.trim();
  if (!rawText) {
    return { input: normalizedInputFromExtraction(input), memory: undefined as ProspectMemory | undefined };
  }
  const semanticStarted = nowMs();
  const semanticResult = await extractProspectSemantic(rawText, {
    provider: semanticExtractionProvider,
  });
  const semanticIntakeDurationMs = nowMs() - semanticStarted;
  const extraction = semanticResult.extraction;
  const candidates = persistence.listProspects ? await persistence.listProspects(creatorId) : [];
  const explicitCandidate = input.prospectId
    ? candidates.find((prospect) => prospect.id === input.prospectId)
    : undefined;
  const identityResolution = explicitCandidate
    ? {
        status: "EXACT_MATCH" as const,
        prospectId: explicitCandidate.id,
        matchedBy: ["prospectId"],
        confidence: 1,
      }
    : resolveIdentity(extraction, candidates);
  const canUpdate =
    Boolean(identityResolution.prospectId) &&
    identityResolution.status !== "AMBIGUOUS" &&
    persistence.updateProspectMemory;
  const memory = canUpdate
    ? await persistence.updateProspectMemory!({
        prospectId: identityResolution.prospectId!,
        extraction,
        rawText,
        sourceType: "MANUAL_PASTE",
        identityResolution,
      })
    : persistence.createProspectMemory
      ? await persistence.createProspectMemory({
          creatorId,
          extraction,
          rawText,
          sourceType: "MANUAL_PASTE",
          identityResolution:
            identityResolution.status === "AMBIGUOUS"
              ? identityResolution
              : { status: "NEW_PROSPECT", confidence: 0.85 },
        })
      : undefined;
  return {
    input: normalizedInputFromExtraction(input, extraction),
    memory,
    extractionMode: semanticResult.mode,
    rejectedFacts: semanticResult.rejectedFacts,
    extractionFallbackReason: semanticResult.fallbackReason,
    semanticIntakeDurationMs,
  };
}

function semanticIntakeSafetyNotes(input: {
  mode?: string;
  rejectedFacts?: string[];
  fallbackReason?: string;
}) {
  const notes: string[] = [];
  void input.mode;
  void input.fallbackReason;
  if (input.rejectedFacts?.length) {
    notes.push(
      `${input.rejectedFacts.length} unsupported semantic intake extraction${
        input.rejectedFacts.length === 1 ? "" : "s"
      } were dropped before Prospect Memory persistence.`,
    );
  }
  return notes;
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

function protectedKeywordPhrases(generation: SequenceGeneration) {
  const evidence = generation.prospectIntelligence.serpEvidence;
  return Array.from(
    new Set([
      ...evidence.keywords,
      ...evidence.soloKeywords,
      ...evidence.contestedKeywords,
      ...evidence.structuredKeywords.map((keyword) => keyword.term),
    ].filter(Boolean)),
  );
}

function sanitizeGeneratedText(text: string, protectedPhrases: string[] = []) {
  const masks = new Map<string, string>();
  let masked = stripLeadingStepHeader(text);
  protectedPhrases
    .filter((phrase) => phrase.trim().length > 1)
    .forEach((phrase, index) => {
      const token = `__SAFE_KEYWORD_${index}__`;
      masks.set(token, phrase);
      masked = masked.replace(new RegExp(escapeRegExp(phrase), "gi"), token);
    });
  const sanitized = masked
    .replace(
      /\b(pricing|price|poc|proof of concept|trial|discount|guarantee|guaranteed)\b/gi,
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
    getRecentDrafts: persistence.getRecentDrafts
      ? persistence.getRecentDrafts.bind(persistence)
      : async () => [],
    getRecentAssessments: persistence.getRecentAssessments
      ? persistence.getRecentAssessments.bind(persistence)
      : async () => [],
  };
}

function accountStatusDraftWarning(status?: AccountStatusResult) {
  if (!status || status.severity !== "WARNING") return undefined;
  const company = status.companyName ?? "this account";
  return `Existing ownership or recent outreach activity found for ${company}. Review this before sending or pushing to CRM.`;
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
  const restrictionText = `${record.usageScope ?? ""} ${record.usageRestrictions ?? ""}`;
  const hasBlockingRestriction =
    /\b(internal only|internal_only|confidential|do not use|restricted|needs review|no real metrics)\b/i.test(
      restrictionText,
    ) && !/\bapproved\b.*\b(outbound|external|social proof)\b/i.test(restrictionText);
  return (
    record.type === "CASE_STUDY" &&
    (!record.approvalStatus || record.approvalStatus === "APPROVED") &&
    record.approvedText.trim().length > 0 &&
    record.sourceIds.length > 0 &&
    !hasBlockingRestriction
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

function companyEvidenceTokens(input: BuildSequenceInput) {
  const companyTokens = input.companyName
    .toLowerCase()
    .replace(/[^a-z0-9\s.-]/g, " ")
    .split(/\s+|[.-]/)
    .filter((token) => token.length > 2);
  const domainTokens = (input.companyWebsite ?? "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[./-]/)
    .filter((token) => token.length > 2);
  return Array.from(new Set([...companyTokens, ...domainTokens])).filter(
    (token) => !/^(com|net|org|inc|ltd|llc|group|global|the)$/.test(token),
  );
}

function mismatchedKeywordEvidence(input: BuildSequenceInput) {
  const tokens = companyEvidenceTokens(input);
  if (tokens.length === 0) return [];
  return (input.keywords ?? []).filter((keyword) => {
    const term = keyword.term.toLowerCase();
    return !tokens.some((token) => term.includes(token));
  });
}

function knowledgeLimitations(input: BuildSequenceInput, records: SequenceKnowledgeRecord[]) {
  const limitations = new Set<string>();
  if (!input.companyWebsite) {
    limitations.add(
      "Company website was not provided, so account facts are treated conservatively.",
    );
  }
  if (!input.paidSearchContext) {
    limitations.add("No structured paid-search context was provided; raw context was used conservatively.");
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
  if (!input.serpEvidence && !hasVisualContext(input) && !input.keywords?.length) {
    limitations.add("No SERP evidence was provided, so account-specific search conditions were not claimed.");
  }
  if (mismatchedKeywordEvidence(input).length > 0) {
    limitations.add("Some keyword evidence did not appear to match the prospect company and was not used for specific SERP claims.");
  }
  return Array.from(limitations);
}

function safetyNotes(input: BuildSequenceInput, records: SequenceKnowledgeRecord[]) {
  const notes = new Set<string>();
  const combined = [
    input.currentVendor,
    input.paidSearchContext,
    input.observedTrigger,
    input.prospectContext,
    input.serpEvidence,
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
  if (mismatchedKeywordEvidence(input).length > 0) {
    notes.add("Mismatched keyword evidence was filtered before generation.");
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

function wordCount(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
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
    input.serpEvidence,
    input.prospectContext,
    input.observedTrigger,
  ]
    .filter(Boolean)
    .join(" ");
  const hasSupport = /crowded|competitor|competition|auction|solo|alone|only advertiser|no other advertiser|waste|unnecessary spend|spend is high|high spend|weak control|incremental|incrementality/i.test(
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

function hasSocialProofPitchRestart(finalStep: SequenceStep) {
  const text = normalizedText(`${finalStep.messageBody} ${finalStep.cta}`);
  return /\b(monitors?|google ads|search console|bing|competitors?|pause|reduce bids|restore coverage|walkthrough|framework|methodology)\b/.test(
    text,
  );
}

function containsVagueLanguage(text: string) {
  return /\b(conversion-source data|outcome data|paid brand line|cleaner read|cleaner bid decision|the angle|setup pattern|plain example|the point wasn(?:'|’)t to|the first question is simple|i haven(?:'|’)t tried to over-explain this|demand capture versus spend that is simply there|real work|doing more work than it should|live search-result monitoring to separate demand capture)\b/i.test(
    text,
  );
}

function containsInternalFacingLanguage(text: string) {
  return /\b(?:without account-specific|based on (?:the )?available evidence|we cannot confirm|we can'?t confirm|cannot confirm|unsupported (?:claim|serp|evidence)|no unsupported serp observation|understand minute-by-minute branded-search competition before changing coverage)\b/i.test(
    text,
  );
}

function containsStandaloneSentenceFragment(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .some((line) => {
      if (/^hi\b/i.test(line) || /^(?:congrats|congratulations)\b/i.test(line) || /[?]$/.test(line) || /^re:/i.test(line)) return false;
      if (/^(?:Understand|Identify|Measure|Compare|Separate|Review|Use|Build|Create|Determine)\b/i.test(line)) {
        return true;
      }
      const dangling = /(?:,\s*|(?:and|or|with|covering|including|across|for|of|in|paid)\.?)$/i.test(line);
      return dangling;
    });
}

function containsUnsupportedOrganicClaim(
  input: BuildSequenceInput,
  text: string,
  records: SequenceKnowledgeRecord[] = [],
) {
  const support = [
    input.paidSearchContext,
    input.internalNotes,
    input.screenshotContext,
    input.screenshotShows,
    input.observedTrigger,
    input.prospectContext,
    input.serpEvidence,
    ...records.map((record) => record.approvedText),
  ]
    .filter(Boolean)
    .join(" ");
  if (/organic.*captur|organic cannibalization|paid and organic/i.test(support)) {
    return false;
  }
  return /organic.*captur|organic would|organic may have|organic already|organic can already|paid and organic/i.test(
    text,
  );
}

function validateStepOneReference(step: SequenceStep) {
  const text = `${step.messageBody} ${step.cta}`;
  return (
    /branded-search|brand(ed)? search|SERP|auction|CPC|bid|coverage|competitive landscape/i.test(text) &&
    /question|snapshot|competitors?|solo|contested|visibility|bids should change|CPC may be|same CPC|quiet brand auctions|branded-search efficiency/i.test(text) &&
    questionCount(text) <= 2 &&
    !/case study|screenshot|\{\{! Insert screenshot \}\}|use the screenshot|what it shows/i.test(text)
  );
}

function validateStepTwoReference(step: SequenceStep) {
  const text = `${step.imageContextNote ?? ""} ${step.messageBody} ${step.cta}`;
  const hasImageReference = /screenshot|visual|SERP/i.test(step.imageContextNote ?? "");
  return (
    (hasImageReference || !step.imageContextNote) &&
    /method|solo periods|defensive efficiency|different auctions|visibility|minimum CPC|auction/i.test(text) &&
    /evidence|keyword data|measure|coverage|bid|CPC|performance|search page/i.test(text) &&
    !/organic.*captur|wasting money|wasteful|40-60|Crocs|AppsFlyer|MyHeritage/i.test(text) &&
    !/use the screenshot|call out only what is visible|what it shows|brand keyword|observed:/i.test(text) &&
    !containsVagueAnonymousCustomerStory(text)
  );
}

function validateStepThreeReference(step: SequenceStep) {
  const text = `${step.messageBody} ${step.cta}`;
  return (
    /existing Google Ads setup/i.test(text) &&
    /without requiring.*rebuild campaigns|without requiring.*change your current bidding strategy/i.test(text) &&
    /snapshot|supplied evidence|keyword data|SERP evidence|at the time of the check|visibility check|business value|decision rule|brand auction changes|auction pressure/i.test(text) &&
    /measure|visibility|bid|CPC|coverage|auction changes/i.test(text) &&
    !/use the screenshot|what it shows|brand keyword|observed:/i.test(text)
  );
}

function validateStepFourReference(step: SequenceStep) {
  const text = `${step.messageBody} ${step.cta}`;
  if (step.purpose === "BREAKUP_CLOSE_LOOP") {
    return (
      /priority right now|timing/i.test(text) &&
      /happy to share more|happy to send a short overview/i.test(text) &&
      !/close the loop|close this out|final email|case study|\b\d+(?:\.\d+)?\s*%|\bMQL\b|\bSQL\b|\brevenue\b|\bclicks?\b|\bCPC\b|monitors?|Google Ads|Search Console|Bing|competitors?|pause|reduce bids|restore coverage|walkthrough|demo/i.test(text)
    );
  }
  return (
    step.purpose === "SOCIAL_PROOF" &&
    /practical takeaway|paid coverage|quick overview|reduced|cut|customer example/i.test(text) &&
    !/close the loop|close this out|final email/i.test(text)
  );
}

function hasEntityMismatch(
  input: BuildSequenceInput,
  steps: SequenceStep[],
  records: SequenceKnowledgeRecord[],
) {
  const allowedCompany = normalizedEntity(input.companyName);
  const allowedDomain = input.companyWebsite ? normalizedEntity(input.companyWebsite) : "";
  const approvedDefaultProofCompanies = ["appsflyer", "crocs", "dior"];
  const proofCompanies = [
    ...caseStudyCompanies(records).map(normalizedEntity),
    ...approvedDefaultProofCompanies,
  ];
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

function hasTemplateLikeStructure(steps: SequenceStep[]) {
  const openingKeys = steps
    .map((step) =>
      step.messageBody
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .find((line) => !/^hi\b/i.test(line)),
    )
    .filter((line): line is string => Boolean(line))
    .map((line) => normalizedText(line).split(" ").slice(0, 4).join(" "));
  const counts = new Map<string, number>();
  for (const key of openingKeys) {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.values()).some((count) => count >= 3);
}

function copiesGoldStandardExample(generation: SequenceGeneration, steps: SequenceStep[]) {
  const generatedText = normalizedText(renderedSequenceText(steps));
  return generation.selectedGoldStandardExamples.some((example) => {
    const exampleText = normalizedText(`${example.subject ?? ""} ${example.body}`);
    return similarity(generatedText, exampleText) > 0.85 ||
      steps.some((step) => similarity(normalizedText(`${step.subjectLine ?? ""} ${step.messageBody} ${step.cta}`), exampleText) > 0.9);
  });
}

function hasNarrativeProgression(generation: SequenceGeneration, steps: SequenceStep[]) {
  const narrative = generation.messageStrategy.sequenceNarrative;
  if (narrative.length !== steps.length) {
    return false;
  }
  const objectives = narrative.map((item) => normalizedText(item.objective));
  return new Set(objectives).size === objectives.length;
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
  const approvedSequenceProof = new Set(["crocs", "appsflyer", "myheritage"]);
  const mentioned = new Set(
    caseStudyCompanies(records)
      .filter((company) => rendered.includes(company.toLowerCase()))
      .map((company) => company.toLowerCase())
      .filter((company) => !approvedSequenceProof.has(company)),
  );
  return mentioned.size > 1;
}

function nowMs() {
  return Date.now();
}

type SequenceValidationIssue = {
  reason: string;
  scope: "sequence" | "step";
  stepIndexes: number[];
  recoverable: boolean;
};

const recoverableSequenceFailureReasons = new Set([
  "duplicate-sequence",
  "template-like",
  "narrative",
  "contamination",
  "similarity",
  "duplicate-cta",
  "cta-intent",
  "questions",
  "cta-questions",
  "word-count",
  "anonymous",
  "vague",
  "internal-language",
  "sentence-fragment",
  "step1-reference",
  "step2-reference",
  "step3-reference",
  "step4-reference",
  "final-length",
  "final-close",
  "final-pitch",
]);

function issue(
  reason: string,
  stepIndexes: number[] = [],
  recoverable = recoverableSequenceFailureReasons.has(reason),
): SequenceValidationIssue {
  return {
    reason,
    scope: stepIndexes.length > 0 ? "step" : "sequence",
    stepIndexes,
    recoverable,
  };
}

function firstStepIndex(steps: SequenceStep[], predicate: (step: SequenceStep, index: number) => boolean) {
  const index = steps.findIndex(predicate);
  return index >= 0 ? [index] : [];
}

function repeatedMessageStepIndexes(steps: SequenceStep[]) {
  const seen = new Map<string, number>();
  for (let index = 0; index < steps.length; index += 1) {
    const body = normalizedMessage(steps[index]);
    const first = seen.get(body);
    if (first !== undefined) {
      return [index];
    }
    seen.set(body, index);
  }
  return [];
}

function repeatedCtaStepIndexes(steps: SequenceStep[]) {
  const seen = new Map<string, number>();
  for (let index = 0; index < steps.length; index += 1) {
    const cta = normalizedCta(steps[index]);
    if (!cta) continue;
    const first = seen.get(cta);
    if (first !== undefined) {
      return [index];
    }
    seen.set(cta, index);
  }
  return [];
}

function similarStepIndexes(steps: SequenceStep[]) {
  const normalized = steps.map(normalizedMessage);
  for (let index = 0; index < normalized.length; index += 1) {
    for (let compare = index + 1; compare < normalized.length; compare += 1) {
      if (similarity(normalized[index], normalized[compare]) > 0.9) {
        return [compare];
      }
    }
  }
  return [];
}

function templateLikeStepIndexes(steps: SequenceStep[]) {
  const seen = new Map<string, number>();
  const repeated: number[] = [];
  for (let index = 0; index < steps.length; index += 1) {
    const opening = steps[index].messageBody
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .find((line) => !/^hi\b/i.test(line));
    if (!opening) continue;
    const key = normalizedText(opening).split(" ").slice(0, 4).join(" ");
    if (!key) continue;
    if (seen.has(key)) {
      repeated.push(index);
    } else {
      seen.set(key, index);
    }
  }
  return repeated;
}

function ctaIntentRecoveryStepIndexes(steps: SequenceStep[]) {
  const intents = steps.map((step) => ctaIntent(step.cta)).filter(Boolean);
  const nonCloseIndexes = intents
    .map((intent, index) => ({ intent, index }))
    .filter((item) => item.intent !== "close");
  const showOrSend = nonCloseIndexes.filter((item) => item.intent === "show_or_send");
  if (nonCloseIndexes.length >= 3 && showOrSend.length >= nonCloseIndexes.length - 1) {
    return showOrSend.slice(1).map((item) => item.index);
  }
  return [];
}

function duplicateCompleteSequenceStepIndexes(steps: SequenceStep[], generation: SequenceGeneration) {
  const contaminated = firstStepIndex(steps, (step) => containsStepContamination(step, steps.length));
  if (contaminated.length > 0) {
    return contaminated;
  }
  const duplicateBody = repeatedMessageStepIndexes(steps);
  if (duplicateBody.length > 0) {
    return duplicateBody;
  }
  const rendered = renderedSequenceText(steps);
  if (containsRepeatedStepOrder(rendered, steps.length)) {
    return firstStepIndex(steps, (step) => containsRepeatedStepOrder(step.messageBody, steps.length));
  }
  const allText = [
    generation.overallStrategy,
    generation.claimsUsed.join("\n"),
    generation.knowledgeLimitations.join("\n"),
    rendered,
  ].join("\n");
  if (containsRepeatedStepOrder(allText, steps.length)) {
    return firstStepIndex(steps, (step) => containsRepeatedStepOrder(step.messageBody, steps.length));
  }
  return [];
}

function sequenceValidationIssueDetails(
  input: BuildSequenceInput,
  generation: SequenceGeneration,
  records: SequenceKnowledgeRecord[] = [],
) {
  const issues: SequenceValidationIssue[] = [];
  const fail = (detail: SequenceValidationIssue) => {
    issues.push(detail);
    return issues;
  };
  const parsedSteps = z.array(sequenceStepSchema).safeParse(generation.steps);
  if (!parsedSteps.success) {
    return fail(issue("schema", [], false));
  }

  const steps = parsedSteps.data;
  if (steps.length !== input.sequenceLength) {
    return fail(issue("length", [], false));
  }
  const stepNumbers = steps.map((step) => step.stepNumber);
  if (!stepNumbers.every((stepNumber, index) => stepNumber === index + 1)) {
    return fail(issue("order", [], false));
  }
  const purposes = new Set(steps.map((step) => step.purpose));
  if (purposes.size !== steps.length) {
    return fail(issue("purposes", [], false));
  }
  const allowedChannels = channelsForSequence(input.primaryChannel);
  if (!steps.every((step) => allowedChannels.includes(step.channel))) {
    return fail(issue("channel", [], false));
  }
  if (hasDuplicateCompleteSequence(steps, generation)) {
    return fail(issue("duplicate-sequence", duplicateCompleteSequenceStepIndexes(steps, generation)));
  }
  if (hasTemplateLikeStructure(steps)) {
    return fail(issue("template-like", templateLikeStepIndexes(steps)));
  }
  if (!hasNarrativeProgression(generation, steps)) {
    return fail(issue("narrative", [1, 2]));
  }
  if (copiesGoldStandardExample(generation, steps)) {
    return fail(issue("gold-standard-copy", [], false));
  }
  const contaminatedStep = firstStepIndex(steps, (step) => containsStepContamination(step, input.sequenceLength));
  if (contaminatedStep.length > 0) {
    return fail(issue("contamination", contaminatedStep));
  }
  if (hasEntityMismatch(input, steps, records)) {
    return fail(issue("entity", [], false));
  }
  if (
    input.primaryChannel === "MIXED" &&
    !(
      steps.some((step) => step.channel === "EMAIL") &&
      steps.some((step) => step.channel === "LINKEDIN")
    )
  ) {
    return fail(issue("mixed", [], false));
  }
  const similaritySteps = similarStepIndexes(steps);
  if (similaritySteps.length > 0) {
    return fail(issue("similarity", similaritySteps));
  }
  const duplicateCtas = repeatedCtaStepIndexes(steps);
  if (duplicateCtas.length > 0) {
    return fail(issue("duplicate-cta", duplicateCtas));
  }
  if (hasRepeatedCtaIntent(steps)) {
    return fail(issue("cta-intent", ctaIntentRecoveryStepIndexes(steps)));
  }
  const questionStep = firstStepIndex(steps, (step) => questionCount(`${step.messageBody} ${step.cta}`) > 2);
  if (questionStep.length > 0) {
    return fail(issue("questions", questionStep));
  }
  const ctaQuestionStep = firstStepIndex(steps, (step) => questionCount(step.cta) > 1);
  if (ctaQuestionStep.length > 0) {
    return fail(issue("cta-questions", ctaQuestionStep));
  }
  const wordyStep = firstStepIndex(
    steps,
    (step) =>
      wordCount(
        [
          step.subjectLine,
          step.connectionRequest,
          step.imagePlaceholder,
          step.messageBody,
          step.cta,
        ]
          .filter(Boolean)
          .join(" "),
      ) > 110,
  );
  if (wordyStep.length > 0) {
    return fail(issue("word-count", wordyStep));
  }
  const anonymousStep = firstStepIndex(steps, (step) => containsVagueAnonymousCustomerStory(step.messageBody));
  if (anonymousStep.length > 0) {
    return fail(issue("anonymous", anonymousStep));
  }
  const organicStep = firstStepIndex(steps, (step) =>
    containsUnsupportedOrganicClaim(
      input,
      `${step.subjectLine ?? ""} ${step.messageBody} ${step.cta}`,
      records,
    ),
  );
  if (organicStep.length > 0) {
    return fail(issue("organic", organicStep, false));
  }
  const vagueStep = firstStepIndex(steps, (step) =>
    containsVagueLanguage(`${step.subjectLine ?? ""} ${step.messageBody} ${step.cta}`),
  );
  if (vagueStep.length > 0) {
    return fail(issue("vague", vagueStep));
  }
  const internalLanguageStep = firstStepIndex(steps, (step) =>
    containsInternalFacingLanguage(`${step.subjectLine ?? ""} ${step.messageBody} ${step.cta}`),
  );
  if (internalLanguageStep.length > 0) {
    return fail(issue("internal-language", internalLanguageStep));
  }
  const sentenceFragmentStep = firstStepIndex(steps, (step) => containsStandaloneSentenceFragment(step.messageBody));
  if (sentenceFragmentStep.length > 0) {
    return fail(issue("sentence-fragment", sentenceFragmentStep));
  }
  if (steps[0] && containsUnsupportedStepOneClaim(input, steps[0])) {
    return fail(issue("step1-claim", [0], false));
  }
  const hasHybridAcceptedStep = generation.safetyNotes.some((note) =>
    /^Hybrid rewrite accepted(?: on retry)? for step \d+\.$/.test(note),
  );
  if (!hasHybridAcceptedStep) {
    if (!validateStepOneReference(steps[0])) {
      return fail(issue("step1-reference", [0]));
    }
    if (!validateStepTwoReference(steps[1])) {
      return fail(issue("step2-reference", [1]));
    }
    if (!validateStepThreeReference(steps[2])) {
      return fail(issue("step3-reference", [2]));
    }
    if (!validateStepFourReference(steps[3])) {
      return fail(issue("step4-reference", [3]));
    }
  }
  if (!hasVisualContext(input) && !input.serpEvidence) {
    const unexpectedImageStep = firstStepIndex(
      steps,
      (step, index) => index !== 1 && Boolean(step.imagePlaceholder || step.imageContextNote),
    );
    if (unexpectedImageStep.length > 0) {
      return fail(issue("unexpected-image", unexpectedImageStep, false));
    }
    const unsupportedVisualStep = firstStepIndex(
      steps,
      (step, index) => index !== 1 && containsUnsupportedVisualClaim(step.messageBody),
    );
    if (unsupportedVisualStep.length > 0) {
      return fail(issue("unsupported-visual", unsupportedVisualStep, false));
    }
  }
  if (hasVisualContext(input)) {
    const stepTwo = steps[1];
    if (!stepTwo.imageContextNote) {
      return fail(issue("image-note", [1], false));
    }
  }
  const wasteStep = firstStepIndex(steps, (step) => containsProspectWasteClaim(input, step.messageBody));
  if (wasteStep.length > 0) {
    return fail(issue("waste", wasteStep, false));
  }
  if (
    steps.length >= 4 &&
    !(
      steps[0].purpose === "FIRST_TOUCH_RELEVANCE" &&
      steps[1].purpose === "PROBLEM_FRAMING" &&
      steps[2].purpose === "METHODOLOGY_DIFFERENTIATION" &&
      (steps.at(-1)?.purpose === "SOCIAL_PROOF" ||
        steps.at(-1)?.purpose === "BREAKUP_CLOSE_LOOP")
    )
  ) {
    return fail(issue("progression", [], false));
  }
  const finalStep = steps[steps.length - 1];
  const longestEarlierLength = Math.max(
    ...steps.slice(0, -1).map((step) => step.messageBody.length),
  );
  if (finalStep.messageBody.length > longestEarlierLength) {
    return fail(issue("final-length", [steps.length - 1]));
  }
  if (
    finalStep.purpose === "SOCIAL_PROOF"
      ? !/quick overview|paid coverage|practical takeaway|customer example|reduced|decreased|cut/i.test(
          `${finalStep.messageBody} ${finalStep.cta}`,
        )
      : finalStep.purpose === "BREAKUP_CLOSE_LOOP"
        ? !/priority right now|timing|happy to share more|happy to send/i.test(
            `${finalStep.messageBody} ${finalStep.cta}`,
          )
        : true
  ) {
    return fail(issue("final-close", [steps.length - 1]));
  }
  if (
    finalStep.purpose === "SOCIAL_PROOF"
      ? hasSocialProofPitchRestart(finalStep)
      : hasFinalStepPitchRestart(finalStep)
  ) {
    return fail(issue("final-pitch", [steps.length - 1]));
  }
  const rendered = JSON.stringify({
    overallStrategy: generation.overallStrategy,
    claimsUsed: generation.claimsUsed,
    steps: generation.steps,
  });
  const renderedForRestrictedChecks = protectedKeywordPhrases(generation).reduce(
    (value, phrase) => value.replace(new RegExp(escapeRegExp(phrase), "gi"), ""),
    rendered,
  );
  if (containsCommercialTerms(renderedForRestrictedChecks) || containsCompetitorClaim(rendered)) {
    return fail(issue("restricted", [], false));
  }
  if (hasMultipleProofCompanies(generation, records)) {
    return fail(issue("proof-companies", [], false));
  }
  return issues;
}

function sequenceValidationIssues(
  input: BuildSequenceInput,
  generation: SequenceGeneration,
  records: SequenceKnowledgeRecord[] = [],
) {
  return sequenceValidationIssueDetails(input, generation, records).map((detail) => detail.reason);
}

function sanitizeSequenceGeneration(generation: SequenceGeneration): SequenceGeneration {
  const safeKeywords = protectedKeywordPhrases(generation);
  return {
    ...generation,
    overallStrategy: sanitizeGeneratedText(generation.overallStrategy, safeKeywords),
    messageStrategy: {
      ...generation.messageStrategy,
      prospectInsight: sanitizeGeneratedText(generation.messageStrategy.prospectInsight, safeKeywords),
      businessQuestion: sanitizeGeneratedText(generation.messageStrategy.businessQuestion, safeKeywords),
      productGap: sanitizeGeneratedText(generation.messageStrategy.productGap, safeKeywords),
      primaryAngle: sanitizeGeneratedText(generation.messageStrategy.primaryAngle, safeKeywords),
      secondaryAngle: generation.messageStrategy.secondaryAngle
        ? sanitizeGeneratedText(generation.messageStrategy.secondaryAngle, safeKeywords)
        : undefined,
      relevantCapability: sanitizeGeneratedText(generation.messageStrategy.relevantCapability, safeKeywords),
      proofPoint: generation.messageStrategy.proofPoint
        ? sanitizeGeneratedText(generation.messageStrategy.proofPoint, safeKeywords)
        : undefined,
      whyThisShouldResonate: sanitizeGeneratedText(generation.messageStrategy.whyThisShouldResonate, safeKeywords),
      sequenceNarrative: generation.messageStrategy.sequenceNarrative.map((item) => ({
        ...item,
        objective: sanitizeGeneratedText(item.objective, safeKeywords),
        newInformation: sanitizeGeneratedText(item.newInformation, safeKeywords),
        ctaIntent: sanitizeGeneratedText(item.ctaIntent, safeKeywords),
      })),
    },
    claimsUsed: generation.claimsUsed.map((claim) => sanitizeGeneratedText(claim, safeKeywords)),
    steps: generation.steps.map((step) => ({
      ...step,
      subjectLine: step.subjectLine ? sanitizeGeneratedText(step.subjectLine, safeKeywords) : undefined,
      connectionRequest: step.connectionRequest
        ? sanitizeGeneratedText(step.connectionRequest, safeKeywords)
        : undefined,
      messageBody: sanitizeGeneratedText(step.messageBody, safeKeywords),
      cta: sanitizeGeneratedText(step.cta, safeKeywords),
      claimsUsed: step.claimsUsed.map((claim) => sanitizeGeneratedText(claim, safeKeywords)),
    })),
  };
}

function recoverSequenceSteps(
  generated: SequenceGeneration,
  fallbackGenerated: SequenceGeneration,
  issues: SequenceValidationIssue[],
  alreadyRecovered = new Set<number>(),
) {
  if (issues.length === 0) {
    return undefined;
  }
  if (issues.some((detail) => !detail.recoverable || detail.stepIndexes.length === 0)) {
    return undefined;
  }
  const stepIndexes = Array.from(
    new Set(issues.flatMap((detail) => detail.stepIndexes)),
  )
    .filter((index) => !alreadyRecovered.has(index))
    .sort((left, right) => left - right);
  if (stepIndexes.length === 0 || stepIndexes.length >= generated.steps.length) {
    return undefined;
  }
  const fallbackByNumber = new Map(
    fallbackGenerated.steps.map((step) => [step.stepNumber, step]),
  );
  const recoveredSteps = generated.steps.map((step, index) =>
    stepIndexes.includes(index) ? fallbackByNumber.get(step.stepNumber) ?? fallbackGenerated.steps[index] ?? step : step,
  );
  if (recoveredSteps.some((step) => !step)) {
    return undefined;
  }
  return {
    ...generated,
    steps: recoveredSteps,
    safetyNotes: [
      ...generated.safetyNotes,
      `Final validation recovered step${stepIndexes.length === 1 ? "" : "s"} ${stepIndexes
        .map((index) => index + 1)
        .join(", ")} with deterministic step fallback: ${issues.map((detail) => detail.reason).join(", ")}.`,
    ],
    diagnostics: {
      ...generated.diagnostics,
      finalRecoveryReason: issues.map((detail) => detail.reason).join(", "),
      finalRecoveredStepNumbers: stepIndexes.map((index) => index + 1),
      aiStepsPreserved: generated.steps.length - stepIndexes.length,
      finalFullSequenceFallbackUsed: false,
    },
  };
}

function openAiFallbackReason(providerName: string, notes: string[]) {
  if (providerName !== "openai") {
    return undefined;
  }
  return notes.find((note) =>
    !/^Hybrid rewrite fell back for step \d+:/i.test(note) &&
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

  async listProspects(creatorId: string) {
    const rows = await this.client.$queryRaw<Row[]>`
      SELECT id, "firstName", "lastName", "fullName", email, "jobTitle", "companyName",
        "companyDomain", "linkedinUrl", status, "createdAt"::text AS "createdAt",
        "updatedAt"::text AS "updatedAt"
      FROM "Prospect"
      WHERE "userId" = ${creatorId}
      ORDER BY "updatedAt" DESC
      LIMIT 500
    `;
    return rows.map(mapProspectRow);
  }

  private async prospectSourceCount(prospectId: string) {
    const rows = await this.client.$queryRaw<Row[]>`
      SELECT COUNT(*)::int AS count
      FROM "ProspectSource"
      WHERE "prospectId" = ${prospectId}
    `;
    return Number(rows[0]?.count ?? 0);
  }

  private async insertFacts(prospectId: string, source: ProspectSource, facts: ExtractedFact[]) {
    for (const fact of facts) {
      await this.client.$executeRaw`
        INSERT INTO "ProspectFact" (id, "prospectId", "sourceId", value, category, "createdAt")
        VALUES (
          ${randomUUID()},
          ${prospectId},
          ${source.id},
          ${fact.value},
          ${fact.category}::"ExtractedFactCategory",
          NOW()
        )
      `;
    }
  }

  async createProspectMemory({
    creatorId,
    extraction,
    rawText,
    sourceType = "MANUAL_PASTE",
    identityResolution,
  }: {
    creatorId: string;
    extraction: ProspectExtraction;
    rawText: string;
    sourceType?: ProspectSourceType;
    identityResolution: IdentityResolution;
  }) {
    const prospectId = randomUUID();
    const sourceId = randomUUID();
    await this.client.$executeRaw`
      INSERT INTO "Prospect" (
        id, "userId", "firstName", "lastName", "fullName", email, "jobTitle",
        "companyName", "companyDomain", "linkedinUrl", status, "createdAt", "updatedAt"
      )
      VALUES (
        ${prospectId},
        ${creatorId},
        ${extraction.firstName ?? null},
        ${extraction.lastName ?? null},
        ${extraction.fullName ?? null},
        ${extraction.email ?? null},
        ${extraction.jobTitle ?? null},
        ${extraction.companyName ?? null},
        ${normalizeDomain(extraction.companyDomain) ?? null},
        ${normalizeLinkedInUrl(extraction.linkedinUrl) ?? null},
        'CONTEXT_READY'::"ProspectStatus",
        NOW(),
        NOW()
      )
    `;
    await this.client.$executeRaw`
      INSERT INTO "ProspectSource" (id, "prospectId", type, "rawContent", "sourceLabel", "sourceUrl", "createdAt")
      VALUES (${sourceId}, ${prospectId}, ${sourceType}::"ProspectSourceType", ${rawText}, 'Manual paste', ${extraction.linkedinUrl ?? null}, NOW())
    `;
    const prospectRows = await this.client.$queryRaw<Row[]>`
      SELECT id, "firstName", "lastName", "fullName", email, "jobTitle", "companyName",
        "companyDomain", "linkedinUrl", status, "createdAt"::text AS "createdAt",
        "updatedAt"::text AS "updatedAt"
      FROM "Prospect"
      WHERE id = ${prospectId}
      LIMIT 1
    `;
    const sourceRows = await this.client.$queryRaw<Row[]>`
      SELECT id, "prospectId", type, "rawContent", "sourceLabel", "sourceUrl", "createdAt"::text AS "createdAt"
      FROM "ProspectSource"
      WHERE id = ${sourceId}
      LIMIT 1
    `;
    const prospect = mapProspectRow(prospectRows[0]);
    const source = mapProspectSourceRow(sourceRows[0]);
    const facts = factsFromExtraction(source, extraction);
    await this.insertFacts(prospect.id, source, facts);
    return {
      prospect,
      source,
      sourceCount: await this.prospectSourceCount(prospect.id),
      extraction,
      facts,
      identityResolution,
      conflicts: [],
    };
  }

  async updateProspectMemory({
    prospectId,
    extraction,
    rawText,
    sourceType = "MANUAL_PASTE",
    identityResolution,
  }: {
    prospectId: string;
    extraction: ProspectExtraction;
    rawText: string;
    sourceType?: ProspectSourceType;
    identityResolution: IdentityResolution;
  }) {
    const rows = await this.client.$queryRaw<Row[]>`
      SELECT id, "firstName", "lastName", "fullName", email, "jobTitle", "companyName",
        "companyDomain", "linkedinUrl", status, "createdAt"::text AS "createdAt",
        "updatedAt"::text AS "updatedAt"
      FROM "Prospect"
      WHERE id = ${prospectId}
      LIMIT 1
    `;
    const existing = mapProspectRow(rows[0]);
    const merged = mergeProspectRecord(existing, {
      ...extraction,
      companyDomain: normalizeDomain(extraction.companyDomain),
      linkedinUrl: normalizeLinkedInUrl(extraction.linkedinUrl),
    });
    await this.client.$executeRaw`
      UPDATE "Prospect"
      SET "firstName" = ${merged.prospect.firstName ?? null},
        "lastName" = ${merged.prospect.lastName ?? null},
        "fullName" = ${merged.prospect.fullName ?? null},
        email = ${merged.prospect.email ?? null},
        "jobTitle" = ${merged.prospect.jobTitle ?? null},
        "companyName" = ${merged.prospect.companyName ?? null},
        "companyDomain" = ${merged.prospect.companyDomain ?? null},
        "linkedinUrl" = ${merged.prospect.linkedinUrl ?? null},
        status = 'CONTEXT_READY'::"ProspectStatus",
        "updatedAt" = NOW()
      WHERE id = ${prospectId}
    `;
    const sourceId = randomUUID();
    await this.client.$executeRaw`
      INSERT INTO "ProspectSource" (id, "prospectId", type, "rawContent", "sourceLabel", "sourceUrl", "createdAt")
      VALUES (${sourceId}, ${prospectId}, ${sourceType}::"ProspectSourceType", ${rawText}, 'Manual paste', ${extraction.linkedinUrl ?? null}, NOW())
    `;
    const prospectRows = await this.client.$queryRaw<Row[]>`
      SELECT id, "firstName", "lastName", "fullName", email, "jobTitle", "companyName",
        "companyDomain", "linkedinUrl", status, "createdAt"::text AS "createdAt",
        "updatedAt"::text AS "updatedAt"
      FROM "Prospect"
      WHERE id = ${prospectId}
      LIMIT 1
    `;
    const sourceRows = await this.client.$queryRaw<Row[]>`
      SELECT id, "prospectId", type, "rawContent", "sourceLabel", "sourceUrl", "createdAt"::text AS "createdAt"
      FROM "ProspectSource"
      WHERE id = ${sourceId}
      LIMIT 1
    `;
    const prospect = mapProspectRow(prospectRows[0]);
    const source = mapProspectSourceRow(sourceRows[0]);
    const facts = factsFromExtraction(source, extraction);
    await this.insertFacts(prospect.id, source, facts);
    return {
      prospect,
      source,
      sourceCount: await this.prospectSourceCount(prospect.id),
      extraction,
      facts,
      identityResolution,
      conflicts: merged.conflicts,
    };
  }

  async persistDraft({
    creatorId,
    prospectId,
    request,
    result,
  }: {
    creatorId: string;
    prospectId?: string;
    request: BuildSequenceInput;
    result: Omit<BuildSequenceResult, "draftId">;
  }) {
    const id = randomUUID();
    await this.client.$executeRaw`
      INSERT INTO "GeneratedDraft" (
        id,
        "userId",
        "prospectId",
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
        ${prospectId ?? null},
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
  const totalStarted = nowMs();
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

  const parsedInput = parsed.data;
  const creatorId = parsedInput.creatorId ?? "seed-sales-user";
  const persistence = dependencies.persistence ?? new PrismaBuildSequencePersistence();
  const actor = await persistence.getActor(creatorId);
  if (!actor || !["SALES_USER", "KNOWLEDGE_ADMIN"].includes(actor.role)) {
    return err("FORBIDDEN", "Only authorized sales or knowledge users can build sequences.");
  }
  const memoryResult = await persistProspectMemory({
    creatorId,
    input: parsedInput,
    persistence,
    semanticExtractionProvider: dependencies.semanticExtractionProvider,
  });
  const input = memoryResult.input;
  if (!input.companyName.trim()) {
    return err("VALIDATION_ERROR", "Build Sequence needs: Company or prospect context with a company.");
  }

  const accountStatus = await checkAccountStatus(
    {
      companyName: input.companyName,
      companyDomain: input.companyWebsite,
      creatorId,
    },
    dependencies.persistence ? { persistence: accountStatusPersistence(persistence) } : {},
  );
  if (!accountStatus.ok) {
    return accountStatus;
  }
  if (accountStatus.data.severity === "BLOCKED") {
    return err("ACCOUNT_STATUS_BLOCKED", accountStatus.data.message);
  }
  const accountStatusWarning = accountStatusDraftWarning(accountStatus.data);

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
  const prospectIntelligence = buildProspectIntelligence(input, records);
  const strategyStarted = nowMs();
  const messageStrategy = await planAiMessageStrategy({
    input,
    intelligence: prospectIntelligence,
    records,
    provider: dependencies.messageStrategyProvider,
  });
  const strategyDurationMs = nowMs() - strategyStarted;
  const selectedGoldStandardExamples = selectGoldStandardExamples({
    intelligence: prospectIntelligence,
    primaryAngle: messageStrategy.primaryAngle,
  }).filter((example) => messageStrategy.selectedGoldStandardExampleIds.includes(example.id));
  const baseGeneration = {
    overallStrategy: "",
    selectedAngle: selected.angle,
    angleRationale: selected.rationale,
    personaEmphasis: getSequencePersonaGuidance(input.contactRole),
    prospectIntelligence,
    messageStrategy,
    selectedGoldStandardExamples,
    detectedAccountSignals: detectSequenceAccountSignals(input),
    safetyNotes: [
      ...safetyNotes(input, records),
      ...proofSelection.notes,
      ...(accountStatusWarning ? [accountStatusWarning] : []),
      ...semanticIntakeSafetyNotes({
        mode: memoryResult.extractionMode,
        rejectedFacts: memoryResult.rejectedFacts,
        fallbackReason: memoryResult.extractionFallbackReason,
      }),
    ],
    knowledgeLimitations: knowledgeLimitations(input, records),
  };
  const sequenceStarted = nowMs();
  let generated = sanitizeSequenceGeneration(
    await provider.generate({
      input,
      records,
      sourceReferences: sources,
      generation: baseGeneration,
    }),
  );
  const sequenceGenerationDurationMs = nowMs() - sequenceStarted;
  let providerMetadata = provider.metadata;
  const fallbackReason = openAiFallbackReason(provider.metadata.providerName, generated.safetyNotes);
  if (fallbackReason) {
    return err(
      "AI_PROVIDER_FAILED",
      `OpenAI did not generate this sequence. ${fallbackReason}`,
    );
  }

  const firstValidationStarted = nowMs();
  let validationIssueDetails = sequenceValidationIssueDetails(input, generated, records);
  let validationIssues = validationIssueDetails.map((detail) => detail.reason);
  let finalValidationDurationMs = nowMs() - firstValidationStarted;
  let finalFullSequenceFallbackUsed = false;
  if (validationIssues.length > 0) {
    if (provider.metadata.providerName === "openai") {
      const fallbackProvider = new DeterministicBuildSequenceProvider();
      const fallbackGenerated = sanitizeSequenceGeneration(
        await fallbackProvider.generate({
          input,
          records,
          sourceReferences: sources,
          generation: {
            ...baseGeneration,
            safetyNotes: [
              ...baseGeneration.safetyNotes,
              "OpenAI output failed sequence structure validation, so the approved fallback template was used.",
            ],
          },
        }),
      );
      const recoveryValidationStarted = nowMs();
      let recovered: SequenceGeneration | undefined;
      const recoveredStepIndexes = new Set<number>();
      for (let attempt = 0; attempt < generated.steps.length - 1 && validationIssueDetails.length > 0; attempt += 1) {
        const nextRecovered = recoverSequenceSteps(
          recovered ?? generated,
          fallbackGenerated,
          validationIssueDetails,
          recoveredStepIndexes,
        );
        if (!nextRecovered) {
          recovered = undefined;
          break;
        }
        for (const stepNumber of nextRecovered.diagnostics?.finalRecoveredStepNumbers ?? []) {
          recoveredStepIndexes.add(stepNumber - 1);
        }
        recovered = {
          ...nextRecovered,
          diagnostics: {
            ...nextRecovered.diagnostics,
            finalRecoveredStepNumbers: Array.from(recoveredStepIndexes)
              .sort((left, right) => left - right)
              .map((index) => index + 1),
            aiStepsPreserved: generated.steps.length - recoveredStepIndexes.size,
          },
        };
        validationIssueDetails = sequenceValidationIssueDetails(input, recovered, records);
        validationIssues = validationIssueDetails.map((detail) => detail.reason);
      }
      finalValidationDurationMs += nowMs() - recoveryValidationStarted;
      if (recovered && validationIssueDetails.length === 0) {
        generated = recovered;
        validationIssueDetails = [];
        validationIssues = [];
      }
      if (validationIssues.length > 0) {
        const fallbackValidationStarted = nowMs();
        const fallbackValidationIssues = sequenceValidationIssues(input, fallbackGenerated, records);
        finalValidationDurationMs += nowMs() - fallbackValidationStarted;
        if (fallbackValidationIssues.length > 0) {
          const diagnosticIssues = [
            ...validationIssues.map((issue) => `openai:${issue}`),
            ...fallbackValidationIssues.map((issue) => `fallback:${issue}`),
          ];
          return err(
            "GENERATION_REJECTED",
            `Generated sequence failed safety or quality validation: ${diagnosticIssues.join(", ")}.`,
          );
        }
        generated = {
          ...fallbackGenerated,
          diagnostics: {
            ...generated.diagnostics,
            finalRecoveryReason: validationIssues.join(", "),
            finalFullSequenceFallbackUsed: true,
            aiStepsPreserved: 0,
          },
        };
        providerMetadata = fallbackProvider.metadata;
        finalFullSequenceFallbackUsed = true;
        validationIssues = [];
      }
    } else {
      return err(
        "GENERATION_REJECTED",
        `Generated sequence failed safety or quality validation: ${validationIssues.join(", ")}.`,
      );
    }
  }
  const stepDiagnostics = generated.diagnostics?.stepRewriteDiagnostics ?? [];
  const strategyDiagnostics = messageStrategy.diagnostics;
  const diagnostics: BuildSequenceDiagnostics = {
    totalDurationMs: nowMs() - totalStarted,
    semanticIntakeDurationMs: memoryResult.semanticIntakeDurationMs,
    strategyDurationMs,
    strategyFirstCallDurationMs: strategyDiagnostics?.firstCallDurationMs,
    strategyRetryDurationMs: strategyDiagnostics?.retryDurationMs,
    strategyRetryUsed: strategyDiagnostics?.retryUsed,
    strategyFallbackUsed: strategyDiagnostics?.fallbackUsed,
    strategyFirstIssues: strategyDiagnostics?.firstIssues,
    strategyRetryIssues: strategyDiagnostics?.retryIssues,
    sequenceGenerationDurationMs,
    finalValidationDurationMs,
    totalAiCalls:
      (memoryResult.semanticIntakeDurationMs ? 1 : 0) +
      (strategyDiagnostics?.firstCallDurationMs ? 1 : 0) +
      (strategyDiagnostics?.retryDurationMs ? 1 : 0) +
      stepDiagnostics.reduce(
        (total, step) => total + (step.firstCallDurationMs ? 1 : 0) + (step.retryDurationMs ? 1 : 0),
        0,
      ),
    totalRetries:
      (strategyDiagnostics?.retryUsed ? 1 : 0) +
      stepDiagnostics.filter((step) => step.retryUsed).length,
    stepRewriteDiagnostics: stepDiagnostics,
    validationIssues,
    finalRecoveryReason: generated.diagnostics?.finalRecoveryReason,
    finalRecoveredStepNumbers: generated.diagnostics?.finalRecoveredStepNumbers,
    finalFullSequenceFallbackUsed:
      generated.diagnostics?.finalFullSequenceFallbackUsed ?? finalFullSequenceFallbackUsed,
    aiStepsPreserved:
      generated.diagnostics?.aiStepsPreserved ??
      generated.steps.length - stepDiagnostics.filter((step) => step.fallbackUsed).length,
  };
  const resultWithoutId = {
    ...generated,
    sequenceLength: input.sequenceLength,
    overallDuration: input.desiredOverallDuration,
    prospectId: memoryResult.memory?.prospect.id,
    prospectMemory: memoryResult.memory,
    semanticIntakeMode: memoryResult.extractionMode,
    recordsUsed: records,
    sourceReferences: sources,
    provider: providerMetadata,
    diagnostics,
  };
  const draftId = await persistence.persistDraft({
    creatorId,
    prospectId: memoryResult.memory?.prospect.id,
    request: input,
    result: resultWithoutId,
  });

  return ok<BuildSequenceResult>({
    draftId,
    ...resultWithoutId,
  });
}
