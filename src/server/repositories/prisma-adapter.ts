import { randomUUID } from "node:crypto";

import { prisma, type MinimalPrismaClient } from "@/lib/prisma";
import type {
  ApprovalStatus,
  ChannelTag,
  ClaimFixture,
  GeneratedDraft,
  KnowledgeItemFixture,
  KnowledgeSubmissionFixture,
  KnowledgeType,
  ReviewHistoryEntry,
  SourceDocumentFixture,
  SourceType,
  UserRole,
} from "@/features/knowledge/types";
import { submitGeneratedDraftForReview } from "@/features/generated-drafts/generated-draft-service";
import { applyStatusTransition, type ReviewAction } from "@/features/review/status-transition";
import { createLocalSubmission, parseTagList } from "@/lib/validation/add-knowledge";
import type {
  CreateSubmissionInput,
  GeneratedDraftSubmissionInput,
  PersistenceRepositories,
  TransitionStatusInput,
} from "@/server/repositories/types";

type Row = Record<string, unknown>;
type ReviewDecisionType =
  "APPROVED" | "RESTRICTED" | "REJECTED" | "ARCHIVED" | "RETURNED_TO_REVIEW";

const reviewDecisionTypes: Record<ReviewAction, ReviewDecisionType> = {
  APPROVE: "APPROVED",
  RESTRICT: "RESTRICTED",
  ARCHIVE: "ARCHIVED",
  REJECT: "REJECTED",
  RETURN_TO_REVIEW: "RETURNED_TO_REVIEW",
};

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asOptionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function asDateString(value: unknown) {
  return value instanceof Date ? value.toISOString() : asOptionalString(value);
}

function asStatus(value: unknown): ApprovalStatus {
  return asString(value) as ApprovalStatus;
}

function asKnowledgeType(value: unknown): KnowledgeType {
  return asString(value) as KnowledgeType;
}

function asRole(value: unknown): UserRole {
  return asString(value) as UserRole;
}

function asChannelArray(value: unknown): ChannelTag[] {
  return asStringArray(value) as ChannelTag[];
}

function mapKnowledgeItem(row: Row): KnowledgeItemFixture {
  return {
    id: asString(row.id),
    title: asString(row.title),
    knowledgeType: asKnowledgeType(row.type),
    approvalStatus: asStatus(row.approvalStatus),
    sourceIds: asStringArray(row.sourceIds),
    channels: asChannelArray(row.channels),
    personas: asStringArray(row.personas),
    industries: asStringArray(row.industries),
    competitors: asStringArray(row.competitors),
    lastReviewedDate: asDateString(row.lastReviewedAt),
    summary: asOptionalString(row.summary) ?? "",
    claimId: asOptionalString(row.claimId),
    fixtureLabel: "Database record",
  };
}

function mapClaim(row: Row): ClaimFixture {
  return {
    id: asString(row.id),
    title: asOptionalString(row.title) ?? "Claim",
    exactText: asString(row.exactText),
    approvedWording: asOptionalString(row.approvedWording),
    approvalStatus: asStatus(row.approvalStatus),
    sourceIds: asStringArray(row.sourceIds),
    allowedChannels: asChannelArray(row.allowedChannels),
    personas: asStringArray(row.personas),
    industries: asStringArray(row.industries),
    usageRestrictions: asOptionalString(row.usageRestrictions),
    internalNotes: asOptionalString(row.internalNotes),
    lastReviewedDate: asDateString(row.lastReviewedAt),
    reviewOwner: asOptionalString(row.reviewOwner) ?? "Unassigned",
    reviewHistory: [],
  };
}

function mapSource(row: Row): SourceDocumentFixture {
  return {
    id: asString(row.id),
    title: asString(row.title),
    sourceType: asString(row.sourceType) as SourceType,
    externalUrl: asOptionalString(row.externalUrl),
    fileReference: asOptionalString(row.fileReference),
    sourceDate: asDateString(row.sourceDate),
    description: asOptionalString(row.description),
    internalNotes: asOptionalString(row.internalNotes),
  };
}

function mapSubmission(row: Row): KnowledgeSubmissionFixture {
  return {
    id: asString(row.id),
    title: asString(row.title),
    submitterId: asString(row.authorId),
    submitterRole: asRole(row.submitterRole),
    knowledgeType: asKnowledgeType(row.suggestedType),
    approvalStatus: asStatus(row.approvalStatus),
    sourceIds: asStringArray(row.sourceIds),
    submittedAt: asDateString(row.createdAt) ?? new Date().toISOString(),
    summary: asOptionalString(row.sourceNotes) ?? "",
    content: asString(row.submittedText),
    channels: asChannelArray(row.channels),
    personas: asStringArray(row.personas),
    industries: asStringArray(row.industries),
    competitors: asStringArray(row.competitors),
    internalNotes: asOptionalString(row.internalNotes),
    origin:
      asString(row.originType) === "GENERATED_DRAFT"
        ? {
            type: "GENERATED_DRAFT",
            generatedDraftId: asString(row.originDraftId),
            workflow: asString(row.originWorkflow),
          }
        : { type: "MANUAL" },
    reviewHistory: [],
    isClaim: asString(row.suggestedType) === "CLAIM",
  };
}

export class PrismaPersistenceAdapter implements PersistenceRepositories {
  mode = "prisma" as const;

  knowledge = {
    getApprovedKnowledge: async () => ({
      claims: await this.claims.getApprovedClaims(),
      knowledgeItems: await this.knowledge.getApprovedKnowledgeItems(),
      caseStudies: await this.caseStudies.getApprovedCaseStudies(),
      messageExamples: await this.getApprovedItemsByType("MESSAGE_EXAMPLE"),
      competitorMaterial: [
        ...(await this.getApprovedItemsByType("COMPETITOR")),
        ...(await this.getApprovedItemsByType("COMPETITOR_CLAIM")),
      ],
    }),
    getApprovedKnowledgeItems: async () => this.getApprovedItems(),
    getReviewableKnowledgeItems: async () => {
      const rows = await prisma.$queryRaw<Row[]>`
        SELECT id, title, type, "approvalStatus", summary, channels
        FROM "KnowledgeItem"
        WHERE "approvalStatus" <> 'APPROVED'
        ORDER BY "updatedAt" DESC
      `;
      return rows.map(mapKnowledgeItem);
    },
  };

  claims = {
    getApprovedClaims: async () => {
      const rows = await prisma.$queryRaw<Row[]>`
        SELECT c.*, ARRAY_REMOVE(ARRAY_AGG(s.id), NULL) AS "sourceIds"
        FROM "Claim" c
        LEFT JOIN "_ClaimSources" cs ON cs."A" = c.id
        LEFT JOIN "SourceDocument" s ON s.id = cs."B"
        WHERE c."approvalStatus" = 'APPROVED'
        GROUP BY c.id
      `;
      return rows.map(mapClaim);
    },
    getClaimById: async (claimId: string) => {
      const rows = await prisma.$queryRaw<Row[]>`
        SELECT c.*, ARRAY_REMOVE(ARRAY_AGG(s.id), NULL) AS "sourceIds"
        FROM "Claim" c
        LEFT JOIN "_ClaimSources" cs ON cs."A" = c.id
        LEFT JOIN "SourceDocument" s ON s.id = cs."B"
        WHERE c.id = ${claimId}
        GROUP BY c.id
      `;
      return rows[0] ? mapClaim(rows[0]) : null;
    },
    removeSourceFromApprovedClaim: async () => {
      throw new Error(
        "Removing sources from approved claims must use a dedicated invariant-preserving command.",
      );
    },
  };

  sources = {
    getSourcesByIds: async (sourceIds: string[]) => {
      if (sourceIds.length === 0) {
        return [];
      }
      const rows = await prisma.sourceDocument.findMany({
        where: { id: { in: sourceIds } },
      });
      return rows.map((row: unknown) => mapSource(row as Row));
    },
  };

  reviews = {
    transitionStatus: async (input: TransitionStatusInput) => {
      const rows = await prisma.$queryRaw<Row[]>`
        SELECT ks.*, u.role AS "submitterRole", ARRAY[]::text[] AS "sourceIds"
        FROM "KnowledgeSubmission" ks
        JOIN "User" u ON u.id = ks."authorId"
        WHERE ks.id = ${input.submissionId}
        LIMIT 1
      `;
      const submission = rows[0] ? mapSubmission(rows[0]) : null;
      if (!submission) {
        throw new Error("Submission not found.");
      }

      const result = applyStatusTransition({
        actor: input.actor,
        submission,
        action: input.action,
        reason: input.reason,
        internalNote: input.internalNote,
      });
      if (!result.ok) {
        throw new Error(result.message);
      }

      const decisionId = randomUUID();
      const decisionType = reviewDecisionTypes[input.action];

      await prisma.$transaction(async (tx: MinimalPrismaClient) => {
        await tx.$executeRaw`
          UPDATE "KnowledgeSubmission"
          SET "approvalStatus" = ${result.submission.approvalStatus}::"ApprovalStatus", "updatedAt" = NOW()
          WHERE id = ${submission.id}
        `;
        await tx.$executeRaw`
          INSERT INTO "ReviewDecision" (
            id,
            "actorId",
            "decisionType",
            action,
            "fromStatus",
            "toStatus",
            reason,
            "internalNote",
            notes,
            "knowledgeSubmissionId",
            "createdAt"
          )
          VALUES (
            ${decisionId},
            ${input.actor.id},
            ${decisionType}::"ReviewDecisionType",
            ${input.action},
            ${submission.approvalStatus}::"ApprovalStatus",
            ${result.submission.approvalStatus}::"ApprovalStatus",
            ${input.reason},
            ${input.internalNote},
            ${input.reason},
            ${submission.id},
            NOW()
          )
        `;
      });

      return result.submission;
    },
    createReviewHistory: async (entry: ReviewHistoryEntry) => entry,
  };

  submissions = {
    getReviewableSubmissions: async () => {
      const rows = await prisma.$queryRaw<Row[]>`
        SELECT ks.*, u.role AS "submitterRole", ARRAY[]::text[] AS "sourceIds"
        FROM "KnowledgeSubmission" ks
        JOIN "User" u ON u.id = ks."authorId"
        ORDER BY ks."createdAt" DESC
      `;
      return rows.map(mapSubmission);
    },
    createSubmission: async (input: CreateSubmissionInput): Promise<KnowledgeSubmissionFixture> => {
      const local = createLocalSubmission(input);
      const authorId = input.authorId ?? "seed-sales-user";
      const rows = await prisma.$queryRaw<Row[]>`
        INSERT INTO "KnowledgeSubmission" (
          id,
          title,
          "authorId",
          "submittedText",
          "suggestedType",
          "approvalStatus",
          "sourceNotes",
          "sourceTitle",
          "sourceType",
          "externalUrl",
          "fileReference",
          channels,
          "originType",
          "createdAt",
          "updatedAt"
        )
        VALUES (
          ${local.id},
          ${input.title},
          ${authorId},
          ${input.content},
          ${input.knowledgeType}::"KnowledgeType",
          'NEEDS_REVIEW'::"ApprovalStatus",
          ${input.summary},
          ${input.sourceTitle},
          ${input.sourceType}::"SourceType",
          ${input.externalUrl},
          ${input.fileReference},
          ${input.channels}::"Channel"[],
          'MANUAL',
          NOW(),
          NOW()
        )
        RETURNING id, "createdAt"
      `;
      const created = rows[0];
      return {
        id: asString(created?.id) || local.id,
        title: input.title,
        submitterId: authorId,
        submitterRole: "SALES_USER" as const,
        knowledgeType: input.knowledgeType,
        approvalStatus: "NEEDS_REVIEW",
        sourceIds: [],
        submittedAt: asDateString(created?.createdAt) ?? local.submittedAt,
        summary: input.summary,
        content: input.content,
        channels: input.channels,
        personas: parseTagList(input.personas),
        industries: parseTagList(input.industries),
        competitors: parseTagList(input.competitors),
        internalNotes: input.internalNotes,
        origin: { type: "MANUAL" },
        reviewHistory: [],
        isClaim: input.knowledgeType === "CLAIM",
      };
    },
  };

  caseStudies = {
    getApprovedCaseStudies: async () => {
      const rows = await prisma.caseStudy.findMany({
        where: { approvalStatus: "APPROVED" },
      });
      return rows.map((row: unknown) => {
        const caseStudy = row as Row;

        return {
          id: asString(caseStudy.id),
          title: asString(caseStudy.title),
          companyName: asString(caseStudy.companyName),
          approvalStatus: asStatus(caseStudy.approvalStatus),
          sourceIds: [],
          industries: [],
          personas: [],
          approvedExternalWording: asOptionalString(caseStudy.approvedExternalWording),
          usageRestrictions: asOptionalString(caseStudy.usageRestrictions),
          internalNotes: asOptionalString(caseStudy.internalNotes),
        };
      });
    },
  };

  generatedDrafts = {
    getGeneratedDraftById: async (draftId: string): Promise<GeneratedDraft | null> => {
      const draft = (await prisma.generatedDraft.findUnique({
        where: { id: draftId },
      })) as Row | null;
      return draft
        ? {
            id: asString(draft.id),
            userId: asString(draft.userId),
            workflow: asString(draft.workflow) as GeneratedDraft["workflow"],
            draftContent: asString(draft.draftContent),
            promptSnapshot: asOptionalString(draft.promptSnapshot),
            createdAt: asDateString(draft.createdAt) ?? new Date().toISOString(),
          }
        : null;
    },
    submitGeneratedDraftForReview: async (input: GeneratedDraftSubmissionInput) => {
      const draft = await this.generatedDrafts.getGeneratedDraftById(input.generatedDraftId);
      if (!draft) {
        throw new Error("Generated draft not found.");
      }
      const submission = submitGeneratedDraftForReview({
        draft,
        title: input.title,
        suggestedType: input.suggestedType,
        submitterRole: input.submitterRole,
        sourceIds: input.sourceIds,
      });
      await prisma.$executeRaw`
        INSERT INTO "KnowledgeSubmission" (
          id,
          title,
          "authorId",
          "submittedText",
          "suggestedType",
          "approvalStatus",
          "sourceNotes",
          channels,
          "originType",
          "originDraftId",
          "originWorkflow",
          "createdAt",
          "updatedAt"
        )
        VALUES (
          ${submission.id},
          ${submission.title},
          ${submission.submitterId},
          ${submission.content},
          ${submission.knowledgeType}::"KnowledgeType",
          'NEEDS_REVIEW'::"ApprovalStatus",
          ${submission.summary},
          ${submission.channels}::"Channel"[],
          'GENERATED_DRAFT',
          ${draft.id},
          ${draft.workflow},
          NOW(),
          NOW()
        )
      `;
      return submission;
    },
  };

  private async getApprovedItems() {
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT id, title, type, "approvalStatus", summary, channels
      FROM "KnowledgeItem"
      WHERE "approvalStatus" = 'APPROVED'
      ORDER BY "updatedAt" DESC
    `;
    return rows.map(mapKnowledgeItem);
  }

  private async getApprovedItemsByType(type: KnowledgeType) {
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT id, title, type, "approvalStatus", summary, channels
      FROM "KnowledgeItem"
      WHERE "approvalStatus" = 'APPROVED' AND type = ${type}
      ORDER BY "updatedAt" DESC
    `;
    return rows.map(mapKnowledgeItem);
  }
}
