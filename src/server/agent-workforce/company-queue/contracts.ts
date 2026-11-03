import { z } from "zod";
import { companyRunSchema } from "@/features/agent-workforce/company-research/contracts";
import {
  signalEvidenceSchema,
  signalReportSchema,
} from "@/features/agent-workforce/signal-opportunity";

export const stages = [
  "SIGNAL_COLLECT",
  "DISCOVER",
  "RETRIEVE",
  "EXTRACT",
  "VALIDATE",
  "REVIEW",
  "JUDGE",
  "DONE",
] as const;
export const jobSchema = z
  .object({
    id: z.string().max(100),
    key: z.string().min(8).max(100),
    mode: z.enum(["SIMULATED", "LIVE"]),
    workflow: z.literal("SIGNAL_OPPORTUNITY_V1").optional(),
    signalEvidence: signalEvidenceSchema.optional(),
    signalReport: signalReportSchema.optional(),
    fixture: z.enum(["SUPPORTED", "UNSUPPORTED", "RECOVERY"]).optional(),
    status: z.enum(["QUEUED", "RUNNING", "COMPLETE", "FAILED", "HOLD", "CANCELLED"]),
    stage: z.enum(stages),
    run: companyRunSchema,
    candidates: z.array(z.string().url().max(2000)).max(7),
    cursor: z.number().int().min(0).max(7),
    lease: z.object({ token: z.string().uuid(), until: z.string().datetime() }).strict().nullable(),
    // A durable request-start marker: uncertain LIVE work blocks the entire queue.
    inFlight: z
      .object({ token: z.string().uuid(), stage: z.enum(stages) })
      .strict()
      .nullable(),
    recoveries: z.number().int().min(0).max(4),
    checkpoints: z
      .array(
        z
          .object({
            stage: z.enum(stages),
            cursor: z.number().int(),
            at: z.string().datetime(),
            hash: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
      )
      .max(16),
    diagnostics: z
      .array(
        z
          .object({
            stage: z.enum(stages),
            code: z
              .string()
              .regex(/^[A-Z_0-9]+$/)
              .max(80),
            sourceUrl: z.string().max(2000).optional(),
          })
          .strict(),
      )
      .max(30),
    judgement: z.string().max(150000).optional(),
    reason: z
      .enum([
        "WORKER_INTERRUPTED",
        "RECOVERY_LIMIT",
        "UNCERTAIN_PROVIDER_OUTCOME",
        "STAGE_FAILED",
        "CANCELLED_BY_OPERATOR",
      ])
      .optional(),
  })
  .strict();
export const queueSchema = z
  .object({
    version: z.literal(1),
    jobs: z.array(jobSchema).max(30),
    lastWorkerAt: z.string().datetime().nullable(),
  })
  .strict();
export type CompanyJob = z.infer<typeof jobSchema>;
export type QueueState = z.infer<typeof queueSchema>;
export type Stage = CompanyJob["stage"];
export const initialQueue = (): QueueState => ({ version: 1, jobs: [], lastWorkerAt: null });
export function parseQueue(value: unknown): QueueState {
  const state = queueSchema.parse(value);
  if (Buffer.byteLength(JSON.stringify(state)) > 3000000) throw new Error("QUEUE_CAPACITY");
  if (
    new Set(state.jobs.map((j) => j.id)).size !== state.jobs.length ||
    new Set(state.jobs.map((j) => j.key)).size !== state.jobs.length
  )
    throw new Error("QUEUE_CORRUPT");
  for (const j of state.jobs) {
    if (
      j.run.id !== j.id ||
      (j.mode === "SIMULATED") !== !!j.fixture ||
      j.run.research.accountDomain !== j.run.input.companyDomain ||
      j.run.research.prospectId !== j.id ||
      (!j.workflow && (!!j.signalEvidence || !!j.signalReport || j.stage === "SIGNAL_COLLECT")) ||
      (j.signalReport && j.signalReport.mode !== j.mode) ||
      (j.signalEvidence?.cachedSearch && j.signalEvidence.cachedSearch.mode !== j.mode) ||
      (j.workflow && j.status === "COMPLETE" && (!j.signalEvidence || !j.signalReport)) ||
      (j.status === "COMPLETE" &&
        (j.stage !== "DONE" || !j.judgement || j.run.status === "RUNNING"))
    )
      throw new Error("QUEUE_CORRUPT");
  }
  return state;
}
