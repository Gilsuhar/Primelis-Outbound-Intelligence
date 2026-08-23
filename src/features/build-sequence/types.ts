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

export type SequenceKeywordEvidence = {
  term: string;
  status: "solo" | "contested";
  competitor?: string;
  note?: string;
};

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
  accountStatusOverride?: boolean;
  prospectContext?: string;
  serpEvidence?: string;
  keywords?: SequenceKeywordEvidence[];
  internalNotes?: string;
  screenshotAvailable?: boolean;
  screenshotContext?: string;
  brandKeyword?: string;
  marketCountry?: string;
  device?: string;
  observationDate?: string;
  screenshotShows?: string;
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
  approvalStatus?: string;
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
  imagePlaceholder?: string;
  imageContextNote?: string;
  claimsUsed: string[];
  sourceIds: string[];
};

export type OutreachOutcome =
  | "SENT"
  | "OPENED"
  | "REPLIED"
  | "POSITIVE_REPLY"
  | "MEETING_BOOKED"
  | "NOT_RELEVANT"
  | "NO_RESPONSE";

export type GoldStandardExample = {
  id: string;
  prospectPersona: ProspectIntelligence["persona"][];
  serpScenario?: ProspectIntelligence["serpScenario"];
  outcome: OutreachOutcome | "STRONG_INTERNAL_EXAMPLE";
  subject?: string;
  body: string;
  reasoningTags: string[];
  whyItWorked: string[];
  approvedForLearning: boolean;
};

export type MessageStrategy = {
  prospectInsight: string;
  businessQuestion: string;
  productGap: string;
  primaryAngle: string;
  secondaryAngle?: string;
  relevantCapability: string;
  proofPoint?: string;
  whyThisShouldResonate: string;
  openingStyle:
    | "PROSPECT_FACT"
    | "ACCOUNT_OBSERVATION"
    | "BUSINESS_QUESTION"
    | "SERP_EVIDENCE"
    | "MARKET_INSIGHT";
  sequenceNarrative: Array<{
    step: 1 | 2 | 3 | 4;
    objective: string;
    newInformation: string;
    ctaIntent: string;
  }>;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  selectedGoldStandardExampleIds: string[];
};

export type SequenceGeneration = {
  overallStrategy: string;
  selectedAngle: SequenceAngle;
  angleRationale: string;
  personaEmphasis: SequencePersonaGuidance;
  prospectIntelligence: ProspectIntelligence;
  messageStrategy: MessageStrategy;
  selectedGoldStandardExamples: GoldStandardExample[];
  detectedAccountSignals: SequenceAccountSignal[];
  steps: SequenceStep[];
  claimsUsed: string[];
  safetyNotes: string[];
  knowledgeLimitations: string[];
};

export type ProspectIntelligence = {
  prospectName?: string;
  companyName?: string;
  jobTitle?: string;
  seniority?: string;
  persona:
    | "PAID_SEARCH"
    | "PERFORMANCE"
    | "GROWTH"
    | "ECOMMERCE"
    | "MARKETING_LEADERSHIP"
    | "OTHER";
  relevantFacts: string[];
  companyContext: string[];
  likelyPriorities: string[];
  serpScenario: "SOLO" | "CONTESTED" | "MIXED" | "UNKNOWN";
  serpEvidence: {
    keywords: string[];
    soloKeywords: string[];
    contestedKeywords: string[];
    competitors: string[];
    observations: string[];
    structuredKeywords: SequenceKeywordEvidence[];
  };
  primaryAngle: string;
  secondaryAngle?: string;
  recommendedProofPoint?: string;
  confidence: {
    prospect: "HIGH" | "MEDIUM" | "LOW";
    serp: "HIGH" | "MEDIUM" | "LOW";
  };
};

export type BuildSequenceResult = SequenceGeneration & {
  draftId: string;
  sequenceLength: SequenceLength;
  overallDuration: string;
  recordsUsed: SequenceKnowledgeRecord[];
  sourceReferences: SequenceSourceReference[];
  provider: ReplyProviderMetadata;
};
