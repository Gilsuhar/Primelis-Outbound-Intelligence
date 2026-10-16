import { z } from "zod";
export const providerSchema = z.enum(["HUBSPOT", "OUTREACH"]);
export type IntegrationProvider = z.infer<typeof providerSchema>;
export type ConnectionStatus = "DISCONNECTED" | "CONNECTED" | "PERMISSION_MISSING" | "ERROR";
export type SyncJob = {
  id: string;
  requestKey: string;
  mode: "INITIAL" | "INCREMENTAL";
  status: "QUEUED" | "RUNNING" | "FAILED" | "COMPLETED";
  since: string;
  until: string;
  cursor?: string;
  pending: string[];
  phase: "DISCOVER" | "REFRESH";
  refreshed: string[];
  imported: number;
  updated: number;
  unchanged: number;
  attempts: number;
  startedAt: string;
  completedAt?: string;
  nextAttemptAt?: string;
  error?: string;
};
export type IntegrationState = {
  provider: IntegrationProvider;
  status: ConnectionStatus;
  checkedAt: string | null;
  lastSuccessfulSync: string | null;
  watermark?: string;
  requestKeys?: string[];
  missingScopes: string[];
  detail: string;
  coverage: "UNKNOWN" | "PARTIAL" | "VISIBLE_RECORDS_ONLY";
  job: SyncJob | null;
};
export const initialState = (provider: IntegrationProvider): IntegrationState => ({
  provider,
  status: "DISCONNECTED",
  checkedAt: null,
  lastSuccessfulSync: null,
  missingScopes: [],
  detail: "No successful authenticated check recorded",
  coverage: "UNKNOWN",
  job: null,
});
export const REQUIRED_SCOPES = {
  HUBSPOT: [
    "crm.objects.contacts.read",
    "crm.objects.companies.read",
    "crm.objects.deals.read",
    "crm.objects.emails.read",
  ],
  OUTREACH: ["prospects.read", "accounts.read", "mailings.read", "sequenceStates.read"],
} as const;
