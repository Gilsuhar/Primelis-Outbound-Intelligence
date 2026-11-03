import type { ApprovalStatus, FixtureUser, ReviewHistoryEntry } from "@/features/knowledge/types";
import { formatEnumLabel } from "@/lib/status";

let auditCounter = 0;

export function createAuditHistoryEntry({
  itemId,
  actor,
  action,
  fromStatus,
  toStatus,
  reason,
  internalNote,
}: {
  itemId: string;
  actor: FixtureUser;
  action: string;
  fromStatus?: ApprovalStatus;
  toStatus?: ApprovalStatus;
  reason?: string;
  internalNote?: string;
}): ReviewHistoryEntry {
  auditCounter += 1;

  return {
    id: `audit-${auditCounter}`,
    itemId,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action,
    fromStatus,
    toStatus,
    reason,
    internalNote,
    notes: reason,
    createdAt: new Date().toISOString(),
  };
}

export function orderReviewHistoryChronologically(history: ReviewHistoryEntry[]) {
  return [...history].sort(
    (first, second) => new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime(),
  );
}

export function getReviewHistoryLabel(entry: ReviewHistoryEntry) {
  const transition =
    entry.fromStatus && entry.toStatus
      ? ` from ${formatEnumLabel(entry.fromStatus)} to ${formatEnumLabel(entry.toStatus)}`
      : "";

  return `${entry.action}${transition}`;
}
