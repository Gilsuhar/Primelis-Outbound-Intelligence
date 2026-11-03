import type {
  ApprovalStatus,
  FixtureUser,
  KnowledgeSubmissionFixture,
} from "@/features/knowledge/types";

import { createAuditHistoryEntry } from "./audit";

export type ReviewAction = "APPROVE" | "RESTRICT" | "ARCHIVE" | "REJECT" | "RETURN_TO_REVIEW";

export type TransitionErrorCode =
  "FORBIDDEN" | "INVALID_TRANSITION" | "SOURCE_REQUIRED" | "UNKNOWN_ACTION";

export type TransitionResult =
  | {
      ok: true;
      submission: KnowledgeSubmissionFixture;
    }
  | {
      ok: false;
      code: TransitionErrorCode;
      message: string;
      submission: KnowledgeSubmissionFixture;
    };

export const reviewActionTargets: Record<ReviewAction, ApprovalStatus> = {
  APPROVE: "APPROVED",
  RESTRICT: "RESTRICTED",
  ARCHIVE: "ARCHIVED",
  REJECT: "REJECTED",
  RETURN_TO_REVIEW: "NEEDS_REVIEW",
};

export const allowedTransitionMatrix: Record<ApprovalStatus, ApprovalStatus[]> = {
  DRAFT: ["NEEDS_REVIEW", "ARCHIVED"],
  NEEDS_REVIEW: ["APPROVED", "RESTRICTED", "REJECTED", "ARCHIVED"],
  APPROVED: ["RESTRICTED", "ARCHIVED", "NEEDS_REVIEW"],
  RESTRICTED: ["NEEDS_REVIEW", "ARCHIVED", "REJECTED"],
  ARCHIVED: ["NEEDS_REVIEW"],
  REJECTED: ["NEEDS_REVIEW"],
};

const actionLabels: Record<ReviewAction, string> = {
  APPROVE: "Approved",
  RESTRICT: "Restricted",
  ARCHIVE: "Archived",
  REJECT: "Rejected",
  RETURN_TO_REVIEW: "Returned to review",
};

export function getTransitionError(
  actor: FixtureUser,
  submission: KnowledgeSubmissionFixture,
  action: ReviewAction,
) {
  const toStatus = reviewActionTargets[action];

  if (!toStatus) {
    return {
      code: "UNKNOWN_ACTION" as const,
      message: "Unknown review action.",
    };
  }

  if (actor.role !== "KNOWLEDGE_ADMIN") {
    return {
      code: "FORBIDDEN" as const,
      message: "Only knowledge admins can perform review status transitions.",
    };
  }

  if (!allowedTransitionMatrix[submission.approvalStatus].includes(toStatus)) {
    return {
      code: "INVALID_TRANSITION" as const,
      message:
        "This status transition is not allowed. Archived and rejected items must return to Needs Review before approval.",
    };
  }

  if (toStatus === "APPROVED" && submission.isClaim && submission.sourceIds.length === 0) {
    return {
      code: "SOURCE_REQUIRED" as const,
      message: "Factual claims require at least one source before approval.",
    };
  }

  return null;
}

export function canApplyReviewAction(
  actor: FixtureUser,
  submission: KnowledgeSubmissionFixture,
  action: ReviewAction,
) {
  return getTransitionError(actor, submission, action) === null;
}

export function applyStatusTransition({
  actor,
  submission,
  action,
  reason,
  internalNote,
}: {
  actor: FixtureUser;
  submission: KnowledgeSubmissionFixture;
  action: ReviewAction;
  reason?: string;
  internalNote?: string;
}): TransitionResult {
  const error = getTransitionError(actor, submission, action);

  if (error) {
    return {
      ok: false,
      ...error,
      submission,
    };
  }

  const toStatus = reviewActionTargets[action];
  const historyEntry = createAuditHistoryEntry({
    itemId: submission.id,
    actor,
    action: actionLabels[action],
    fromStatus: submission.approvalStatus,
    toStatus,
    reason,
    internalNote,
  });

  return {
    ok: true,
    submission: {
      ...submission,
      approvalStatus: toStatus,
      reviewHistory: [historyEntry, ...submission.reviewHistory],
    },
  };
}
