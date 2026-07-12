import { randomUUID } from "node:crypto";

import { z } from "zod";

import { fixtureUsers } from "@/data/fixtures/knowledge-fixtures";
import {
  caseStudyUsageScopes,
  importedSignalCategories,
  type CaseStudyUsageScope,
  type ImportedSignalCategory,
  type ImportedSignalMetric,
  type ImportedSignalRecord,
  type ImportedSignalReviewHistory,
  type ImportedSignalSource,
  type ReviewActor,
} from "@/features/imported-signal-review/types";
import {
  canBulkReviewRecord,
  getImportedReviewError,
  getImportedSignalProgress,
  reviewActionTargets,
  type ImportedSignalBulkAction,
  type ImportedSignalReviewAction,
} from "@/features/imported-signal-review/review-policy";
import { channelTags } from "@/features/knowledge/types";
import { prisma, type MinimalPrismaClient } from "@/lib/prisma";

import { err, ok } from "./result";

const importPrefix = "signal-pack-v0-1";
const importedIdPattern = `${importPrefix}-%`;

const reviewActionSchema = z.object({
  actorId: z.string().min(1),
  recordId: z.string().min(1),
  category: z.enum(importedSignalCategories),
  action: z.enum(["APPROVE", "RESTRICT", "REJECT", "RETURN_TO_REVIEW"]),
  approvedWording: z.string().trim().optional(),
  internalNotes: z.string().trim().optional(),
  usageRestrictions: z.string().trim().optional(),
  usageScope: z.enum(caseStudyUsageScopes).optional(),
  channels: z.array(z.enum(channelTags)).optional(),
  reason: z.string().trim().optional(),
});

const bulkActionSchema = z.object({
  actorId: z.string().min(1),
  recordIds: z.array(z.string().min(1)).min(1),
  action: z.enum(["RETURN_TO_REVIEW", "RESTRICT", "APPROVE_MESSAGING_RULES"]),
  reason: z.string().trim().optional(),
});

type Row = Record<string, unknown>;

type ImportedReviewQueryDependencies = {
  records?: ImportedSignalRecord[];
};

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asOptionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asDateString(value: unknown) {
  return value instanceof Date ? value.toISOString() : asOptionalString(value);
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function sourceFromRow(row: Row): ImportedSignalSource {
  return {
    id: asString(row.id),
    title: asString(row.title),
    sourceType: asString(row.sourceType) as ImportedSignalSource["sourceType"],
    sourceDate: asDateString(row.sourceDate),
    externalUrl: asOptionalString(row.externalUrl),
    fileReference: asOptionalString(row.fileReference),
    description: asOptionalString(row.description),
  };
}

function metricFromRow(row: Row): ImportedSignalMetric {
  return {
    id: asString(row.id),
    metricName: asString(row.metricName),
    value: asString(row.value),
    unit: asOptionalString(row.unit),
    direction: asString(row.direction),
    comparison: asOptionalString(row.comparison),
    approvedWording: asOptionalString(row.approvedWording),
  };
}

function historyFromRow(row: Row): ImportedSignalReviewHistory {
  return {
    id: asString(row.id),
    actorName: asOptionalString(row.actorName) ?? "Unknown reviewer",
    action: asOptionalString(row.action),
    fromStatus: asOptionalString(row.fromStatus) as ImportedSignalReviewHistory["fromStatus"],
    toStatus: asOptionalString(row.toStatus) as ImportedSignalReviewHistory["toStatus"],
    reason: asOptionalString(row.reason),
    internalNote: asOptionalString(row.internalNote),
    createdAt: asDateString(row.createdAt) ?? new Date().toISOString(),
  };
}

function categoryForKnowledgeType(type: string): ImportedSignalCategory {
  if (type === "OBJECTION") {
    return "OBJECTION";
  }
  if (type === "MESSAGE_EXAMPLE") {
    return "MESSAGE_RULE";
  }
  return "PRODUCT_TRUTH";
}

function contentTypeForCategory(category: ImportedSignalCategory) {
  const labels: Record<ImportedSignalCategory, string> = {
    PRODUCT_TRUTH: "Product Truth",
    CASE_STUDY: "Case Study",
    OBJECTION: "Objection",
    MESSAGE_RULE: "Messaging Rule",
    SOURCE: "Source",
  };
  return labels[category];
}

function hasCompetitorLanguage(record: Pick<ImportedSignalRecord, "title" | "originalText">) {
  return /\b(competitor|competitors|adthena|revvim|auction insights)\b/i.test(
    `${record.title} ${record.originalText}`,
  );
}

async function getActor(actorId: string): Promise<ReviewActor | null> {
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT id, name, role
    FROM "User"
    WHERE id = ${actorId}
    LIMIT 1
  `;
  const row = rows[0];

  if (row) {
    return {
      id: asString(row.id),
      name: asOptionalString(row.name) ?? asString(row.id),
      role: asString(row.role) as ReviewActor["role"],
    };
  }

  return fixtureUsers.find((user) => user.id === actorId) ?? null;
}

async function getKnowledgeRecords() {
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT
      ki.*,
      u.name AS "reviewOwner",
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT s.id), NULL) AS "sourceIds",
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT s.title), NULL) AS "sourceTitles",
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT s."sourceType"::text), NULL) AS "sourceTypes",
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT s."sourceDate"), NULL) AS "sourceDates"
    FROM "KnowledgeItem" ki
    LEFT JOIN "User" u ON u.id = ki."reviewOwnerId"
    LEFT JOIN "_KnowledgeItemSources" kis ON kis."A" = ki.id
    LEFT JOIN "SourceDocument" s ON s.id = kis."B"
    WHERE ki.id LIKE ${importedIdPattern}
      AND (
        ki.id LIKE ${`${importPrefix}-knowledge-%`}
        OR ki.id LIKE ${`${importPrefix}-knowledge-objection-%`}
        OR ki.id LIKE ${`${importPrefix}-message-rule-%`}
      )
    GROUP BY ki.id, u.name
    ORDER BY ki.type, ki.title
  `;

  return rows.map((row) => {
    const category = categoryForKnowledgeType(asString(row.type));
    const sourceIds = asStringArray(row.sourceIds);
    const sourceTitles = asStringArray(row.sourceTitles);
    const sourceTypes = asStringArray(row.sourceTypes);
    const sourceDates = Array.isArray(row.sourceDates) ? row.sourceDates : [];
    const originalText = asOptionalString(row.body) ?? asOptionalString(row.summary) ?? "";
    const record: ImportedSignalRecord = {
      id: asString(row.id),
      category,
      title: asString(row.title),
      contentType: contentTypeForCategory(category),
      status: asString(row.approvalStatus) as ImportedSignalRecord["status"],
      originalText,
      approvedWording: asOptionalString(row.approvedWording),
      internalNotes: asOptionalString(row.internalNotes),
      usageRestrictions: asOptionalString(row.usageRestrictions),
      channels: asStringArray(row.channels) as ImportedSignalRecord["channels"],
      industries: [],
      personas: [],
      sourceDate: asDateString(sourceDates[0]),
      lastReviewedDate: asDateString(row.lastReviewedAt),
      reviewOwner: asOptionalString(row.reviewOwner),
      sources: sourceIds.map((id, index) => ({
        id,
        title: sourceTitles[index] ?? id,
        sourceType: (sourceTypes[index] ?? "OTHER") as ImportedSignalSource["sourceType"],
        sourceDate: asDateString(sourceDates[index]),
      })),
      metrics: [],
      reviewHistory: [],
      isNamedCustomerCaseStudy: false,
      isCompetitorRelated: false,
    };
    return { ...record, isCompetitorRelated: hasCompetitorLanguage(record) };
  });
}

async function getSourceRecords() {
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT sd.*, u.name AS "reviewOwner"
    FROM "SourceDocument" sd
    LEFT JOIN "User" u ON u.id = sd."reviewOwnerId"
    WHERE sd.id LIKE ${`${importPrefix}-source-%`}
    ORDER BY sd.title
  `;

  return rows.map((row) => {
    const originalText =
      asOptionalString(row.description) ?? asOptionalString(row.fileReference) ?? "";
    const record: ImportedSignalRecord = {
      id: asString(row.id),
      category: "SOURCE",
      title: asString(row.title),
      contentType: "Source",
      status: asString(row.approvalStatus) as ImportedSignalRecord["status"],
      originalText,
      approvedWording: asOptionalString(row.approvedWording),
      internalNotes: asOptionalString(row.internalNotes),
      usageRestrictions: asOptionalString(row.usageRestrictions),
      channels: ["INTERNAL"],
      industries: [],
      personas: [],
      sourceDate: asDateString(row.sourceDate),
      lastReviewedDate: asDateString(row.lastReviewedAt),
      reviewOwner: asOptionalString(row.reviewOwner),
      sources: [sourceFromRow(row)],
      metrics: [],
      reviewHistory: [],
      isNamedCustomerCaseStudy: false,
      isCompetitorRelated: hasCompetitorLanguage({ title: asString(row.title), originalText }),
    };
    return record;
  });
}

async function getCaseStudyRecords() {
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT cs.*, u.name AS "reviewOwner",
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT i.name), NULL) AS industries,
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT s.id), NULL) AS "sourceIds",
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT s.title), NULL) AS "sourceTitles",
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT s."sourceType"::text), NULL) AS "sourceTypes",
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT s."sourceDate"), NULL) AS "sourceDates"
    FROM "CaseStudy" cs
    LEFT JOIN "User" u ON u.id = cs."reviewOwnerId"
    LEFT JOIN "_CaseStudyIndustries" csi ON csi."A" = cs.id
    LEFT JOIN "Industry" i ON i.id = csi."B"
    LEFT JOIN "_CaseStudySources" css ON css."A" = cs.id
    LEFT JOIN "SourceDocument" s ON s.id = css."B"
    WHERE cs.id LIKE ${`${importPrefix}-case-study-%`}
    GROUP BY cs.id, u.name
    ORDER BY cs.companyName
  `;
  const metrics = await prisma.$queryRaw<Row[]>`
    SELECT *
    FROM "CaseStudyMetric"
    WHERE "caseStudyId" LIKE ${`${importPrefix}-case-study-%`}
    ORDER BY "metricName"
  `;
  const metricsByCaseStudy = new Map<string, ImportedSignalMetric[]>();
  for (const metric of metrics) {
    const caseStudyId = asString(metric.caseStudyId);
    metricsByCaseStudy.set(caseStudyId, [
      ...(metricsByCaseStudy.get(caseStudyId) ?? []),
      metricFromRow(metric),
    ]);
  }

  return rows.map((row) => {
    const sourceIds = asStringArray(row.sourceIds);
    const sourceTitles = asStringArray(row.sourceTitles);
    const sourceTypes = asStringArray(row.sourceTypes);
    const sourceDates = Array.isArray(row.sourceDates) ? row.sourceDates : [];
    return {
      id: asString(row.id),
      category: "CASE_STUDY" as const,
      title: asString(row.title),
      contentType: "Case Study",
      status: asString(row.approvalStatus) as ImportedSignalRecord["status"],
      originalText: [row.initialProblem, row.signalApproach].filter(Boolean).join("\n\n"),
      approvedWording: asOptionalString(row.approvedExternalWording),
      internalNotes: asOptionalString(row.internalNotes),
      usageRestrictions: asOptionalString(row.usageRestrictions),
      usageScope: asOptionalString(row.usageScope) as ImportedSignalRecord["usageScope"],
      channels: [],
      industries: asStringArray(row.industries),
      personas: [],
      sourceDate: asDateString(sourceDates[0]),
      lastReviewedDate: asDateString(row.lastReviewedAt),
      reviewOwner: asOptionalString(row.reviewOwner),
      sources: sourceIds.map((id, index) => ({
        id,
        title: sourceTitles[index] ?? id,
        sourceType: (sourceTypes[index] ?? "OTHER") as ImportedSignalSource["sourceType"],
        sourceDate: asDateString(sourceDates[index]),
      })),
      metrics: metricsByCaseStudy.get(asString(row.id)) ?? [],
      companyName: asString(row.companyName),
      initialProblem: asOptionalString(row.initialProblem),
      signalApproach: asOptionalString(row.signalApproach),
      activationDuration: asOptionalString(row.activationDuration),
      reviewHistory: [],
      isNamedCustomerCaseStudy: true,
      isCompetitorRelated: false,
    };
  });
}

async function attachReviewHistory(records: ImportedSignalRecord[]) {
  const historyRows = await prisma.$queryRaw<Row[]>`
    SELECT rd.*, u.name AS "actorName"
    FROM "ReviewDecision" rd
    LEFT JOIN "User" u ON u.id = rd."actorId"
    WHERE rd."knowledgeItemId" LIKE ${importedIdPattern}
      OR rd."caseStudyId" LIKE ${importedIdPattern}
      OR rd."sourceDocumentId" LIKE ${importedIdPattern}
    ORDER BY rd."createdAt" DESC
  `;
  const byRecord = new Map<string, ImportedSignalReviewHistory[]>();
  for (const row of historyRows) {
    const id =
      asOptionalString(row.knowledgeItemId) ??
      asOptionalString(row.caseStudyId) ??
      asOptionalString(row.sourceDocumentId);
    if (!id) {
      continue;
    }
    byRecord.set(id, [...(byRecord.get(id) ?? []), historyFromRow(row)]);
  }
  return records.map((record) => ({
    ...record,
    reviewHistory: byRecord.get(record.id) ?? [],
  }));
}

export async function retrieveImportedSignalReview(dependencies?: ImportedReviewQueryDependencies) {
  const records =
    dependencies?.records ??
    (await attachReviewHistory([
      ...(await getKnowledgeRecords()),
      ...(await getCaseStudyRecords()),
      ...(await getSourceRecords()),
    ]));

  return ok({
    records,
    progress: getImportedSignalProgress(records),
    sources: Array.from(
      new Map(
        records.flatMap((record) => record.sources).map((source) => [source.id, source]),
      ).values(),
    ),
    industries: Array.from(new Set(records.flatMap((record) => record.industries))).sort(),
  });
}

async function findImportedRecord(recordId: string) {
  const result = await retrieveImportedSignalReview();
  if (!result.ok) {
    return null;
  }
  return result.data.records.find((record) => record.id === recordId) ?? null;
}

function decisionTypeFor(action: ImportedSignalReviewAction) {
  const decisionTypes: Record<ImportedSignalReviewAction, string> = {
    APPROVE: "APPROVED",
    RESTRICT: "RESTRICTED",
    REJECT: "REJECTED",
    RETURN_TO_REVIEW: "RETURNED_TO_REVIEW",
  };
  return decisionTypes[action];
}

async function applyImportedReviewTransaction({
  tx,
  actor,
  record,
  action,
  approvedWording,
  internalNotes,
  usageRestrictions,
  usageScope,
  channels,
  reason,
}: {
  tx: MinimalPrismaClient;
  actor: ReviewActor;
  record: ImportedSignalRecord;
  action: ImportedSignalReviewAction;
  approvedWording?: string;
  internalNotes?: string;
  usageRestrictions?: string;
  usageScope?: CaseStudyUsageScope;
  channels?: string[];
  reason?: string;
}) {
  const toStatus = reviewActionTargets[action];
  const now = new Date();

  if (record.category === "CASE_STUDY") {
    await tx.$executeRaw`
      UPDATE "CaseStudy"
      SET "approvalStatus" = ${toStatus}::"ApprovalStatus",
          "approvedExternalWording" = ${approvedWording ?? record.approvedWording},
          "internalNotes" = ${internalNotes ?? record.internalNotes},
          "usageRestrictions" = ${usageRestrictions ?? record.usageRestrictions},
          "usageScope" = ${usageScope ?? record.usageScope}::"CaseStudyUsageScope",
          "reviewOwnerId" = ${actor.id},
          "lastReviewedAt" = ${now},
          "updatedAt" = ${now}
      WHERE id = ${record.id}
    `;
    await tx.$executeRaw`
      INSERT INTO "ReviewDecision" (
        id, "actorId", "decisionType", action, "fromStatus", "toStatus",
        reason, "internalNote", notes, "caseStudyId", "createdAt"
      )
      VALUES (
        ${randomUUID()}, ${actor.id}, ${decisionTypeFor(action)}::"ReviewDecisionType",
        ${action}, ${record.status}::"ApprovalStatus", ${toStatus}::"ApprovalStatus",
        ${reason}, ${internalNotes}, ${reason}, ${record.id}, ${now}
      )
    `;
    return;
  }

  if (record.category === "SOURCE") {
    await tx.$executeRaw`
      UPDATE "SourceDocument"
      SET "approvalStatus" = ${toStatus}::"ApprovalStatus",
          "approvedWording" = ${approvedWording ?? record.approvedWording},
          "internalNotes" = ${internalNotes ?? record.internalNotes},
          "usageRestrictions" = ${usageRestrictions ?? record.usageRestrictions},
          "reviewOwnerId" = ${actor.id},
          "lastReviewedAt" = ${now},
          "updatedAt" = ${now}
      WHERE id = ${record.id}
    `;
    await tx.$executeRaw`
      INSERT INTO "ReviewDecision" (
        id, "actorId", "decisionType", action, "fromStatus", "toStatus",
        reason, "internalNote", notes, "sourceDocumentId", "createdAt"
      )
      VALUES (
        ${randomUUID()}, ${actor.id}, ${decisionTypeFor(action)}::"ReviewDecisionType",
        ${action}, ${record.status}::"ApprovalStatus", ${toStatus}::"ApprovalStatus",
        ${reason}, ${internalNotes}, ${reason}, ${record.id}, ${now}
      )
    `;
    return;
  }

  await tx.$executeRaw`
    UPDATE "KnowledgeItem"
    SET "approvalStatus" = ${toStatus}::"ApprovalStatus",
        "approvedWording" = ${approvedWording ?? record.approvedWording},
        "internalNotes" = ${internalNotes ?? record.internalNotes},
        "usageRestrictions" = ${usageRestrictions ?? record.usageRestrictions},
        channels = ${channels ?? record.channels}::"Channel"[],
        "reviewOwnerId" = ${actor.id},
        "lastReviewedAt" = ${now},
        "updatedAt" = ${now}
    WHERE id = ${record.id}
  `;
  await tx.$executeRaw`
    INSERT INTO "ReviewDecision" (
      id, "actorId", "decisionType", action, "fromStatus", "toStatus",
      reason, "internalNote", notes, "knowledgeItemId", "createdAt"
    )
    VALUES (
      ${randomUUID()}, ${actor.id}, ${decisionTypeFor(action)}::"ReviewDecisionType",
      ${action}, ${record.status}::"ApprovalStatus", ${toStatus}::"ApprovalStatus",
      ${reason}, ${internalNotes}, ${reason}, ${record.id}, ${now}
    )
  `;
}

export async function reviewImportedSignalRecord(input: unknown) {
  const parsed = reviewActionSchema.safeParse(input);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", "Imported Signal review input is malformed.");
  }

  const actor = await getActor(parsed.data.actorId);
  if (!actor) {
    return err("ACTOR_NOT_FOUND", "The review actor was not found.");
  }

  const record = await findImportedRecord(parsed.data.recordId);
  if (!record || record.category !== parsed.data.category) {
    return err("RECORD_NOT_FOUND", "The imported Signal record was not found.");
  }

  const policyError = getImportedReviewError({
    actor,
    record,
    action: parsed.data.action,
    usageScope: parsed.data.usageScope,
  });
  if (policyError) {
    return err("REVIEW_FORBIDDEN", policyError);
  }

  await prisma.$transaction((tx) =>
    applyImportedReviewTransaction({
      tx,
      actor,
      record,
      action: parsed.data.action,
      approvedWording: parsed.data.approvedWording,
      internalNotes: parsed.data.internalNotes,
      usageRestrictions: parsed.data.usageRestrictions,
      usageScope: parsed.data.usageScope,
      channels: parsed.data.channels,
      reason: parsed.data.reason,
    }),
  );

  return ok({ recordId: record.id, status: reviewActionTargets[parsed.data.action] });
}

export async function bulkReviewImportedSignalRecords(input: unknown) {
  const parsed = bulkActionSchema.safeParse(input);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", "Imported Signal bulk review input is malformed.");
  }

  const actor = await getActor(parsed.data.actorId);
  if (!actor) {
    return err("ACTOR_NOT_FOUND", "The review actor was not found.");
  }

  const result = await retrieveImportedSignalReview();
  if (!result.ok) {
    return err("LOAD_FAILED", "Imported Signal records could not be loaded.");
  }

  const selectedRecords = result.data.records.filter((record) =>
    parsed.data.recordIds.includes(record.id),
  );
  const action = parsed.data.action as ImportedSignalBulkAction;
  const disallowed = selectedRecords.filter(
    (record) => !canBulkReviewRecord({ actor, record, action }),
  );
  if (disallowed.length > 0) {
    return err(
      "BULK_ACTION_FORBIDDEN",
      "One or more selected records cannot use that bulk action.",
    );
  }

  const reviewAction: ImportedSignalReviewAction =
    action === "APPROVE_MESSAGING_RULES" ? "APPROVE" : action;

  await prisma.$transaction(async (tx) => {
    for (const record of selectedRecords) {
      await applyImportedReviewTransaction({
        tx,
        actor,
        record,
        action: reviewAction,
        reason: parsed.data.reason ?? `Bulk ${action}`,
      });
    }
  });

  return ok({ updated: selectedRecords.length });
}
