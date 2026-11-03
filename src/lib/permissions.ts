import type {
  ApprovalStatus,
  FixtureUser,
  KnowledgeSubmissionFixture,
} from "@/features/knowledge/types";
import { canApplyReviewAction, type ReviewAction } from "@/features/review/status-transition";

export const adminOnlyStatuses: ApprovalStatus[] = [
  "APPROVED",
  "RESTRICTED",
  "ARCHIVED",
  "REJECTED",
];

export function isKnowledgeAdmin(user: FixtureUser) {
  return user.role === "KNOWLEDGE_ADMIN";
}

export function canSeeReviewActions(user: FixtureUser) {
  return isKnowledgeAdmin(user);
}

export function hasSourceSupport(sourceIds: string[]) {
  return sourceIds.length > 0;
}

export function canTransitionSubmission(
  user: FixtureUser,
  submission: KnowledgeSubmissionFixture,
  toStatus: ApprovalStatus,
) {
  const statusActions: Partial<Record<ApprovalStatus, ReviewAction>> = {
    NEEDS_REVIEW: "RETURN_TO_REVIEW",
    APPROVED: "APPROVE",
    RESTRICTED: "RESTRICT",
    ARCHIVED: "ARCHIVE",
    REJECTED: "REJECT",
  };
  const action = statusActions[toStatus];

  return action ? canApplyReviewAction(user, submission, action) : false;
}
