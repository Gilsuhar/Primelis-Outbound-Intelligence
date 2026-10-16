import { z } from "zod";
import type { DailyReviewRow } from "@/server/services/sales-agent-collection-service";
import type { WorkforceRun } from "../gate-a-contracts";

/** Persisted inside the existing versioned ProspectSource evidence snapshot. Never an approval. */
export const dashboardReviewSchema = z
  .object({
    reviewedAt: z.string().datetime({ offset: true }),
    decision: z.object({
      status: z.enum(["READY", "HOLD", "REJECTED"]),
      reasons: z.array(z.string()),
      nextActions: z.array(z.string()),
      missingVerificationRequirements: z.array(z.string()),
      hubspotRecordId: z.string().optional(),
    }),
    approved: z.literal(false),
  })
  .strict();
export type DashboardReview = z.infer<typeof dashboardReviewSchema>;
export type StageStatus =
  "WAITING" | "RUNNING" | "COMPLETED" | "FAILED" | "BLOCKED" | "INTERRUPTED";
export type RunSummary = Pick<
  WorkforceRun,
  | "id"
  | "intake"
  | "status"
  | "stage"
  | "createdAt"
  | "updatedAt"
  | "issues"
  | "research"
  | "strategy"
  | "brandSearch"
> & {
  stages: { stage: WorkforceRun["stage"]; status: StageStatus; at: string | null }[];
  qualityVerdict: string | null;
  draftStatus: "PENDING_HUMAN_REVIEW" | "HOLD";
};
/** Health observations persist in evidence providers and run usage/events; configuration is never a successful connection test. */
export type IntegrationHealth = {
  id: "HUBSPOT" | "OUTREACH" | "SIMILARWEB" | "OPENAI" | "EMAIL_VERIFICATION";
  label: string;
  status:
    | "NOT_CONFIGURED"
    | "CONFIGURED_UNTESTED"
    | "LAST_SUCCESS"
    | "ERROR"
    | "NOT_IMPLEMENTED"
    | "CONNECTED"
    | "DISCONNECTED"
    | "PERMISSION_MISSING";
  sync?: import("@/server/integrations/contracts").IntegrationState;
  observedAt: string | null;
  detail: string;
};
export type DashboardProspect = DailyReviewRow & {
  review: DashboardReview | null;
  runIds: string[];
  draftReady: boolean;
  draftRunId: string | null;
};
export type DashboardData = {
  evaluatedAt: string;
  prospects: DashboardProspect[];
  runs: RunSummary[];
  integrations: IntegrationHealth[];
  metrics: {
    reviewedToday: number | null;
    eligible: number | null;
    hold: number | null;
    rejected: number | null;
  };
  warnings: string[];
  evidenceAvailable: boolean;
  runsAvailable: boolean;
};
