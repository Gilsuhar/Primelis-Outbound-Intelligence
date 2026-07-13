import { randomUUID } from "node:crypto";

import { z } from "zod";

import {
  approvedIcpSummary,
  assessAccountFit,
  classifySignalBrainQuestion,
  evaluateClaimSafety,
  recommendPersona,
} from "@/features/ask-signal-brain/brain-policy";
import {
  signalBrainIntents,
  signalBrainModes,
  type CaseStudyRecommendation,
  type SignalBrainInput,
  type SignalBrainKnowledgeRecord,
  type SignalBrainResult,
  type SignalBrainSourceReference,
} from "@/features/ask-signal-brain/types";
import { personas } from "@/features/playbook/playbook-content";
import { prisma, type MinimalPrismaClient } from "@/lib/prisma";

import { createSignalBrainProvider, type SignalBrainProvider } from "./ask-signal-brain-provider";
import {
  createInitialDraftVersion,
  PrismaDraftVersionPersistence,
} from "./draft-versioning-service";
import { err, ok } from "./result";

const signalBrainInputSchema = z.object({
  question: z.string().trim().min(8).max(4000),
  companyName: z.string().trim().max(180).optional(),
  companyWebsite: z.string().trim().max(240).optional(),
  contactRole: z.string().trim().max(160).optional(),
  industry: z.string().trim().max(160).optional(),
  companySizeOrRevenue: z.string().trim().max(240).optional(),
  geographyOrMarkets: z.string().trim().max(240).optional(),
  paidSearchContext: z.string().trim().max(700).optional(),
  currentVendor: z.string().trim().max(160).optional(),
  observedTrigger: z.string().trim().max(700).optional(),
  internalNotes: z.string().trim().max(1600).optional(),
  mode: z.enum(signalBrainModes),
  creatorId: z.string().trim().min(1).optional(),
});

type Row = Record<string, unknown>;

export type SignalBrainPersistence = {
  getActor(actorId: string): Promise<{ id: string; role: string } | null>;
  retrieveEligibleKnowledge(input: SignalBrainInput): Promise<SignalBrainKnowledgeRecord[]>;
  persistDraft(input: {
    creatorId: string;
    request: SignalBrainInput;
    result: Omit<SignalBrainResult, "draftId">;
  }): Promise<string>;
};

export type SignalBrainDependencies = {
  provider?: SignalBrainProvider;
  persistence?: SignalBrainPersistence;
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
  return /\b(adthena|revvim|auction insights).*(bad|worse|limited|inferior|fails|can't|cannot|better than|beats)\b/i.test(
    text,
  );
}

function containsCommercialTerms(text: string) {
  return /\b(pricing|price|poc|proof of concept|trial|discount|commercial offer)\b/i.test(text);
}

function containsBlockedCertainty(text: string) {
  return /\b(always|guarantee(?:d|s)?|without affecting|50%|50 percent|by half)\b/i.test(text);
}

function sanitizeGeneratedText(text: string) {
  return text
    .replace(
      /\b(pricing|price|poc|proof of concept|trial|discount|commercial offer)\b/gi,
      "commercial terms",
    )
    .replace(/\bguarantee(?:d|s)?\b/gi, "support")
    .replace(/\balways\b/gi, "can");
}

function mapKnowledgeRow(row: Row): SignalBrainKnowledgeRecord {
  return {
    id: asString(row.id),
    title: asString(row.title),
    type: asString(row.type) as SignalBrainKnowledgeRecord["type"],
    approvedText:
      asOptionalString(row.approvedWording) ??
      asOptionalString(row.body) ??
      asOptionalString(row.summary) ??
      "",
    channels: asStringArray(row.channels) as SignalBrainKnowledgeRecord["channels"],
    usageRestrictions: asOptionalString(row.usageRestrictions),
    usageScope: asOptionalString(row.usageScope),
    metrics: asStringArray(row.metrics),
    sourceIds: asStringArray(row.sourceIds),
    sourceTitles: asStringArray(row.sourceTitles),
    sourceDates: asStringArray(row.sourceDates),
  };
}

function playbookRecords(): SignalBrainKnowledgeRecord[] {
  return [
    {
      id: "playbook-icp-v1",
      title: "Signal ICP v1",
      type: "PLAYBOOK_GUIDANCE",
      approvedText: approvedIcpSummary(),
      channels: ["INTERNAL"],
      sourceIds: ["playbook"],
      sourceTitles: ["Signal Playbook"],
      sourceDates: [],
    },
    {
      id: "playbook-personas-v1",
      title: "Signal persona framework",
      type: "PLAYBOOK_GUIDANCE",
      approvedText: personas
        .map((persona) => `${persona.tier}: ${persona.name}. ${persona.relevance}`)
        .join(" "),
      channels: ["INTERNAL"],
      sourceIds: ["playbook"],
      sourceTitles: ["Signal Playbook"],
      sourceDates: [],
    },
  ];
}

function isKnowledgeItemEligible(record: SignalBrainKnowledgeRecord) {
  if (!record.approvedText.trim() || record.sourceIds.length === 0) {
    return false;
  }
  if (!(
    record.channels.includes("INTERNAL") ||
    record.channels.includes("EMAIL") ||
    record.channels.includes("LINKEDIN")
  )) {
    return false;
  }
  if (record.usageRestrictions?.trim()) {
    return false;
  }
  if (containsCommercialTerms(`${record.title} ${record.approvedText}`)) {
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

function isCaseStudyEligible(record: SignalBrainKnowledgeRecord, input: SignalBrainInput) {
  if (
    record.type !== "CASE_STUDY" ||
    !record.approvedText.trim() ||
    record.sourceIds.length === 0 ||
    record.usageRestrictions?.trim()
  ) {
    return false;
  }
  const externalUseRequested = /\b(outreach|email|linkedin|public|send|deck)\b/i.test(
    `${input.question} ${input.mode}`,
  );
  if (!externalUseRequested) {
    return Boolean(record.usageScope);
  }
  return ["SALES_REPLY_ONLY", "EMAIL_AND_LINKEDIN", "PUBLIC_MARKETING", "DECK_ONLY"].includes(
    record.usageScope ?? "",
  );
}

function isRecordEligible(record: SignalBrainKnowledgeRecord, input: SignalBrainInput) {
  if (record.type === "PLAYBOOK_GUIDANCE") {
    return isKnowledgeItemEligible(record);
  }
  if (record.type === "CASE_STUDY") {
    return isCaseStudyEligible(record, input);
  }
  return isKnowledgeItemEligible(record);
}

function sourceReferences(records: SignalBrainKnowledgeRecord[]): SignalBrainSourceReference[] {
  const references = new Map<string, SignalBrainSourceReference>();
  for (const record of records) {
    record.sourceIds.forEach((id, index) => {
      if (!references.has(id)) {
        references.set(id, {
          id,
          title: record.sourceTitles[index] ?? "Signal Playbook",
          sourceDate: record.sourceDates[index],
        });
      }
    });
  }
  return Array.from(references.values());
}

function safetyWarningsFor(input: SignalBrainInput, records: SignalBrainKnowledgeRecord[]) {
  const warnings = new Set<string>();
  const combined = [
    input.question,
    input.currentVendor,
    input.paidSearchContext,
    input.observedTrigger,
    input.internalNotes,
  ]
    .filter(Boolean)
    .join(" ");
  if (containsCompetitorClaim(combined)) {
    warnings.add("Unsupported competitor claims were blocked.");
  }
  if (/\b(adthena|revvim|auction insights)\b/i.test(combined)) {
    warnings.add(
      "Competitor context should validate the current setup and avoid replacement pressure.",
    );
  }
  if (containsCommercialTerms(combined)) {
    warnings.add("Pricing, POC, trial, discount, and commercial-offer language was blocked.");
  }
  if (containsBlockedCertainty(combined)) {
    warnings.add("Guarantees, universal savings claims, and unverified metrics were blocked.");
  }
  if (records.length === 0) {
    warnings.add("No approved eligible Signal knowledge was available.");
  }
  const restrictedCaseStudies = records.filter(
    (record) =>
      record.type === "CASE_STUDY" &&
      !["EMAIL_AND_LINKEDIN", "PUBLIC_MARKETING"].includes(record.usageScope ?? ""),
  );
  if (restrictedCaseStudies.length > 0) {
    warnings.add(
      "Some case-study evidence is restricted for external use; review usage scope before sending.",
    );
  }
  return Array.from(warnings);
}

function selectCaseStudyRecommendation(
  records: SignalBrainKnowledgeRecord[],
  input: SignalBrainInput,
): CaseStudyRecommendation | undefined {
  const caseStudy = records.find((record) => record.type === "CASE_STUDY");
  if (!caseStudy) {
    return undefined;
  }

  return {
    recommendedCaseStudy: caseStudy.title,
    whyItFits: `It is the closest eligible approved case study for ${input.industry ?? "the provided context"}.`,
    bestFitIndustry: input.industry ?? "Use only when the industry fit is verified.",
    bestFitPersona: input.contactRole ?? "Paid Search or Performance owner",
    bestFitObjection: "Use for proof requests only when the usage scope permits it.",
    eligibleUsageScope: caseStudy.usageScope ?? "Restricted",
    approvedMetrics: caseStudy.metrics ?? [],
    externalUseWarning: ["EMAIL_AND_LINKEDIN", "PUBLIC_MARKETING"].includes(
      caseStudy.usageScope ?? "",
    )
      ? "Eligible for external use within the selected scope."
      : "Restricted for external outreach unless a knowledge admin approves that usage.",
  };
}

function validateGeneration(result: Omit<SignalBrainResult, "draftId">) {
  if (!signalBrainIntents.some((intent) => result.detectedIntent.includes(intent))) {
    return false;
  }
  const rendered = JSON.stringify({
    directAnswer: result.directAnswer,
    conciseRecommendation: result.conciseRecommendation,
    reasoningSummary: result.reasoningSummary,
    recommendedNextAction: result.recommendedNextAction,
    claimSafetyAlternative: result.claimSafety?.saferAlternative,
  });
  if (containsCommercialTerms(rendered) || containsCompetitorClaim(rendered)) {
    return false;
  }
  return true;
}

export class PrismaSignalBrainPersistence implements SignalBrainPersistence {
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

  async retrieveEligibleKnowledge(input: SignalBrainInput) {
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
        ARRAY[]::text[] AS metrics,
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
        ARRAY['INTERNAL', 'EMAIL', 'LINKEDIN']::"Channel"[] AS channels,
        cs."usageRestrictions",
        cs."usageScope"::text AS "usageScope",
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT CONCAT(csm."metricName", ': ', csm.value)), NULL) AS metrics,
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
    const databaseRecords = rows.map(mapKnowledgeRow).filter((record) => {
      if (record.type === "CASE_STUDY") {
        return isCaseStudyEligible(record, input);
      }
      return isKnowledgeItemEligible(record);
    });
    return [...playbookRecords(), ...databaseRecords];
  }

  async persistDraft({
    creatorId,
    request,
    result,
  }: {
    creatorId: string;
    request: SignalBrainInput;
    result: Omit<SignalBrainResult, "draftId">;
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
        'ASK_SIGNAL_BRAIN',
        ${JSON.stringify({
          workflow: "ASK_SIGNAL_BRAIN",
          mode: request.mode,
          detectedIntent: result.detectedIntent,
          safetyWarnings: result.safetyWarnings,
        })},
        ${JSON.stringify({
          ...request,
          fitResult: result.accountFit?.result,
          personaRecommendation: result.personaRecommendation,
        })}::jsonb,
        ${result.directAnswer},
        ${result.conciseRecommendation},
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

export async function askSignalBrain(
  rawInput: unknown,
  dependencies: SignalBrainDependencies = {},
) {
  const parsed = signalBrainInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", "Ask Signal Brain input is malformed.");
  }

  const input = parsed.data;
  const creatorId = input.creatorId ?? "seed-sales-user";
  const persistence = dependencies.persistence ?? new PrismaSignalBrainPersistence();
  const actor = await persistence.getActor(creatorId);
  if (!actor || !["SALES_USER", "KNOWLEDGE_ADMIN"].includes(actor.role)) {
    return err("FORBIDDEN", "Only authorized sales or knowledge users can ask Signal Brain.");
  }

  const provider = dependencies.provider ?? createSignalBrainProvider();
  const intents = classifySignalBrainQuestion(input);
  const records = (await persistence.retrieveEligibleKnowledge(input)).filter((record) =>
    isRecordEligible(record, input),
  );
  const sources = sourceReferences(records);
  const accountFit =
    input.mode === "ACCOUNT_QUALIFICATION" || intents.includes("ACCOUNT_QUALIFICATION")
      ? assessAccountFit(input)
      : undefined;
  const personaRecommendation =
    input.mode === "PERSONA_RECOMMENDATION" || intents.includes("PERSONA_TARGETING")
      ? recommendPersona(input)
      : undefined;
  const claimSafety =
    input.mode === "CLAIM_SAFETY_CHECK" || intents.includes("CLAIM_SAFETY")
      ? evaluateClaimSafety(input)
      : undefined;
  const caseStudyRecommendation =
    input.mode === "CASE_STUDY_SELECTION" || intents.includes("CASE_STUDY_SELECTION")
      ? selectCaseStudyRecommendation(records, input)
      : undefined;
  const safetyWarnings = safetyWarningsFor(input, records);
  const generated = await provider.generate({
    input,
    intents,
    records,
    safetyWarnings,
    accountFit,
    personaRecommendation,
    claimSafety,
    caseStudyRecommendation,
  });
  const resultWithoutId = {
    ...generated,
    directAnswer: sanitizeGeneratedText(generated.directAnswer),
    conciseRecommendation: sanitizeGeneratedText(generated.conciseRecommendation),
    reasoningSummary: sanitizeGeneratedText(generated.reasoningSummary),
    recommendedNextAction: sanitizeGeneratedText(generated.recommendedNextAction),
    detectedIntent: generated.detectedIntent.filter((intent) =>
      signalBrainIntents.includes(intent),
    ),
    recordsUsed: records,
    sourceReferences: sources,
    provider: provider.metadata,
  };

  if (!validateGeneration(resultWithoutId)) {
    return err("GENERATION_REJECTED", "Signal Brain answer failed safety validation.");
  }

  const draftId = await persistence.persistDraft({
    creatorId,
    request: input,
    result: resultWithoutId,
  });

  return ok<SignalBrainResult>({
    draftId,
    ...resultWithoutId,
  });
}
