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

export type ProspectStatus =
  | "NEW"
  | "CONTEXT_READY"
  | "INTELLIGENCE_READY"
  | "SEQUENCE_DRAFT"
  | "SEQUENCE_APPROVED";

export type ProspectSourceType =
  | "MANUAL_PASTE"
  | "LINKEDIN_PROFILE"
  | "LINKEDIN_POST"
  | "SERP_EVIDENCE"
  | "MANUAL_NOTE"
  | "FILE_IMPORT"
  | "ACCOUNT_RESEARCH";

export type ExtractedFactCategory = "PROSPECT" | "COMPANY" | "LINKEDIN" | "SERP" | "NOTE";

export type ProspectRecord = {
  id: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  jobTitle?: string;
  companyName?: string;
  companyDomain?: string;
  linkedinUrl?: string;
  status: ProspectStatus;
  createdAt: string;
  updatedAt: string;
};

export type ProspectSource = {
  id: string;
  prospectId: string;
  type: ProspectSourceType;
  rawContent: string;
  sourceLabel?: string;
  sourceUrl?: string;
  createdAt: string;
};

export type ExtractedFact = {
  value: string;
  sourceId: string;
  category: ExtractedFactCategory;
};

export type ProspectExtraction = {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  jobTitle?: string;
  companyName?: string;
  companyDomain?: string;
  linkedinUrl?: string;
  prospectFacts: string[];
  companyFacts: string[];
  linkedinInsights: string[];
  notes: string[];
  serpEvidence: Array<{
    keyword: string;
    status?: "SOLO" | "CONTESTED" | "UNKNOWN";
    competitors?: string[];
    observation?: string;
  }>;
  confidence: {
    identity: number;
    company: number;
    extraction: number;
  };
};

export type IdentityResolution = {
  status: "EXACT_MATCH" | "HIGH_CONFIDENCE_MATCH" | "NEW_PROSPECT" | "AMBIGUOUS";
  prospectId?: string;
  matchedBy?: string[];
  confidence: number;
};

export type ProspectConflict = {
  field: keyof Pick<
    ProspectRecord,
    "firstName" | "lastName" | "fullName" | "email" | "jobTitle" | "companyName" | "companyDomain" | "linkedinUrl"
  >;
  existingValue?: string;
  incomingValue?: string;
};

export type ProspectMemory = {
  prospect: ProspectRecord;
  source: ProspectSource;
  sourceCount: number;
  extraction: ProspectExtraction;
  facts: ExtractedFact[];
  identityResolution: IdentityResolution;
  conflicts: ProspectConflict[];
};

export type BuildSequenceInput = {
  rawProspectContext?: string;
  prospectId?: string;
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
  whyNow?: string;
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
    angle?: string;
    evidenceToUse?: string;
    proofToUse?: string;
    ctaIntent: string;
    avoidRepeating?: string;
  }>;
  emailStepPlans?: Array<{
    stepNumber: 1 | 2 | 3 | 4;
    objective: string;
    newInformation: string;
    angle: string;
    evidenceToUse: string;
    proofToUse?: string;
    CTAIntent: string;
    avoidRepeating: string;
  }>;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  selectedGoldStandardExampleIds: string[];
  groundingReferences?: string[];
  plannerMode?: "AI_STRATEGY" | "DETERMINISTIC_FALLBACK";
  diagnostics?: {
    firstCallDurationMs?: number;
    retryDurationMs?: number;
    retryUsed: boolean;
    fallbackUsed: boolean;
    firstIssues: string[];
    retryIssues: string[];
  };
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
  diagnostics?: BuildSequenceDiagnostics;
};

export type BuildSequenceDiagnostics = {
  totalDurationMs?: number;
  semanticIntakeDurationMs?: number;
  strategyDurationMs?: number;
  strategyFirstCallDurationMs?: number;
  strategyRetryDurationMs?: number;
  strategyRetryUsed?: boolean;
  strategyFallbackUsed?: boolean;
  strategyFirstIssues?: string[];
  strategyRetryIssues?: string[];
  sequenceGenerationDurationMs?: number;
  finalValidationDurationMs?: number;
  totalAiCalls?: number;
  totalRetries?: number;
  stepRewriteDiagnostics?: Array<{
    stepNumber: number;
    firstCallDurationMs?: number;
    retryDurationMs?: number;
    retryUsed: boolean;
    fallbackUsed: boolean;
    firstFailures: string[];
    retryFailures: string[];
  }>;
  validationIssues?: string[];
  finalRecoveryReason?: string;
  finalFullSequenceFallbackUsed?: boolean;
  finalRecoveredStepNumbers?: number[];
  aiStepsPreserved?: number;
};

export type SelectedProspectInsight = {
  factId: string;
  groundingReference: string;
  text: string;
  relevanceToSignal: number;
  specificity: number;
  commercialUsefulness: number;
  conversationalUsefulness: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  reasonSelected: string;
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
  selectedInsights: SelectedProspectInsight[];
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
  prospectId?: string;
  prospectMemory?: ProspectMemory;
  semanticIntakeMode?: "AI_SEMANTIC" | "DETERMINISTIC_FALLBACK";
  sequenceLength: SequenceLength;
  overallDuration: string;
  recordsUsed: SequenceKnowledgeRecord[];
  sourceReferences: SequenceSourceReference[];
  provider: ReplyProviderMetadata;
  diagnostics?: BuildSequenceDiagnostics;
};
