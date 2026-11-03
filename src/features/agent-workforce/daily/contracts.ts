import { z } from "zod";
export const dailyConfigSchema = z
  .object({
    enabled: z.boolean(),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    timezone: z.literal("Asia/Jerusalem"),
    dailyBudgetUsd: z.number().positive().max(1000),
    monthlyBudgetUsd: z.number().positive().max(10000),
    maxContacts: z.number().int().min(1).max(500),
    maxConcurrentCalls: z.number().int().min(1).max(5),
    maxRetries: z.number().int().min(0).max(3),
  })
  .strict();
export type DailyConfig = z.infer<typeof dailyConfigSchema>;
export type DailyContact = {
  id: string;
  status: "WAITING" | "RUNNING" | "COMPLETED" | "BLOCKED" | "FAILED";
  stage: "VERIFY_EMAIL" | "VERIFY_EMPLOYMENT" | "RESEARCH" | "DRAFT" | "REVIEW";
  attempts: number;
  nextAttemptAt: string | null;
  retryRequested?: boolean;
  researchId?: string;
  draftId?: string;
  decision: "ELIGIBLE" | "HOLD" | "REJECTED";
  reasons: string[];
  missingEvidence?: string[];
  researchCompleted: boolean;
  draftPrepared: boolean;
};
export type DailyRun = {
  id: string;
  key: string;
  localDate: string;
  trigger: "MANUAL" | "SCHEDULED";
  status: "RUNNING" | "COMPLETED" | "PARTIAL" | "FAILED" | "PAUSED" | "CANCELLED";
  stage: "HUBSPOT" | "OUTREACH" | "CONTACTS" | "REPORT";
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
  lease: { token: string; until: string } | null;
  attempts: number;
  nextAttemptAt: string | null;
  reason: string | null;
  estimatedUsd: number;
  syncJobId?: string;
  discovered: number;
  deferred: number;
  contacts: DailyContact[];
  errors: { at: string; stage: string; code: string }[];
};
export type UsageDay = {
  estimatedUsd: number;
  requests: { OPENAI: number; VERIFICATION: number; SERP: number; RESEARCH?: number };
  uncertainRequests: number;
  models: Record<string, { requests: number; inputTokens: number; outputTokens: number }>;
  researchAttempts: Record<string, number>;
};
export type DailyState = {
  version: 1;
  runs: DailyRun[];
  lastWorkerAt: string | null;
  days: Record<string, UsageDay>;
  months: Record<string, number>;
  pending: Record<
    string,
    {
      day: string;
      month: string;
      reservedUsd: number;
      runId?: string;
      until: string;
      provider: "OPENAI" | "VERIFICATION" | "SERP" | "RESEARCH";
      model?: string;
    }
  >;
};
export const initialDailyState = (): DailyState => ({
  version: 1,
  runs: [],
  lastWorkerAt: null,
  days: {},
  months: {},
  pending: {},
});
export type DailyReport = {
  config: DailyConfig;
  scheduler: {
    state: "DISABLED" | "AWAITING_WORKER" | "WORKER_OBSERVED";
    lastWorkerAt: string | null;
    nextRunAt: string | null;
  };
  runs: DailyRun[];
  lastSuccessfulRunAt: string | null;
  budget: {
    day: string;
    month: string;
    dailyEstimatedUsd: number;
    monthlyEstimatedUsd: number;
    usage: UsageDay | null;
    activeCalls: number;
  };
};
