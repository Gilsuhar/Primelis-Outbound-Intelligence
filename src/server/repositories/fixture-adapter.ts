import { fixtureKnowledgeAdapter } from "@/data/adapters/fixture-knowledge-adapter";
import { fixtureUsers } from "@/data/fixtures/knowledge-fixtures";
import { removeClaimSource } from "@/features/claims/invariants";
import {
  getAdminReviewableKnowledgeItems,
  getAdminReviewableSubmissions,
} from "@/features/knowledge/admin-queries";
import {
  getApprovedCaseStudies,
  getApprovedClaims,
  getApprovedCompetitorMaterial,
  getApprovedKnowledgeItems,
  getApprovedMessageExamples,
} from "@/features/knowledge/approved-queries";
import type { KnowledgeSubmissionFixture, ReviewHistoryEntry } from "@/features/knowledge/types";
import { submitGeneratedDraftForReview } from "@/features/generated-drafts/generated-draft-service";
import { applyStatusTransition } from "@/features/review/status-transition";
import { createLocalSubmission, parseTagList } from "@/lib/validation/add-knowledge";
import type {
  CreateSubmissionInput,
  GeneratedDraftSubmissionInput,
  PersistenceRepositories,
  TransitionStatusInput,
} from "@/server/repositories/types";

export class FixturePersistenceAdapter implements PersistenceRepositories {
  mode = "fixture" as const;

  knowledge = {
    getApprovedKnowledge: async () => ({
      claims: getApprovedClaims(fixtureKnowledgeAdapter),
      knowledgeItems: getApprovedKnowledgeItems(fixtureKnowledgeAdapter),
      caseStudies: getApprovedCaseStudies(fixtureKnowledgeAdapter),
      messageExamples: getApprovedMessageExamples(fixtureKnowledgeAdapter),
      competitorMaterial: getApprovedCompetitorMaterial(fixtureKnowledgeAdapter),
    }),
    getApprovedKnowledgeItems: async () => getApprovedKnowledgeItems(fixtureKnowledgeAdapter),
    getReviewableKnowledgeItems: async () =>
      getAdminReviewableKnowledgeItems(fixtureKnowledgeAdapter),
  };

  claims = {
    getApprovedClaims: async () => getApprovedClaims(fixtureKnowledgeAdapter),
    getClaimById: async (claimId: string) =>
      fixtureKnowledgeAdapter.claims.find((claim) => claim.id === claimId) ?? null,
    removeSourceFromApprovedClaim: async (claimId: string, sourceId: string) => {
      const claim = fixtureKnowledgeAdapter.claims.find((item) => item.id === claimId);
      if (!claim) {
        throw new Error("Claim not found.");
      }
      const result = removeClaimSource(claim, sourceId);
      if (!result.ok) {
        throw new Error(result.message);
      }
      return result.claim;
    },
  };

  sources = {
    getSourcesByIds: async (sourceIds: string[]) =>
      fixtureKnowledgeAdapter.sources.filter((source) => sourceIds.includes(source.id)),
  };

  reviews = {
    transitionStatus: async (input: TransitionStatusInput) => {
      const submission = fixtureKnowledgeAdapter.submissions.find(
        (item) => item.id === input.submissionId,
      );
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
      return result.submission;
    },
    createReviewHistory: async (entry: ReviewHistoryEntry) => entry,
  };

  submissions = {
    getReviewableSubmissions: async () => getAdminReviewableSubmissions(fixtureKnowledgeAdapter),
    createSubmission: async (input: CreateSubmissionInput): Promise<KnowledgeSubmissionFixture> => {
      const local = createLocalSubmission(input);
      const author = fixtureUsers.find((user) => user.id === input.authorId) ?? fixtureUsers[0];
      return {
        id: local.id,
        title: input.title,
        submitterId: author.id,
        submitterRole: author.role,
        knowledgeType: input.knowledgeType,
        approvalStatus: "NEEDS_REVIEW",
        sourceIds: input.sourceTitle ? ["local-fixture-source"] : [],
        submittedAt: local.submittedAt,
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
    getApprovedCaseStudies: async () => getApprovedCaseStudies(fixtureKnowledgeAdapter),
  };

  generatedDrafts = {
    getGeneratedDraftById: async (draftId: string) =>
      fixtureKnowledgeAdapter.generatedDrafts.find((draft) => draft.id === draftId) ?? null,
    submitGeneratedDraftForReview: async (input: GeneratedDraftSubmissionInput) => {
      const draft = fixtureKnowledgeAdapter.generatedDrafts.find(
        (item) => item.id === input.generatedDraftId,
      );
      if (!draft) {
        throw new Error("Generated draft not found.");
      }
      return submitGeneratedDraftForReview({
        draft,
        title: input.title,
        suggestedType: input.suggestedType,
        submitterRole: input.submitterRole,
        sourceIds: input.sourceIds,
      });
    },
  };
}
