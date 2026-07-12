import type {
  ApprovalStatus,
  FixtureUser,
  KnowledgeSubmissionFixture,
} from "@/features/knowledge/types";
import { canTransitionSubmission } from "@/lib/permissions";

import { createReviewHistoryEntry } from "./review-history";

const actionLabels: Record<ApprovalStatus, string> = {
  DRAFT: "Sent back for review",
  NEEDS_REVIEW: "Sent back for review",
  APPROVED: "Approved",
  RESTRICTED: "Restricted",
  ARCHIVED: "Archived",
  REJECTED: "Rejected",
};

export function applyReviewAction(
  submission: KnowledgeSubmissionFixture,
  actor: FixtureUser,
  toStatus: ApprovalStatus,
) {
  if (!canTransitionSubmission(actor, submission, toStatus)) {
    return {
      ok: false as const,
      reason:
        toStatus === "APPROVED" && submission.isClaim && submission.sourceIds.length === 0
          ? "Claims without a source cannot be approved."
          : "This user does not have permission to perform this review action.",
      submission,
    };
  }

  const historyEntry = createReviewHistoryEntry({
    actor,
    action: actionLabels[toStatus],
    fromStatus: submission.approvalStatus,
    toStatus,
    notes: `Development fixture action: ${actionLabels[toStatus]}.`,
  });

  return {
    ok: true as const,
    submission: {
      ...submission,
      approvalStatus: toStatus,
      reviewHistory: [historyEntry, ...submission.reviewHistory],
    },
  };
}
