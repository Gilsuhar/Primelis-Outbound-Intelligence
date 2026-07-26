export const yesNoUnknownOptions = ["YES", "NO", "UNKNOWN"] as const;
export const factStatuses = ["VERIFIED", "USER_PROVIDED", "ASSUMPTION", "UNKNOWN"] as const;
export const researchTrustLevels = [
  "VERIFIED_APPROVED_INTERNAL",
  "USER_PROVIDED",
  "IMPORTED_UNVERIFIED",
  "MODEL_INFERENCE",
  "UNKNOWN",
] as const;
export const companyTypes = [
  "B2B",
  "B2C",
  "E_COMMERCE",
  "MARKETPLACE",
  "SUBSCRIPTION",
  "MULTI_BRAND",
  "OTHER",
] as const;
export const qualificationResults = [
  "Strong fit",
  "Possible fit",
  "Do not target",
  "Insufficient information",
] as const;
export const confidenceLevels = ["High", "Medium", "Low"] as const;

export type YesNoUnknown = (typeof yesNoUnknownOptions)[number];
export type FactStatus = (typeof factStatuses)[number];
export type ResearchTrustLevel = (typeof researchTrustLevels)[number];
export type CompanyType = (typeof companyTypes)[number];
export type QualificationResult = (typeof qualificationResults)[number];
export type ConfidenceLevel = (typeof confidenceLevels)[number];

export type AccountResearchInput = {
  companyName: string;
  companyDomain?: string;
  industry?: string;
  headquartersOrMainMarket?: string;
  marketsOrCountries?: string;
  revenueContext?: string;
  employeeContext?: string;
  companyType: CompanyType;
  brandedSearchAdsActive: YesNoUnknown;
  strongOrganicBrandVisibility: YesNoUnknown;
  meaningfulBrandedSearchDemand: YesNoUnknown;
  multiMarketOrBrandComplexity: YesNoUnknown;
  dedicatedPaidSearchOrPerformanceTeam: YesNoUnknown;
  knownPaidSearchOwner?: string;
  knownCurrentToolOrVendor?: string;
  meaningfulPaidSearchInvestment: YesNoUnknown;
  observedTrigger?: string;
  knownPain?: string;
  accountOwner?: string;
  lastContactDate?: string;
  existingCustomer: YesNoUnknown;
  activeOpportunity: YesNoUnknown;
  ownedByAnotherRep: YesNoUnknown;
  doNotContactStatus: YesNoUnknown;
  internalNotes?: string;
  factStatuses: Record<string, FactStatus>;
  adminEvidenceRequested?: boolean;
  creatorId?: string;
};

export type FactClassification = {
  field: string;
  label: string;
  value: string;
  status: FactStatus;
  source: string;
  trustLevel: ResearchTrustLevel;
  required: boolean;
  passedToAi: boolean;
  stored: boolean;
  allowedAsFactualOutreachPersonalization: boolean;
  allowedOnlyAsQuestionOrHypothesis: boolean;
};

export type IndustryEvidence = {
  industry: string;
  level: "PROVEN" | "STRONG_HYPOTHESIS" | "EXPLORATORY" | "UNKNOWN";
  note: string;
};

export type SuppressionResult = {
  status: "BLOCKED" | "ALLOWED_WITH_REVIEW" | "NO_MATCH";
  label: string;
  reasons: string[];
  matches: Array<{
    companyName: string;
    domain?: string;
    status: string;
    owner?: string;
    reason?: string;
  }>;
  outreachBlocked: boolean;
  verificationWarning: string;
};

export type PersonaRecommendation = {
  primaryPersona: string;
  secondaryPersona: string;
  reason: string;
  bestAngle: string;
  suitableCta: string;
  likelyObjection: string;
  seniorityGuidance: string;
};

export type StakeholderRecommendation = {
  role: string;
  priority:
    | "Primary stakeholder"
    | "Secondary stakeholder"
    | "Possible influencer"
    | "Likely wrong contact";
  reason: string;
};

export type AngleRecommendation = {
  primaryAngle: string;
  secondaryAngle?: string;
  whyItFits: string;
  supportingSignal: string;
  mustNotClaim: string;
  safeOpeningQuestion: string;
  bestProofCategory?: string;
  claimsToAvoid: string[];
  recommendedWorkflow:
    "Create Outreach" | "Build Sequence" | "Reply to Prospect" | "Ask Signal Brain";
};

export type ResearchResultStructure = {
  accountSummary: string[];
  signalRelevance: {
    result: QualificationResult;
    confidence: ConfidenceLevel;
    reasons: string[];
  };
  verifiedFacts: string[];
  userProvidedContext: string[];
  inferredContext: string[];
  likelyOpportunities: string[];
  openQuestions: string[];
  suggestedStakeholders: StakeholderRecommendation[];
  recommendedOutreachAngle: AngleRecommendation;
  claimsToAvoid: string[];
  evidenceContext: string[];
};

export type FilteredResearchHandoff = {
  companyName: string;
  companyDomain?: string;
  contactRole?: string;
  industry?: string;
  companyContext?: string;
  geographyOrMarkets?: string;
  paidSearchContext?: string;
  observedTrigger?: string;
  internalNotes?: string;
};

export type AccountAssessmentResult = {
  assessmentId: string;
  qualificationResult: QualificationResult;
  confidence: ConfidenceLevel;
  industryEvidence: IndustryEvidence;
  factClassifications: FactClassification[];
  verifiedSignals: string[];
  assumptions: string[];
  unknowns: string[];
  missingInformation: string[];
  disqualificationRisks: string[];
  suppression: SuppressionResult;
  personaRecommendation: PersonaRecommendation;
  stakeholderRecommendations: StakeholderRecommendation[];
  angleRecommendation: AngleRecommendation;
  openQuestions: string[];
  likelyOpportunities: string[];
  claimsToAvoid: string[];
  structuredResearch: ResearchResultStructure;
  downstreamHandoff: FilteredResearchHandoff;
  recommendedNextAction: string;
  researchChecklist: string[];
  workflowLinks: Array<{ label: string; href: string; disabled?: boolean; reason?: string }>;
  internalNotes?: string;
};
