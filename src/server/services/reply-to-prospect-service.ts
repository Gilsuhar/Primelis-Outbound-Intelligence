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
import {
  classifyReplyIntent,
  validateReplyOutput,
} from "@/features/reply-to-prospect/reply-intelligence";
import { selectProofForContext, validateProofUsage } from "@/features/proof/proof-policy";
import { defaultOutputLanguage, outputLanguages } from "@/lib/output-language";
import { prisma, type MinimalPrismaClient } from "@/lib/prisma";

import { createReplyAiProvider, type ReplyAiProvider } from "./reply-to-prospect-provider";
import {
  createInitialDraftVersion,
  PrismaDraftVersionPersistence,
} from "./draft-versioning-service";
import { detectConversationStage } from "./reply-conversation-stage";
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
  getActor(actorId: string): Promise<{ id: string; role: string } | null>;
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

function containsInternalPromptLabels(text: string) {
  return /\b(VERIFIED_INTERNAL_KNOWLEDGE|USER_PROVIDED_CONTEXT|CONVERSATION_HISTORY|APPROVED_PROOF|UNKNOWN_OR_UNVERIFIED|approvedKnowledge|approvedFacts|outputContract)\b/.test(
    text,
  );
}

export function classifyProspectMessage(message: string): ProspectIntent[] {
  const analysis = classifyReplyIntent({
    prospectMessage: message,
    channel: "EMAIL",
    desiredTone: "CONSULTATIVE",
    desiredLength: "STANDARD",
  });
  return Array.from(new Set([analysis.primaryIntent, ...analysis.secondaryIntents]));
}

function mapKnowledgeRow(row: Row): ReplyKnowledgeRecord {
  return {
    id: asString(row.id),
    title: asString(row.title),
    type: asString(row.type) as ReplyKnowledgeRecord["type"],
    approvalStatus: asOptionalString(row.approvalStatus),
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
  if (record.approvalStatus && record.approvalStatus !== "APPROVED") {
    return false;
  }
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
    warnings.add(
      "Conversation history shows the deck was already sent; do not offer to send it again.",
    );
  }
  if (stage.pricingAlreadyAnswered) {
    warnings.add(
      "Conversation history shows commercials were already answered; reply should move toward feedback or a walkthrough.",
    );
  }
  return Array.from(warnings);
}

function validateReplyGeneration(
  result: {
    recommendedReply: string;
    shorterAlternative: string;
  },
  analysis?: ReturnType<typeof classifyReplyIntent>,
) {
  const publicOutput = `${result.recommendedReply}\n${result.shorterAlternative}`;
  if (result.recommendedReply.trim().length < 10) {
    return false;
  }
  if (result.shorterAlternative.trim().length < 10) {
    return false;
  }
  if (containsInternalPromptLabels(publicOutput)) {
    return false;
  }
  if (analysis && !validateReplyOutput(result, analysis).ok) {
    return false;
  }
  return true;
}

function replyRequestsProof(input: ReplyToProspectInput, intents: ProspectIntent[]) {
  return (
    intents.includes("DECK_REQUEST") ||
    /\b(value|fee|pricing|commercials|cost|roi|savings|save|saved|case study|proof|example|deck|mql|sql|pipeline)\b/i.test(
      `${input.prospectMessage} ${input.contextNotes ?? ""}`,
    )
  );
}

export class PrismaReplyPersistence implements ReplyPersistence {
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

  async retrieveEligibleKnowledge(input: ReplyToProspectInput) {
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
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT s.id), NULL) AS "sourceIds",
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT s.title), NULL) AS "sourceTitles",
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT s."sourceDate"::text), NULL) AS "sourceDates"
      FROM "CaseStudy" cs
      LEFT JOIN "_CaseStudySources" css ON css."A" = cs.id
      LEFT JOIN "SourceDocument" s ON s.id = css."B"
      LEFT JOIN "CaseStudyMetric" csm ON csm."caseStudyId" = cs.id
      WHERE cs."approvalStatus" = 'APPROVED'
      GROUP BY cs.id
      ORDER BY title ASC
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
  const actor = await persistence.getActor(creatorId);
  if (!actor || !["SALES_USER", "KNOWLEDGE_ADMIN"].includes(actor.role)) {
    return err("FORBIDDEN", "Only authorized sales or knowledge users can reply to prospects.");
  }
  const provider = dependencies.provider ?? createReplyAiProvider();
  const replyAnalysis = classifyReplyIntent(input);
  const intents = Array.from(
    new Set([replyAnalysis.primaryIntent, ...replyAnalysis.secondaryIntents]),
  );
  const eligibleRecords = (await persistence.retrieveEligibleKnowledge(input)).filter((record) =>
    isRecordEligible(record, input.channel),
  );
  const proofSelection = selectProofForContext(eligibleRecords, {
    workflow: "REPLY_TO_PROSPECT",
    companyName: input.companyName,
    contactRole: input.contactRole,
    question: replyAnalysis.latestProspectMessage,
    conversation: [
      ...replyAnalysis.priorProspectMessages,
      ...replyAnalysis.priorSellerMessages,
      input.contextNotes,
    ]
      .filter(Boolean)
      .join("\n"),
    requestedProof: replyRequestsProof(input, intents),
  });
  const records = proofSelection.records as ReplyKnowledgeRecord[];
  const safetyWarnings = safetyWarningsFor(input, records);
  const generated = await provider.generate({
    input,
    intents,
    replyAnalysis,
    records,
    safetyWarnings: [...safetyWarnings, ...proofSelection.notes],
  });
  const safeGenerated = {
    ...generated,
    recommendedReply: sanitizeGeneratedText(generated.recommendedReply),
    shorterAlternative: sanitizeGeneratedText(generated.shorterAlternative),
    claimsUsed: generated.claimsUsed.map(sanitizeGeneratedText),
    detectedIntent: generated.detectedIntent.filter((intent) =>
      prospectIntents.includes(intent),
    ) as ProspectIntent[],
    safetyWarnings: Array.from(new Set([...generated.safetyWarnings, ...proofSelection.notes])),
  };
  if (!validateReplyGeneration(safeGenerated, replyAnalysis)) {
    return err("GENERATION_REJECTED", "Generated reply failed safety or quality validation.");
  }
  const proofValidation = validateProofUsage({
    output: [
      safeGenerated.recommendedReply,
      safeGenerated.shorterAlternative,
      ...safeGenerated.claimsUsed,
    ].join("\n"),
    selectedProof: proofSelection.selectedProof,
    availableProofRecords: eligibleRecords,
    maxMetricMentions: 1,
  });
  if (!proofValidation.ok) {
    return err(
      "GENERATION_REJECTED",
      `Generated reply failed proof validation. ${proofValidation.reason}`,
    );
  }
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
