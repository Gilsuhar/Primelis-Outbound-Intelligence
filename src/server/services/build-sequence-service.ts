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
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
    z.coerce.number().pipe(z.union([z.literal(3), z.literal(4), z.literal(5), z.literal(6)])),
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

function sanitizeGeneratedText(text: string) {
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

function mapKnowledgeRow(row: Row): SequenceKnowledgeRecord {
  return {
    id: asString(row.id),
    title: asString(row.title),
    type: asString(row.type) as SequenceKnowledgeRecord["type"],
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
    record.approvedText.trim().length > 0 &&
    record.sourceIds.length > 0 &&
    !record.usageRestrictions?.trim() &&
    (record.usageScope === "EMAIL_AND_LINKEDIN" || record.usageScope === "PUBLIC_MARKETING")
  );
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

function similarity(a: string, b: string) {
  const aWords = new Set(a.split(" ").filter((word) => word.length > 3));
  const bWords = new Set(b.split(" ").filter((word) => word.length > 3));
  if (aWords.size === 0 || bWords.size === 0) {
    return 0;
  }
  const intersection = Array.from(aWords).filter((word) => bWords.has(word)).length;
  return intersection / Math.min(aWords.size, bWords.size);
}

function validateSequenceGeneration(input: BuildSequenceInput, generation: SequenceGeneration) {
  const parsedSteps = z.array(sequenceStepSchema).safeParse(generation.steps);
  if (!parsedSteps.success) {
    return false;
  }

  const steps = parsedSteps.data;
  if (steps.length !== input.sequenceLength) {
    return false;
  }
  const stepNumbers = steps.map((step) => step.stepNumber);
  if (!stepNumbers.every((stepNumber, index) => stepNumber === index + 1)) {
    return false;
  }
  const purposes = new Set(steps.map((step) => step.purpose));
  if (purposes.size !== steps.length) {
    return false;
  }
  const allowedChannels = channelsForSequence(input.primaryChannel);
  if (!steps.every((step) => allowedChannels.includes(step.channel))) {
    return false;
  }
  if (
    input.primaryChannel === "MIXED" &&
    !(
      steps.some((step) => step.channel === "EMAIL") &&
      steps.some((step) => step.channel === "LINKEDIN")
    )
  ) {
    return false;
  }
  const normalized = steps.map(normalizedMessage);
  for (let index = 0; index < normalized.length; index += 1) {
    for (let compare = index + 1; compare < normalized.length; compare += 1) {
      if (similarity(normalized[index], normalized[compare]) > 0.9) {
        return false;
      }
    }
  }
  const finalStep = steps[steps.length - 1];
  if (
    finalStep.purpose !== "BREAKUP_CLOSE_LOOP" ||
    !/close the loop|not relevant|no problem|leave this|park this|timing|circle back/i.test(
      `${finalStep.messageBody} ${finalStep.cta}`,
    )
  ) {
    return false;
  }
  const rendered = JSON.stringify({
    overallStrategy: generation.overallStrategy,
    claimsUsed: generation.claimsUsed,
    steps: generation.steps,
  });
  if (containsCommercialTerms(rendered) || containsCompetitorClaim(rendered)) {
    return false;
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
        cs."approvedExternalWording" AS "approvedWording",
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
      WHERE cs."approvalStatus" = 'APPROVED'
      GROUP BY cs.id
      ORDER BY title ASC
    `;
    return rows.map(mapKnowledgeRow).filter((record) => {
      if (record.type === "CASE_STUDY") {
        return isCaseStudyEligible(record);
      }
      return isKnowledgeItemEligible(record, input);
    });
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
  const records = await persistence.retrieveEligibleKnowledge(input);
  const sources = sourceReferences(records);
  const selected = selectSequenceAngle(input);
  const baseGeneration = {
    overallStrategy: "",
    selectedAngle: selected.angle,
    angleRationale: selected.rationale,
    personaEmphasis: getSequencePersonaGuidance(input.contactRole),
    detectedAccountSignals: detectSequenceAccountSignals(input),
    safetyNotes: safetyNotes(input, records),
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

  if (!validateSequenceGeneration(input, generated)) {
    return err("GENERATION_REJECTED", "Generated sequence failed safety or quality validation.");
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
