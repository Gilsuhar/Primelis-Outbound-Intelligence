import type { ApprovalStatus, ChannelTag, SourceType, UserRole } from "@/features/knowledge/types";

export const importedSignalCategories = [
  "PRODUCT_TRUTH",
  "CASE_STUDY",
  "OBJECTION",
  "MESSAGE_RULE",
  "SOURCE",
] as const;

export const caseStudyUsageScopes = [
  "INTERNAL_ONLY",
  "SALES_REPLY_ONLY",
  "EMAIL_AND_LINKEDIN",
  "DECK_ONLY",
  "PUBLIC_MARKETING",
] as const;

export type ImportedSignalCategory = (typeof importedSignalCategories)[number];
export type CaseStudyUsageScope = (typeof caseStudyUsageScopes)[number];

export type ImportedSignalSource = {
  id: string;
  title: string;
  sourceType: SourceType;
  sourceDate?: string;
  externalUrl?: string;
  fileReference?: string;
  description?: string;
};

export type ImportedSignalMetric = {
  id: string;
  metricName: string;
  value: string;
  unit?: string;
  direction: string;
  comparison?: string;
  approvedWording?: string;
};

export type ImportedSignalReviewHistory = {
  id: string;
  actorName: string;
  action?: string;
  fromStatus?: ApprovalStatus;
  toStatus?: ApprovalStatus;
  reason?: string;
  internalNote?: string;
  createdAt: string;
};

export type ImportedSignalRecord = {
  id: string;
  category: ImportedSignalCategory;
  title: string;
  contentType: string;
  status: ApprovalStatus;
  originalText: string;
  approvedWording?: string;
  internalNotes?: string;
  usageRestrictions?: string;
  usageScope?: CaseStudyUsageScope;
  channels: ChannelTag[];
  industries: string[];
  personas: string[];
  sourceDate?: string;
  lastReviewedDate?: string;
  reviewOwner?: string;
  sources: ImportedSignalSource[];
  metrics: ImportedSignalMetric[];
  companyName?: string;
  initialProblem?: string;
  signalApproach?: string;
  activationDuration?: string;
  reviewHistory: ImportedSignalReviewHistory[];
  isNamedCustomerCaseStudy: boolean;
  isCompetitorRelated: boolean;
};

export type ImportedSignalFilters = {
  category: "ALL" | ImportedSignalCategory;
  status: "ALL" | ApprovalStatus;
  sourceId: "ALL" | string;
  industry: "ALL" | string;
  missingApprovedWording: boolean;
  restrictedUsage: boolean;
};

export type ImportedSignalProgress = {
  total: number;
  approved: number;
  restricted: number;
  rejected: number;
  needsReview: number;
};

export type ReviewActor = {
  id: string;
  name: string;
  role: UserRole;
};
