import type {
  ApprovalStatus,
  FixtureUser,
  KnowledgeSubmissionFixture,
} from "@/features/knowledge/types";

import { applyStatusTransition, type ReviewAction } from "./status-transition";

const statusActions: Partial<Record<ApprovalStatus, ReviewAction>> = {
  NEEDS_REVIEW: "RETURN_TO_REVIEW",
  APPROVED: "APPROVE",
  RESTRICTED: "RESTRICT",
  ARCHIVED: "ARCHIVE",
  REJECTED: "REJECT",
};

export function applyReviewAction(
  submission: KnowledgeSubmissionFixture,
  actor: FixtureUser,
  toStatus: ApprovalStatus,
) {
  const action = statusActions[toStatus];

  if (!action) {
    return {
      ok: false as const,
      reason: "This status is not available as a review action.",
      submission,
    };
  }

  const result = applyStatusTransition({
    actor,
    submission,
    action,
    reason: `Development fixture action: ${action}.`,
  });

  return result.ok
    ? result
    : {
        ok: false as const,
        reason: result.message,
        submission,
      };
}
