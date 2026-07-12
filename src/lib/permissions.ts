import type {
  ApprovalStatus,
  FixtureUser,
  KnowledgeSubmissionFixture,
} from "@/features/knowledge/types";

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
  if (!isKnowledgeAdmin(user) && adminOnlyStatuses.includes(toStatus)) {
    return false;
  }

  if (toStatus === "APPROVED" && submission.isClaim && !hasSourceSupport(submission.sourceIds)) {
    return false;
  }

  return true;
}
