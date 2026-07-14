import type { ChannelTag } from "@/features/knowledge/types";
import type { ReplyProviderMetadata } from "@/features/reply-to-prospect/types";

export const outreachChannels = ["EMAIL", "LINKEDIN"] as const;
export const outreachMessageTypes = ["FIRST_TOUCH", "FOLLOW_UP", "RE_ENGAGEMENT"] as const;
export const outreachTones = ["DIRECT", "CONSULTATIVE", "WARM", "EXECUTIVE"] as const;
export const outreachLengths = ["SHORT", "STANDARD", "DETAILED"] as const;
export const outreachAngles = [
  "BRANDED_SEARCH_EFFICIENCY",
  "SOLO_COMPETITIVE_GHOST",
  "PAID_ORGANIC_MEASUREMENT",
  "METHODOLOGY_COMPARISON",
  "MARKET_CONTROL_VISIBILITY",
] as const;

export type OutreachChannel = Extract<ChannelTag, "EMAIL" | "LINKEDIN">;
export type OutreachMessageType = (typeof outreachMessageTypes)[number];
export type OutreachTone = (typeof outreachTones)[number];
export type OutreachLength = (typeof outreachLengths)[number];
export type OutreachAngle = (typeof outreachAngles)[number];

export type CreateOutreachInput = {
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
  channel: OutreachChannel;
  messageType: OutreachMessageType;
  desiredTone: OutreachTone;
  desiredLength: OutreachLength;
  useCaseStudy?: boolean;
  internalNotes?: string;
  creatorId?: string;
};

export type AccountSignal = {
  label: string;
  detail: string;
  confidence: "VERIFIED" | "USER_PROVIDED" | "INFERRED";
};

export type PersonaGuidance = {
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

export type OutreachKnowledgeRecord = {
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

export type OutreachSourceReference = {
  id: string;
  title: string;
  sourceDate?: string;
};

export type OutreachEmailSection = {
  label: "INTRO" | "PAIN POINT" | "SOLUTION" | "SOFT CTA";
  text: string;
};

export type OutreachGeneration = {
  subjectLines: string[];
  connectionRequest?: string;
  recommendedMessage: string;
  emailSections: OutreachEmailSection[];
  shorterVersion: string;
  cta: string;
  selectedAngle: OutreachAngle;
  angleRationale: string;
  detectedSignals: AccountSignal[];
  personaGuidance: PersonaGuidance;
  knowledgeLimitations: string[];
  claimsUsed: string[];
  safetyNotes: string[];
};

export type CreateOutreachResult = OutreachGeneration & {
  draftId: string;
  recordsUsed: OutreachKnowledgeRecord[];
  sourceReferences: OutreachSourceReference[];
  provider: ReplyProviderMetadata;
};
