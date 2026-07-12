import type { ApprovalStatus } from "@/features/knowledge/types";

import type {
  CaseStudyUsageScope,
  ImportedSignalFilters,
  ImportedSignalProgress,
  ImportedSignalRecord,
  ReviewActor,
} from "./types";

export type ImportedSignalReviewAction = "APPROVE" | "RESTRICT" | "REJECT" | "RETURN_TO_REVIEW";

export type ImportedSignalBulkAction = "RETURN_TO_REVIEW" | "RESTRICT" | "APPROVE_MESSAGING_RULES";

export const reviewActionTargets: Record<ImportedSignalReviewAction, ApprovalStatus> = {
  APPROVE: "APPROVED",
  RESTRICT: "RESTRICTED",
  REJECT: "REJECTED",
  RETURN_TO_REVIEW: "NEEDS_REVIEW",
};

export function isImportedSignalAdmin(actor: ReviewActor) {
  return actor.role === "KNOWLEDGE_ADMIN";
}

export function isFactualImportedRecord(record: ImportedSignalRecord) {
  return record.category === "PRODUCT_TRUTH" || record.category === "CASE_STUDY";
}

export function isNonFactualMessagingRule(record: ImportedSignalRecord) {
  return record.category === "MESSAGE_RULE";
}

export function isRestrictedUsage(record: ImportedSignalRecord) {
  return (
    (record.category === "CASE_STUDY" && !record.usageScope) ||
    record.status === "RESTRICTED" ||
    Boolean(record.usageRestrictions?.trim()) ||
    record.usageScope === "INTERNAL_ONLY" ||
    record.usageScope === "DECK_ONLY"
  );
}

export function getImportedReviewError({
  actor,
  record,
  action,
  usageScope,
}: {
  actor: ReviewActor;
  record: ImportedSignalRecord;
  action: ImportedSignalReviewAction;
  usageScope?: CaseStudyUsageScope;
}) {
  if (!isImportedSignalAdmin(actor)) {
    return "Only knowledge admins can review imported Signal records.";
  }

  if (action !== "APPROVE") {
    return null;
  }

  if (
    record.sources.length === 0 &&
    (isFactualImportedRecord(record) || isNonFactualMessagingRule(record))
  ) {
    return "Approval requires source-backed imported records.";
  }

  if (record.category === "CASE_STUDY") {
    const selectedScope = usageScope ?? record.usageScope;
    if (!selectedScope) {
      return "Case-study approval requires an explicit usage scope.";
    }
  }

  if (record.isCompetitorRelated) {
    return "Competitor-related records require manual restriction or review before approval.";
  }

  return null;
}

export function canBulkReviewRecord({
  actor,
  record,
  action,
}: {
  actor: ReviewActor;
  record: ImportedSignalRecord;
  action: ImportedSignalBulkAction;
}) {
  if (!isImportedSignalAdmin(actor)) {
    return false;
  }

  if (action === "RETURN_TO_REVIEW" || action === "RESTRICT") {
    return true;
  }

  if (action === "APPROVE_MESSAGING_RULES") {
    return (
      isNonFactualMessagingRule(record) && record.sources.length > 0 && !record.isCompetitorRelated
    );
  }

  return false;
}

export function filterImportedSignalRecords(
  records: ImportedSignalRecord[],
  filters: ImportedSignalFilters,
) {
  return records.filter((record) => {
    if (filters.category !== "ALL" && record.category !== filters.category) {
      return false;
    }
    if (filters.status !== "ALL" && record.status !== filters.status) {
      return false;
    }
    if (
      filters.sourceId !== "ALL" &&
      !record.sources.some((source) => source.id === filters.sourceId)
    ) {
      return false;
    }
    if (filters.industry !== "ALL" && !record.industries.includes(filters.industry)) {
      return false;
    }
    if (filters.missingApprovedWording && record.approvedWording?.trim()) {
      return false;
    }
    if (filters.restrictedUsage && !isRestrictedUsage(record)) {
      return false;
    }
    return true;
  });
}

export function getImportedSignalProgress(records: ImportedSignalRecord[]): ImportedSignalProgress {
  return {
    total: records.length,
    approved: records.filter((record) => record.status === "APPROVED").length,
    restricted: records.filter((record) => record.status === "RESTRICTED").length,
    rejected: records.filter((record) => record.status === "REJECTED").length,
    needsReview: records.filter((record) => record.status === "NEEDS_REVIEW").length,
  };
}
