export const accountStatusStates = [
  "EXISTING_CLIENT",
  "ACTIVE_OPPORTUNITY",
  "SUPPRESSED",
  "RECENT_OUTREACH",
  "CLEAR_TO_PROCEED",
  "UNKNOWN",
] as const;

export type AccountStatusState = (typeof accountStatusStates)[number];

export type AccountStatusSeverity = "BLOCKED" | "WARNING" | "CLEAR" | "UNKNOWN" | "ERROR";

export type AccountStatusSource =
  | "SUPPRESSION_RECORD"
  | "GENERATED_DRAFT"
  | "ACCOUNT_ASSESSMENT"
  | "AVAILABLE_DATA";

export type AccountStatusResult = {
  state: AccountStatusState;
  severity: AccountStatusSeverity;
  title: string;
  message: string;
  companyName?: string;
  domain?: string;
  owner?: string;
  reason?: string;
  stage?: string;
  lastActivity?: string;
  matchedRecordId?: string;
  matchedOn?: "DOMAIN" | "NAME" | "ALIAS" | "INTERNAL_ID" | "NONE";
  source: AccountStatusSource;
  canOverride: boolean;
  requiresOverride: boolean;
  verified: boolean;
  nextActions: Array<{
    label: string;
    href?: string;
    action?: "OVERRIDE" | "CHANGE_ACCOUNT";
  }>;
};
