import type { ChannelTag } from "@/features/knowledge/types";
import type { OutputLanguage } from "@/lib/output-language";

export const replyChannels = ["EMAIL", "LINKEDIN"] as const;
export const replyTones = ["DIRECT", "CONSULTATIVE", "WARM", "EXECUTIVE"] as const;
export const replyLengths = ["SHORT", "STANDARD", "DETAILED"] as const;
export const prospectIntents = [
  "INTERESTED",
  "INTERESTED_WITH_QUESTION",
  "REQUESTS_MORE_INFORMATION",
  "REQUESTS_PRICING",
  "REQUESTS_FEE_STRUCTURE",
  "REQUESTS_ROI_OR_VALUE",
  "DATA_SOURCE_QUESTION",
  "MONITORING_VERSUS_ACTION",
  "EXISTING_DASHBOARD",
  "EXISTING_INTERNAL_TOOL",
  "AGENCY_HANDLES_IT",
  "USES_ANOTHER_VENDOR",
  "DOES_NOT_WANT_TO_PAUSE",
  "NOT_A_PRIORITY",
  "VACATION_OR_UNAVAILABLE",
  "REFERRAL",
  "WRONG_CONTACT",
  "POLITE_DECLINE",
  "STRONG_REJECTION",
  "MIXED_INTENT",
  "EXISTING_VENDOR",
  "TECHNICAL_QUESTION",
  "OBJECTION",
  "TIMING",
  "DECK_REQUEST",
  "METHODOLOGY_QUESTION",
  "NOT_INTERESTED",
  "UNCLEAR_REQUEST",
] as const;

export type ReplyChannel = Extract<ChannelTag, "EMAIL" | "LINKEDIN">;
export type ReplyTone = (typeof replyTones)[number];
export type ReplyLength = (typeof replyLengths)[number];
export type ProspectIntent = (typeof prospectIntents)[number];

export type ConversationTurnRole = "PROSPECT" | "SELLER" | "UNKNOWN";

export type NormalizedConversationTurn = {
  role: ConversationTurnRole;
  text: string;
  index: number;
  isLatest: boolean;
};

export type ReplyIntentAnalysis = {
  primaryIntent: ProspectIntent;
  secondaryIntents: ProspectIntent[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
  directQuestion?: string;
  requestedNextStep?: string;
  sensitivePointsToAvoid: string[];
  latestProspectMessage: string;
  priorProspectMessages: string[];
  priorSellerMessages: string[];
};

export type ReplyToProspectInput = {
  prospectMessage: string;
  companyName?: string;
  contactRole?: string;
  channel: ReplyChannel;
  desiredTone: ReplyTone;
  desiredLength: ReplyLength;
  outputLanguage?: OutputLanguage;
  contextNotes?: string;
  creatorId?: string;
};

export type ReplyKnowledgeRecord = {
  id: string;
  title: string;
  type: "PRODUCT_TRUTH" | "MESSAGE_EXAMPLE" | "OBJECTION" | "CASE_STUDY";
  approvalStatus?: string;
  approvedText: string;
  channels: ChannelTag[];
  usageRestrictions?: string;
  sourceIds: string[];
  sourceTitles: string[];
  sourceDates: string[];
};

export type ReplySourceReference = {
  id: string;
  title: string;
  sourceDate?: string;
};

export type ReplyGeneration = {
  recommendedReply: string;
  shorterAlternative: string;
  responseStrategy: string;
  detectedIntent: ProspectIntent[];
  claimsUsed: string[];
  safetyWarnings: string[];
};

export type ReplyProviderMetadata = {
  providerName: string;
  modelName: string;
  deterministic: boolean;
};

export type ReplyToProspectResult = ReplyGeneration & {
  draftId: string;
  recordsUsed: ReplyKnowledgeRecord[];
  sourceReferences: ReplySourceReference[];
  provider: ReplyProviderMetadata;
};
