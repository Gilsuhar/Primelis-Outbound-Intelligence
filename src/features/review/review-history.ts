import type { ApprovalStatus, FixtureUser, ReviewHistoryEntry } from "@/features/knowledge/types";

let reviewHistoryCounter = 0;

export function createReviewHistoryEntry({
  actor,
  action,
  fromStatus,
  toStatus,
  notes,
}: {
  actor: FixtureUser;
  action: string;
  fromStatus?: ApprovalStatus;
  toStatus?: ApprovalStatus;
  notes?: string;
}): ReviewHistoryEntry {
  reviewHistoryCounter += 1;

  return {
    id: `local-review-${reviewHistoryCounter}`,
    actorName: actor.name,
    actorRole: actor.role,
    action,
    fromStatus,
    toStatus,
    notes,
    createdAt: new Date().toISOString(),
  };
}
