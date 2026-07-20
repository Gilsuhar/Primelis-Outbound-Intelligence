import { randomUUID } from "node:crypto";

import { z } from "zod";

import {
  prospectIntents,
  replyChannels,
  replyLengths,
  replyTones,
  type ProspectIntent,
  type ReplyKnowledgeRecord,
  type ReplySourceReference,
  type ReplyToProspectInput,
  type ReplyToProspectResult,
} from "@/features/reply-to-prospect/types";
import { defaultOutputLanguage, outputLanguages } from "@/lib/output-language";
import { prisma, type MinimalPrismaClient } from "@/lib/prisma";

import { createReplyAiProvider, type ReplyAiProvider } from "./reply-to-prospect-provider";
import {
  createInitialDraftVersion,
  PrismaDraftVersionPersistence,
} from "./draft-versioning-service";
import { detectConversationStage, lastProspectTurn } from "./reply-conversation-stage";
import { err, ok } from "./result";

const replyInputSchema = z.object({
  prospectMessage: z.string().trim().min(10).max(4000),
  companyName: z.string().trim().max(160).optional(),
  contactRole: z.string().trim().max(160).optional(),
  channel: z.enum(replyChannels),
  desiredTone: z.enum(replyTones),
  desiredLength: z.enum(replyLengths),
  outputLanguage: z.enum(outputLanguages).optional().default(defaultOutputLanguage),
  contextNotes: z.string().trim().max(2000).optional(),
  creatorId: z.string().trim().min(1).optional(),
});

type Row = Record<string, unknown>;

export type ReplyPersistence = {
  retrieveEligibleKnowledge(input: ReplyToProspectInput): Promise<ReplyKnowledgeRecord[]>;
  persistDraft(input: {
    creatorId: string;
    request: ReplyToProspectInput;
    result: Omit<ReplyToProspectResult, "draftId">;
  }): Promise<string>;
};

export type ReplyToProspectDependencies = {
  provider?: ReplyAiProvider;
  persistence?: ReplyPersistence;
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
  return /\b(adthena|revvim|auction insights|competitor claim|versus|better than)\b/i.test(text);
}

function containsCommercialTerms(text: string) {
  return /\b(pricing|price|poc|proof of concept|trial|discount|commercial offer)\b/i.test(text);
}

function sanitizeGeneratedText(text: string) {
  return text.replace(
    /\b(pricing|price|poc|proof of concept|trial|discount)\b/gi,
    "commercial details",
  );
}

export function classifyProspectMessage(message: string): ProspectIntent[] {
  const text = lastProspectTurn(message).toLowerCase();
  const intents = new Set<ProspectIntent>();

  if (/\b(adthena|revvim|vendor|tool|platform|already use|current provider)\b/.test(text)) {
    intents.add("EXISTING_VENDOR");
  }
  if (/\b(api|technical|integrat|data|how does|setup|implementation)\b/.test(text)) {
    intents.add("TECHNICAL_QUESTION");
  }
  if (/\b(not interested|no thanks|happy with|too busy|not a priority)\b/.test(text)) {
    intents.add("NOT_INTERESTED");
  }
  if (/\b(cost|expensive|budget|why|concern|objection)\b/.test(text)) {
    intents.add("OBJECTION");
  }
  if (/\b(next quarter|later|timing|now|when|timeline)\b/.test(text)) {
    intents.add("TIMING");
  }
  if (/\b(deck|slides|overview|one pager|send info)\b/.test(text)) {
    intents.add("DECK_REQUEST");
  }
  if (
    /\b(methodology|measure|measurement|incremental|organic|paid search|brand search|branded ads|branded search|how do you handle)\b/.test(text)
  ) {
    intents.add("METHODOLOGY_QUESTION");
  }

  return intents.size > 0 ? Array.from(intents) : ["UNCLEAR_REQUEST"];
}

function mapKnowledgeRow(row: Row): ReplyKnowledgeRecord {
  return {
    id: asString(row.id),
    title: asString(row.title),
    type: asString(row.type) as ReplyKnowledgeRecord["type"],
    approvedText:
      asOptionalString(row.approvedWording) ??
      asOptionalString(row.body) ??
      asOptionalString(row.summary) ??
      "",
    channels: asStringArray(row.channels) as ReplyKnowledgeRecord["channels"],
    usageRestrictions: asOptionalString(row.usageRestrictions),
    sourceIds: asStringArray(row.sourceIds),
    sourceTitles: asStringArray(row.sourceTitles),
    sourceDates: asStringArray(row.sourceDates),
  };
}

function isRecordEligible(record: ReplyKnowledgeRecord, channel: ReplyToProspectInput["channel"]) {
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

function sourceReferences(records: ReplyKnowledgeRecord[]): ReplySourceReference[] {
  const references = new Map<string, ReplySourceReference>();
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

function safetyWarningsFor(input: ReplyToProspectInput, records: ReplyKnowledgeRecord[]) {
  const warnings = new Set<string>();
  const combinedInput = `${input.prospectMessage} ${input.contextNotes ?? ""}`;
  if (containsCompetitorClaim(combinedInput)) {
    warnings.add("Competitor-specific claims were excluded unless approved and source-backed.");
  }
  if (containsCommercialTerms(combinedInput)) {
    warnings.add(
      "Commercial terms were not introduced because approved knowledge does not support them.",
    );
  }
  if (records.length === 0) {
    warnings.add("No approved eligible Signal knowledge was available for this channel.");
  }
  const stage = detectConversationStage(input.prospectMessage);
  if (stage.deckRequestIsOld) {
    warnings.add("Conversation history shows the deck was already sent; do not offer to send it again.");
  }
  if (stage.pricingAlreadyAnswered) {
    warnings.add("Conversation history shows commercials were already answered; reply should move toward feedback or a walkthrough.");
  }
  return Array.from(warnings);
}

export class PrismaReplyPersistence implements ReplyPersistence {
  constructor(private readonly client: MinimalPrismaClient = prisma) {}

  async retrieveEligibleKnowledge(input: ReplyToProspectInput) {
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
    return rows.map(mapKnowledgeRow).filter((record) => isRecordEligible(record, input.channel));
  }

  async persistDraft({
    creatorId,
    request,
    result,
  }: {
    creatorId: string;
    request: ReplyToProspectInput;
    result: Omit<ReplyToProspectResult, "draftId">;
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
        'REPLY_TO_PROSPECT',
        ${JSON.stringify({ request, safetyWarnings: result.safetyWarnings })},
        ${JSON.stringify(request)}::jsonb,
        ${result.recommendedReply},
        ${result.shorterAlternative},
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

export async function generateReplyToProspect(
  rawInput: unknown,
  dependencies: ReplyToProspectDependencies = {},
) {
  const parsed = replyInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", "Reply to Prospect input is malformed.");
  }

  const input = parsed.data;
  const creatorId = input.creatorId ?? "seed-sales-user";
  const persistence = dependencies.persistence ?? new PrismaReplyPersistence();
  const provider = dependencies.provider ?? createReplyAiProvider();
  const intents = classifyProspectMessage(input.prospectMessage);
  const records = await persistence.retrieveEligibleKnowledge(input);
  const safetyWarnings = safetyWarningsFor(input, records);
  const generated = await provider.generate({ input, intents, records, safetyWarnings });
  const safeGenerated = {
    ...generated,
    recommendedReply: sanitizeGeneratedText(generated.recommendedReply),
    shorterAlternative: sanitizeGeneratedText(generated.shorterAlternative),
    claimsUsed: generated.claimsUsed.map(sanitizeGeneratedText),
    detectedIntent: generated.detectedIntent.filter((intent) =>
      prospectIntents.includes(intent),
    ) as ProspectIntent[],
  };
  const sources = sourceReferences(records);
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

  return ok<ReplyToProspectResult>({
    draftId,
    ...resultWithoutId,
  });
}
