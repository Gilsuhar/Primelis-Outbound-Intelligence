import type { ChannelTag } from "@/features/knowledge/types";
import type { ReplyProviderMetadata } from "@/features/reply-to-prospect/types";
import type { OutputLanguage } from "@/lib/output-language";

export const sequenceChannels = ["EMAIL", "LINKEDIN", "MIXED"] as const;
export const sequenceStepChannels = ["EMAIL", "LINKEDIN"] as const;
export const sequenceLengths = [3, 4, 5, 6] as const;
export const sequenceTones = ["DIRECT", "CONSULTATIVE", "WARM", "EXECUTIVE"] as const;
export const sequencePurposes = [
  "FIRST_TOUCH_RELEVANCE",
  "PROBLEM_FRAMING",
  "METHODOLOGY_DIFFERENTIATION",
  "ACCOUNT_SPECIFIC_OBSERVATION",
  "SOCIAL_PROOF",
  "TECHNICAL_CLARIFICATION",
  "LOW_PRESSURE_FOLLOW_UP",
  "BREAKUP_CLOSE_LOOP",
] as const;
export const sequenceAngles = [
  "BRANDED_SEARCH_EFFICIENCY",
  "SOLO_COMPETITIVE_GHOST",
  "PAID_ORGANIC_MEASUREMENT",
  "METHODOLOGY_COMPARISON",
  "MARKET_CONTROL_VISIBILITY",
] as const;

export type SequenceChannel = (typeof sequenceChannels)[number];
export type SequenceStepChannel = (typeof sequenceStepChannels)[number];
export type SequenceLength = (typeof sequenceLengths)[number];
export type SequenceTone = (typeof sequenceTones)[number];
export type SequencePurpose = (typeof sequencePurposes)[number];
export type SequenceAngle = (typeof sequenceAngles)[number];

export type BuildSequenceInput = {
  companyName: string;
  companyWebsite?: string;
  contactFirstName?: string;
  contactRole: string;
  industry?: string;
  companyContext?: string;
  geographyOrMarkets?: string;
  paidSearchContext?: string;
  currentVendor?: string;
  observedTrigger: string;
  primaryChannel: SequenceChannel;
  sequenceLength: SequenceLength;
  desiredTone: SequenceTone;
  desiredOverallDuration: string;
  outputLanguage?: OutputLanguage;
  internalNotes?: string;
  creatorId?: string;
};

export type SequenceAccountSignal = {
  label: string;
  detail: string;
  confidence: "VERIFIED" | "USER_PROVIDED" | "INFERRED";
};

export type SequencePersonaGuidance = {
  persona: string;
  emphasis:
    | "operational control"
    | "efficiency"
    | "scale"
    | "measurement"
    | "governance"
    | "business outcomes";
  rationale: string;
};

export type SequenceKnowledgeRecord = {
  id: string;
  title: string;
  type: "PRODUCT_TRUTH" | "MESSAGE_EXAMPLE" | "OBJECTION" | "CASE_STUDY";
  approvedText: string;
  channels: ChannelTag[];
  usageRestrictions?: string;
  usageScope?: string;
  sourceIds: string[];
  sourceTitles: string[];
  sourceDates: string[];
};

export type SequenceSourceReference = {
  id: string;
  title: string;
  sourceDate?: string;
};

export type SequenceStep = {
  stepNumber: number;
  channel: SequenceStepChannel;
  delay: string;
  purpose: SequencePurpose;
  channelRationale: string;
  subjectLine?: string;
  connectionRequest?: string;
  messageBody: string;
  cta: string;
  claimsUsed: string[];
  sourceIds: string[];
};

export type SequenceGeneration = {
  overallStrategy: string;
  selectedAngle: SequenceAngle;
  angleRationale: string;
  personaEmphasis: SequencePersonaGuidance;
  detectedAccountSignals: SequenceAccountSignal[];
  steps: SequenceStep[];
  claimsUsed: string[];
  safetyNotes: string[];
  knowledgeLimitations: string[];
};

export type BuildSequenceResult = SequenceGeneration & {
  draftId: string;
  sequenceLength: SequenceLength;
  overallDuration: string;
  recordsUsed: SequenceKnowledgeRecord[];
  sourceReferences: SequenceSourceReference[];
  provider: ReplyProviderMetadata;
};
