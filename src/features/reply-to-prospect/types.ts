import type { ChannelTag } from "@/features/knowledge/types";
import type { OutputLanguage } from "@/lib/output-language";

export const replyChannels = ["EMAIL", "LINKEDIN"] as const;
export const replyTones = ["DIRECT", "CONSULTATIVE", "WARM", "EXECUTIVE"] as const;
export const replyLengths = ["SHORT", "STANDARD", "DETAILED"] as const;
export const prospectIntents = [
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
