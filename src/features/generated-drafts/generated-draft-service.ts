import type {
  GeneratedDraft,
  KnowledgeSubmissionFixture,
  KnowledgeType,
} from "@/features/knowledge/types";

export type GeneratedDraftSubmissionInput = {
  draft: GeneratedDraft;
  title: string;
  suggestedType: KnowledgeType;
  submitterRole: "SALES_USER" | "KNOWLEDGE_ADMIN";
  sourceIds?: string[];
};

export function assertGeneratedDraftCannotBeApproved(
  draft: GeneratedDraft & { approvalStatus?: string },
) {
  return draft.approvalStatus !== "APPROVED";
}

export function submitGeneratedDraftForReview({
  draft,
  title,
  suggestedType,
  submitterRole,
  sourceIds = [],
}: GeneratedDraftSubmissionInput): KnowledgeSubmissionFixture {
  return {
    id: `submission-from-${draft.id}`,
    title,
    submitterId: draft.userId,
    submitterRole,
    knowledgeType: suggestedType,
    approvalStatus: "NEEDS_REVIEW",
    sourceIds,
    submittedAt: new Date().toISOString(),
    summary: "Submission created from a generated draft.",
    content: draft.draftContent,
    channels: ["INTERNAL"],
    personas: [],
    industries: [],
    competitors: [],
    origin: {
      type: "GENERATED_DRAFT",
      generatedDraftId: draft.id,
      workflow: draft.workflow,
    },
    reviewHistory: [],
    isClaim: suggestedType === "CLAIM",
  };
}
