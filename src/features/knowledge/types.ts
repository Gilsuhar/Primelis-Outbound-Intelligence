export const knowledgeTypes = [
  "PRODUCT_TRUTH",
  "ICP",
  "PERSONA",
  "MESSAGE_EXAMPLE",
  "PROSPECT_QUESTION",
  "OBJECTION",
  "COMPETITOR",
  "COMPETITOR_CLAIM",
  "CASE_STUDY",
  "SEQUENCE",
  "SOURCE_DOCUMENT",
  "CLAIM",
  "KNOWLEDGE_SUBMISSION",
  "REVIEW_DECISION",
  "INTERACTION_OUTCOME",
] as const;

export const approvalStatuses = [
  "DRAFT",
  "NEEDS_REVIEW",
  "APPROVED",
  "RESTRICTED",
  "ARCHIVED",
  "REJECTED",
] as const;

export const channelTags = ["EMAIL", "LINKEDIN", "CALL", "INTERNAL"] as const;

export const sourceTypes = [
  "INTERNAL_DOCUMENT",
  "CUSTOMER_CONVERSATION",
  "SALES_CALL",
  "EMAIL_THREAD",
  "WEBSITE",
  "RESEARCH_NOTE",
  "OTHER",
] as const;

export const userRoles = ["SALES_USER", "KNOWLEDGE_ADMIN"] as const;

export type KnowledgeType = (typeof knowledgeTypes)[number];
export type ApprovalStatus = (typeof approvalStatuses)[number];
export type ChannelTag = (typeof channelTags)[number];
export type SourceType = (typeof sourceTypes)[number];
export type UserRole = (typeof userRoles)[number];

export type FixtureUser = {
  id: string;
  name: string;
  role: UserRole;
};

export type SourceDocumentFixture = {
  id: string;
  title: string;
  sourceType: SourceType;
  externalUrl?: string;
  fileReference?: string;
  sourceDate?: string;
  description?: string;
  internalNotes?: string;
};

export type ReviewHistoryEntry = {
  id: string;
  itemId?: string;
  actorId?: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  fromStatus?: ApprovalStatus;
  toStatus?: ApprovalStatus;
  reason?: string;
  notes?: string;
  internalNote?: string;
  createdAt: string;
};

export type ClaimFixture = {
  id: string;
  title: string;
  exactText: string;
  approvedWording?: string;
  approvalStatus: ApprovalStatus;
  sourceIds: string[];
  allowedChannels: ChannelTag[];
  personas: string[];
  industries: string[];
  usageRestrictions?: string;
  internalNotes?: string;
  lastReviewedDate?: string;
  reviewOwner: string;
  reviewHistory: ReviewHistoryEntry[];
};

export type KnowledgeItemFixture = {
  id: string;
  title: string;
  knowledgeType: KnowledgeType;
  approvalStatus: ApprovalStatus;
  sourceIds: string[];
  channels: ChannelTag[];
  personas: string[];
  industries: string[];
  competitors: string[];
  lastReviewedDate?: string;
  summary: string;
  claimId?: string;
  fixtureLabel: string;
};

export type KnowledgeSubmissionFixture = {
  id: string;
  title: string;
  submitterId: string;
  submitterRole: UserRole;
  knowledgeType: KnowledgeType;
  approvalStatus: ApprovalStatus;
  sourceIds: string[];
  submittedAt: string;
  summary: string;
  content: string;
  channels: ChannelTag[];
  personas: string[];
  industries: string[];
  competitors: string[];
  internalNotes?: string;
  origin?: SubmissionOrigin;
  reviewHistory: ReviewHistoryEntry[];
  isClaim: boolean;
};

export type CaseStudyFixture = {
  id: string;
  title: string;
  companyName: string;
  approvalStatus: ApprovalStatus;
  sourceIds: string[];
  industries: string[];
  personas: string[];
  approvedExternalWording?: string;
  usageRestrictions?: string;
  internalNotes?: string;
};

export type SubmissionOrigin =
  | {
      type: "MANUAL";
    }
  | {
      type: "GENERATED_DRAFT";
      generatedDraftId: string;
      workflow: string;
    };

export type GeneratedDraft = {
  id: string;
  userId: string;
  workflow: "CREATE_OUTREACH" | "REPLY_TO_PROSPECT" | "BUILD_SEQUENCE" | "ASK_SIGNAL_BRAIN";
  draftContent: string;
  alternativeContent?: string;
  retrievedKnowledgeIds?: string[];
  sourceIds?: string[];
  providerName?: string;
  modelName?: string;
  draftStatus?: "DRAFT" | "SUBMITTED_FOR_REVIEW" | "ARCHIVED";
  promptSnapshot?: string;
  createdAt: string;
};

export type KnowledgeLibraryFilters = {
  knowledgeType: "ALL" | KnowledgeType;
  approvalStatus: "ALL" | ApprovalStatus;
  channel: "ALL" | ChannelTag;
  persona: "ALL" | string;
  industry: "ALL" | string;
  competitor: "ALL" | string;
  search: string;
};

export type ReviewQueueFilters = {
  approvalStatus: "ALL" | ApprovalStatus;
  knowledgeType: "ALL" | KnowledgeType;
  sourcePresence: "ALL" | "WITH_SOURCE" | "MISSING_SOURCE";
};
