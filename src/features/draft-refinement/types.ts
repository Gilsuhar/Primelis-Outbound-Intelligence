export const aiProviderStatuses = [
  "CONFIGURED",
  "NOT_CONFIGURED",
  "TEMPORARILY_UNAVAILABLE",
  "RATE_LIMITED",
  "AUTHENTICATION_FAILED",
  "PROVIDER_ERROR",
] as const;

export const refinementWorkflows = [
  "CREATE_OUTREACH",
  "REPLY_TO_PROSPECT",
  "BUILD_SEQUENCE",
  "ASK_SIGNAL_BRAIN",
] as const;

export const refinementCommands = [
  "REGENERATE",
  "SHORTEN",
  "PERSONALIZE",
  "LESS_SALESY",
  "MORE_DIRECT",
  "WARMER",
  "CHANGE_ANGLE",
  "ADAPT_PERSONA",
  "CHANGE_CTA",
  "REWRITE_SECTION",
  "FIX_SAFETY",
  "CUSTOM",
] as const;

export const safetyStatuses = ["Safe", "Needs revision", "Restricted", "Unsupported"] as const;

export type AiProviderStatus = (typeof aiProviderStatuses)[number];
export type RefinementWorkflow = (typeof refinementWorkflows)[number];
export type RefinementCommand = (typeof refinementCommands)[number];
export type DraftSafetyStatus = (typeof safetyStatuses)[number];

export type AiProviderStatusResult = {
  status: AiProviderStatus;
  providerName: string;
  modelName: string;
  message: string;
  deterministic: boolean;
};

export type DraftSafetyFlag = {
  status: DraftSafetyStatus;
  flaggedWording: string;
  reason: string;
  saferReplacement: string;
};

export type DraftVersionView = {
  id: string;
  generatedDraftId: string;
  draftFamilyId: string;
  parentVersionId?: string;
  versionNumber: number;
  workflow: RefinementWorkflow;
  actionType: string;
  refinementCommand?: RefinementCommand;
  userInstruction?: string;
  generatedContent: string;
  alternativeContent?: string;
  sourceReferences: Array<{ id: string; title?: string; sourceDate?: string }>;
  knowledgeReferences: string[];
  providerName: string;
  modelName: string;
  providerStatus: AiProviderStatus;
  safetyFlags: DraftSafetyFlag[];
  createdBy: string;
  createdAt: string;
  isCurrent: boolean;
  isPreferred: boolean;
  manualEdit: boolean;
};

export type DraftRefinementResult = {
  providerStatus: AiProviderStatusResult;
  currentVersion: DraftVersionView;
  versions: DraftVersionView[];
  safetyStatus: DraftSafetyStatus;
};
