import type { ChannelTag } from "@/features/knowledge/types";
import type { ReplyProviderMetadata } from "@/features/reply-to-prospect/types";

export const signalBrainModes = [
  "QUICK_ANSWER",
  "DETAILED_GUIDANCE",
  "ACCOUNT_QUALIFICATION",
  "PERSONA_RECOMMENDATION",
  "OBJECTION_GUIDANCE",
  "CASE_STUDY_SELECTION",
  "CLAIM_SAFETY_CHECK",
] as const;

export const signalBrainIntents = [
  "PRODUCT_FUNDAMENTALS",
  "ICP_OR_FIT",
  "PERSONA_TARGETING",
  "ACCOUNT_QUALIFICATION",
  "OUTREACH_ANGLE",
  "OBJECTION_HANDLING",
  "COMPETITOR_CONTEXT",
  "CASE_STUDY_SELECTION",
  "MESSAGING_GUIDANCE",
  "US_MARKET_GUIDANCE",
  "CLAIM_SAFETY",
  "WORKFLOW_GUIDANCE",
  "UNCLEAR_QUESTION",
] as const;

export type SignalBrainMode = (typeof signalBrainModes)[number];
export type SignalBrainIntent = (typeof signalBrainIntents)[number];

export type SignalBrainInput = {
  question: string;
  companyName?: string;
  companyWebsite?: string;
  contactRole?: string;
  industry?: string;
  companySizeOrRevenue?: string;
  geographyOrMarkets?: string;
  paidSearchContext?: string;
  currentVendor?: string;
  observedTrigger?: string;
  internalNotes?: string;
  mode: SignalBrainMode;
  creatorId?: string;
};

export type SignalBrainKnowledgeRecord = {
  id: string;
  title: string;
  type: "PRODUCT_TRUTH" | "MESSAGE_EXAMPLE" | "OBJECTION" | "CASE_STUDY" | "PLAYBOOK_GUIDANCE";
  approvedText: string;
  channels: ChannelTag[];
  usageRestrictions?: string;
  usageScope?: string;
  metrics?: string[];
  sourceIds: string[];
  sourceTitles: string[];
  sourceDates: string[];
};

export type SignalBrainSourceReference = {
  id: string;
  title: string;
  sourceDate?: string;
};

export type FitResult =
  "Strong fit" | "Possible fit" | "Do not target" | "Insufficient information";

export type AccountFitAssessment = {
  result: FitResult;
  verifiedSignals: string[];
  assumptions: string[];
  missingInformation: string[];
  recommendedNextResearchStep: string;
};

export type PersonaRecommendation = {
  primaryPersona: string;
  secondaryPersona: string;
  reason: string;
  bestAngle: string;
  suitableCta: string;
  likelyObjection: string;
  whenNotToPrioritize: string;
};

export type ClaimSafetyStatus = "Safe" | "Needs revision" | "Restricted" | "Unsupported";

export type ClaimSafetyResult = {
  status: ClaimSafetyStatus;
  problematicWording: string[];
  reason: string;
  saferAlternative: string;
};

export type CaseStudyRecommendation = {
  recommendedCaseStudy: string;
  whyItFits: string;
  bestFitIndustry: string;
  bestFitPersona: string;
  bestFitObjection: string;
  eligibleUsageScope: string;
  approvedMetrics: string[];
  externalUseWarning: string;
};

export type SignalBrainGeneration = {
  directAnswer: string;
  conciseRecommendation: string;
  detectedIntent: SignalBrainIntent[];
  reasoningSummary: string;
  recommendedNextAction: string;
  workflowLinks: Array<{ label: string; href: string }>;
  safetyWarnings: string[];
  accountFit?: AccountFitAssessment;
  personaRecommendation?: PersonaRecommendation;
  claimSafety?: ClaimSafetyResult;
  caseStudyRecommendation?: CaseStudyRecommendation;
};

export type SignalBrainResult = SignalBrainGeneration & {
  draftId: string;
  recordsUsed: SignalBrainKnowledgeRecord[];
  sourceReferences: SignalBrainSourceReference[];
  provider: ReplyProviderMetadata;
};
