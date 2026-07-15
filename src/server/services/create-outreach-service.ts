import { randomUUID } from "node:crypto";

import { z } from "zod";

import {
  detectAccountSignals,
  getPersonaGuidance,
  selectOutreachAngle,
} from "@/features/create-outreach/outreach-policy";
import {
  outreachChannels,
  outreachLengths,
  outreachMessageTypes,
  outreachTones,
  type CreateOutreachInput,
  type CreateOutreachResult,
  type OutreachGeneration,
  type OutreachKnowledgeRecord,
  type OutreachSourceReference,
} from "@/features/create-outreach/types";
import {
  mergeDefaultSuppressionRecords,
  searchDoNotContactRecords,
} from "@/features/do-not-contact/do-not-contact-policy";
import type { DoNotContactRecord, SuppressionSearchResult } from "@/features/do-not-contact/types";
import { defaultOutputLanguage, outputLanguages } from "@/lib/output-language";
import { prisma, type MinimalPrismaClient } from "@/lib/prisma";

import { createOutreachAiProvider, type OutreachAiProvider } from "./create-outreach-provider";
import {
  createInitialDraftVersion,
  PrismaDraftVersionPersistence,
} from "./draft-versioning-service";
import { err, ok } from "./result";

const createOutreachSchema = z.object({
  companyName: z.string().trim().min(1).max(180),
  companyWebsite: z.string().trim().max(240).optional(),
  contactFirstName: z.string().trim().max(80).optional(),
  contactRole: z.string().trim().min(1).max(160),
  industry: z.string().trim().max(160).optional(),
  companyContext: z.string().trim().max(240).optional(),
  geographyOrMarkets: z.string().trim().max(240).optional(),
  paidSearchContext: z.string().trim().max(500).optional(),
  currentVendor: z.string().trim().max(160).optional(),
  observedTrigger: z.string().trim().min(5).max(600),
  channel: z.enum(outreachChannels),
  messageType: z.enum(outreachMessageTypes),
  desiredTone: z.enum(outreachTones),
  desiredLength: z.enum(outreachLengths),
  outputLanguage: z.enum(outputLanguages).optional().default(defaultOutputLanguage),
  useCaseStudy: z.boolean().optional().default(false),
  internalNotes: z.string().trim().max(1200).optional(),
  creatorId: z.string().trim().min(1).optional(),
});

type Row = Record<string, unknown>;

export type CreateOutreachPersistence = {
  getActor(actorId: string): Promise<{ id: string; role: string } | null>;
  getSuppressionRecords(): Promise<DoNotContactRecord[]>;
  retrieveEligibleKnowledge(input: CreateOutreachInput): Promise<OutreachKnowledgeRecord[]>;
  persistDraft(input: {
    creatorId: string;
    request: CreateOutreachInput;
    result: Omit<CreateOutreachResult, "draftId">;
  }): Promise<string>;
};

export type CreateOutreachDependencies = {
  provider?: OutreachAiProvider;
  persistence?: CreateOutreachPersistence;
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

function sanitizeOutput(text: string) {
  return text.replace(
    /\b(pricing|price|poc|proof of concept|trial|discount|guarantee|guaranteed)\b/gi,
    "commercial details",
  );
}

function cleanSuppressionQuery(value: string | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

function findBlockedSuppressionMatch(
  records: DoNotContactRecord[],
  input: CreateOutreachInput,
): SuppressionSearchResult | undefined {
  const queries = Array.from(
    new Set(
      [input.companyName, input.companyWebsite]
        .map(cleanSuppressionQuery)
        .filter((query) => query.length > 0),
    ),
  );

  for (const query of queries) {
    const blocked = searchDoNotContactRecords(records, query).find((match) => match.blocked);
    if (blocked) {
      return blocked;
    }
  }
  return undefined;
}

function suppressionBlockMessage(match: SuppressionSearchResult) {
  const { record } = match;
  const status = record.status.replaceAll("_", " ").toLowerCase();
  const domain = record.domain ? ` (${record.domain})` : "";
  const reason = record.reason ? ` Reason: ${record.reason}` : "";
  return `Do not create outreach for this account. ${record.companyName}${domain} is in Do Not Contact / customer suppression as ${status}.${reason} Use it only as internal context or social proof, not as a target account.`;
}

function mapKnowledgeRow(row: Row): OutreachKnowledgeRecord {
  return {
    id: asString(row.id),
    title: asString(row.title),
    type: asString(row.type) as OutreachKnowledgeRecord["type"],
    approvedText:
      asOptionalString(row.approvedWording) ??
      asOptionalString(row.body) ??
      asOptionalString(row.summary) ??
      "",
    channels: asStringArray(row.channels) as OutreachKnowledgeRecord["channels"],
    usageRestrictions: asOptionalString(row.usageRestrictions),
    sourceIds: asStringArray(row.sourceIds),
    sourceTitles: asStringArray(row.sourceTitles),
    sourceDates: asStringArray(row.sourceDates),
  };
}

function mapCaseStudyRow(row: Row): OutreachKnowledgeRecord {
  return {
    id: asString(row.id),
    title: asString(row.title),
    type: "CASE_STUDY",
    approvedText: asOptionalString(row.approvedWording) ?? "",
    channels: ["EMAIL", "LINKEDIN", "INTERNAL"],
    usageRestrictions: asOptionalString(row.usageRestrictions),
    sourceIds: asStringArray(row.sourceIds),
    sourceTitles: asStringArray(row.sourceTitles),
    sourceDates: asStringArray(row.sourceDates),
  };
}

function isEligible(record: OutreachKnowledgeRecord, channel: CreateOutreachInput["channel"]) {
  if (!record.approvedText.trim() || record.sourceIds.length === 0) {
    return false;
  }
  if (!(record.channels.includes(channel) || record.channels.includes("INTERNAL"))) {
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

function sourceReferences(records: OutreachKnowledgeRecord[]): OutreachSourceReference[] {
  const references = new Map<string, OutreachSourceReference>();
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

function knowledgeLimitations(input: CreateOutreachInput, records: OutreachKnowledgeRecord[]) {
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
      "Named vendor context is user-provided; no unsupported competitor claims were used.",
    );
  }
  if (records.length === 0) {
    limitations.add("No approved eligible Signal knowledge was available for this channel.");
  }
  if (input.useCaseStudy && !input.industry) {
    limitations.add("Case-study proof was requested, but no industry was selected.");
  }
  return Array.from(limitations);
}

function safetyNotes(input: CreateOutreachInput, records: OutreachKnowledgeRecord[]) {
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
    notes.add("Competitor-specific claims were excluded unless approved and source-backed.");
  }
  if (containsCommercialTerms(combined)) {
    notes.add("Pricing, POC, trial, discount, and commercial-offer language was blocked.");
  }
  if (records.every((record) => record.type !== "OBJECTION")) {
    notes.add("Competitor objection records were not used.");
  }
  if (!input.useCaseStudy) {
    notes.add("Case studies were not used because the optional proof setting was off.");
  } else if (records.every((record) => record.type !== "CASE_STUDY")) {
    notes.add("No eligible industry-matched case study was available for this draft.");
  }
  return Array.from(notes);
}

export class PrismaCreateOutreachPersistence implements CreateOutreachPersistence {
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

  async retrieveEligibleKnowledge(input: CreateOutreachInput) {
    const knowledgeRows = await this.client.$queryRaw<Row[]>`
      SELECT
        ki.id,
        ki.title,
        ki.type,
        ki."approvedWording",
        ki.body,
        ki.summary,
        ki.channels,
        ki."usageRestrictions",
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT s.id), NULL) AS "sourceIds",
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT s.title), NULL) AS "sourceTitles",
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT s."sourceDate"::text), NULL) AS "sourceDates"
      FROM "KnowledgeItem" ki
      LEFT JOIN "_KnowledgeItemSources" kis ON kis."A" = ki.id
      LEFT JOIN "SourceDocument" s ON s.id = kis."B"
      WHERE ki."approvalStatus" = 'APPROVED'
        AND ki.type IN ('PRODUCT_TRUTH', 'MESSAGE_EXAMPLE', 'OBJECTION')
      GROUP BY ki.id
      ORDER BY ki."updatedAt" DESC
    `;
    const records = knowledgeRows
      .map(mapKnowledgeRow)
      .filter((record) => isEligible(record, input.channel));

    if (!input.useCaseStudy || !input.industry) {
      return records;
    }

    const caseStudyRows = await this.client.$queryRaw<Row[]>`
      SELECT
        cs.id,
        cs.title,
        cs."approvedExternalWording" AS "approvedWording",
        cs."usageRestrictions",
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT s.id), NULL) AS "sourceIds",
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT s.title), NULL) AS "sourceTitles",
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT s."sourceDate"::text), NULL) AS "sourceDates"
      FROM "CaseStudy" cs
      JOIN "_CaseStudyIndustries" csi ON csi."A" = cs.id
      JOIN "Industry" i ON i.id = csi."B"
      LEFT JOIN "_CaseStudySources" css ON css."A" = cs.id
      LEFT JOIN "SourceDocument" s ON s.id = css."B"
      WHERE cs."approvalStatus" = 'APPROVED'
        AND cs."approvedExternalWording" IS NOT NULL
        AND cs."usageScope" IN ('EMAIL_AND_LINKEDIN', 'PUBLIC_MARKETING')
        AND LOWER(i.name) = LOWER(${input.industry})
      GROUP BY cs.id
      ORDER BY cs."updatedAt" DESC
      LIMIT 1
    `;

    return [
      ...records,
      ...caseStudyRows.map(mapCaseStudyRow).filter((record) => isEligible(record, input.channel)),
    ];
  }

  async persistDraft({
    creatorId,
    request,
    result,
  }: {
    creatorId: string;
    request: CreateOutreachInput;
    result: Omit<CreateOutreachResult, "draftId">;
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
        'CREATE_OUTREACH',
        ${JSON.stringify({
          channel: request.channel,
          selectedAngle: result.selectedAngle,
          subjectLines: result.subjectLines,
          cta: result.cta,
          safetyNotes: result.safetyNotes,
        })},
        ${JSON.stringify(request)}::jsonb,
        ${result.recommendedMessage},
        ${result.shorterVersion},
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

export async function generateCreateOutreach(
  rawInput: unknown,
  dependencies: CreateOutreachDependencies = {},
) {
  const parsed = createOutreachSchema.safeParse(rawInput);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", "Create Outreach input is malformed.");
  }

  const input = parsed.data;
  const creatorId = input.creatorId ?? "seed-sales-user";
  const persistence = dependencies.persistence ?? new PrismaCreateOutreachPersistence();
  const actor = await persistence.getActor(creatorId);
  if (!actor || !["SALES_USER", "KNOWLEDGE_ADMIN"].includes(actor.role)) {
    return err("FORBIDDEN", "Only authorized sales or knowledge users can create outreach drafts.");
  }

  const suppressionRecords = await persistence.getSuppressionRecords();
  const blockedMatch = findBlockedSuppressionMatch(suppressionRecords, input);
  if (blockedMatch) {
    return err("SUPPRESSION_BLOCKED", suppressionBlockMessage(blockedMatch));
  }

  const provider = dependencies.provider ?? createOutreachAiProvider();
  const records = await persistence.retrieveEligibleKnowledge(input);
  const sources = sourceReferences(records);
  const selected = selectOutreachAngle(input);
  const baseGeneration = {
    selectedAngle: selected.angle,
    angleRationale: selected.rationale,
    detectedSignals: detectAccountSignals(input),
    personaGuidance: getPersonaGuidance(input.contactRole),
    knowledgeLimitations: knowledgeLimitations(input, records),
    safetyNotes: safetyNotes(input, records),
  };
  const generated = await provider.generate({
    input,
    records,
    sourceReferences: sources,
    generation: baseGeneration,
  });
  const safeGenerated: OutreachGeneration = {
    ...generated,
    subjectLines:
      input.channel === "EMAIL" ? generated.subjectLines.map(sanitizeOutput).slice(0, 3) : [],
    connectionRequest:
      input.channel === "LINKEDIN" && generated.connectionRequest
        ? sanitizeOutput(generated.connectionRequest)
        : undefined,
    recommendedMessage: sanitizeOutput(generated.recommendedMessage),
    emailSections: generated.emailSections.map((section) => ({
      ...section,
      text: sanitizeOutput(section.text),
    })),
    shorterVersion: sanitizeOutput(generated.shorterVersion),
    cta: sanitizeOutput(generated.cta),
    claimsUsed: generated.claimsUsed.map(sanitizeOutput),
    safetyNotes: Array.from(new Set([...generated.safetyNotes, ...baseGeneration.safetyNotes])),
  };
  const resultWithoutId = {
    ...safeGenerated,
    recordsUsed: records,
    sourceReferences: sources,
    provider: provider.metadata,
  };
  const draftId = await persistence.persistDraft({
    creatorId,
    request: input,
    result: resultWithoutId,
  });

  return ok<CreateOutreachResult>({
    draftId,
    ...resultWithoutId,
  });
}
