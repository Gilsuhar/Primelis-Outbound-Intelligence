import { assertPreviewOperation } from "@/lib/preview-policy.mjs";
import "server-only";
import { randomUUID, createHash } from "node:crypto";
import {
  companyInputSchema,
  companyRunSchema,
} from "@/features/agent-workforce/company-research/contracts";
import { allowedSourceUrl } from "../public-sources";
import { digest } from "../store";
import { jobSchema, type CompanyJob } from "./contracts";
import type { QueueStore } from "./store";

export const LEASE_MS = 150000;
export interface QueueExecutor {
  readonly mode: CompanyJob["mode"];
  execute(job: CompanyJob, now: Date): Promise<CompanyJob>;
}
/** No provider selection or credentials here. Exactly the same state machine serves future LIVE adapters. */
export class CompanyQueue {
  constructor(
    readonly store: QueueStore,
    readonly executor: QueueExecutor,
    private readonly now: () => Date = () => new Date(),
  ) {}
  async enqueue(
    actor: string,
    raw: unknown,
    key: string,
    fixture?: CompanyJob["fixture"],
    workflow?: CompanyJob["workflow"],
  ) {
    assertPreviewOperation("worker");
    const input = companyInputSchema.parse(raw);
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(key) || !allowedSourceUrl(`https://${input.companyDomain}/`))
      throw new Error("INVALID_QUEUE_INPUT");
    if ((this.executor.mode === "SIMULATED") !== !!fixture) throw new Error("QUEUE_MODE_MISMATCH");
    return this.store.change(actor, (state) => {
      const prior = state.jobs.find((j) => j.key === key);
      if (prior) {
        if (
          digest(prior.run.input) !== digest(input) ||
          prior.mode !== this.executor.mode ||
          prior.fixture !== fixture ||
          prior.workflow !== workflow
        )
          throw new Error("IDEMPOTENCY_CONFLICT");
        return structuredClone(prior);
      }
      const duplicate = state.jobs.find(
        (j) =>
          j.mode === this.executor.mode &&
          j.run.input.companyDomain === input.companyDomain &&
          ["QUEUED", "RUNNING", "HOLD"].includes(j.status),
      );
      if (duplicate) throw new Error("COMPANY_ALREADY_QUEUED");
      if (state.jobs.length >= 30) throw new Error("QUEUE_CAPACITY"); // Never silently evict idempotency history.
      const at = this.now().toISOString(),
        id = "company-job-" + digest({ actor, key });
      const job = jobSchema.parse({
        id,
        key,
        mode: this.executor.mode,
        fixture,
        workflow,
        status: "QUEUED",
        stage: workflow ? "SIGNAL_COLLECT" : "DISCOVER",
        candidates: [],
        cursor: 0,
        lease: null,
        inFlight: null,
        recoveries: 0,
        checkpoints: [],
        diagnostics: [],
        run: companyRunSchema.parse({
          version: 1,
          id,
          input,
          createdAt: at,
          updatedAt: at,
          status: "RUNNING",
          research: {
            accountDomain: input.companyDomain,
            prospectId: id,
            researchedAt: at,
            sources: [],
            facts: [],
            assumptions: [],
            gaps: [],
          },
          issues: [],
          usage: [],
          approved: false,
          canSend: false,
          canEnroll: false,
        }),
      });
      state.jobs.push(job);
      return structuredClone(job);
    });
  }
  async cancel(actor: string, id: string) {
    return this.store.change(actor, (state) => {
      const j = state.jobs.find((job) => job.id === id);
      if (!j) throw new Error("NOT_FOUND");
      // Cancellation cannot declare an in-flight LIVE request finished.
      if (j.mode === "LIVE" && j.inFlight) {
        j.status = "HOLD";
        j.reason = "UNCERTAIN_PROVIDER_OUTCOME";
        return;
      }
      if (["COMPLETE", "FAILED", "CANCELLED"].includes(j.status)) return;
      j.status = "CANCELLED";
      j.reason = "CANCELLED_BY_OPERATOR";
      j.lease = null;
      j.inFlight = null;
      j.run.research.facts = [];
      j.run.status = "FAILED";
      j.run.updatedAt = this.now().toISOString();
    });
  }
  async tick(actor: string) {
    assertPreviewOperation("worker");
    const token = randomUUID();
    const claimed = await this.store.change(actor, (state) => {
      const now = this.now();
      state.lastWorkerAt = now.toISOString();
      if (
        state.jobs.some(
          (j) => j.status === "HOLD" || (j.lease && Date.parse(j.lease.until) > now.getTime()),
        )
      )
        return null;
      const job =
        state.jobs.find((j) => j.status === "RUNNING") ??
        state.jobs.find((j) => j.status === "QUEUED");
      if (!job) return null;
      if (job.mode !== this.executor.mode) throw new Error("QUEUE_MODE_MISMATCH");
      if (job.lease) {
        if (job.inFlight) {
          job.status = "HOLD";
          job.reason = "UNCERTAIN_PROVIDER_OUTCOME";
          return null;
        }
        job.recoveries++;
        if (job.recoveries > 3) {
          job.status = "FAILED";
          job.reason = "RECOVERY_LIMIT";
          job.lease = null;
          job.run.status = "FAILED";
          job.run.research.facts = [];
          return null;
        }
        job.reason = "WORKER_INTERRUPTED";
      }
      job.status = "RUNNING";
      job.lease = { token, until: new Date(now.getTime() + LEASE_MS).toISOString() };
      if (
        job.mode === "LIVE" &&
        (["SIGNAL_COLLECT", "DISCOVER", "EXTRACT", "REVIEW"].includes(job.stage) ||
          (job.workflow === "SIGNAL_OPPORTUNITY_V1" && job.stage === "JUDGE"))
      )
        job.inFlight = { token, stage: job.stage };
      return structuredClone(job);
    });
    if (!claimed) return null;
    let result: CompanyJob;
    try {
      result = jobSchema.parse(await this.executor.execute(structuredClone(claimed), this.now()));
      if (
        result.id !== claimed.id ||
        result.mode !== claimed.mode ||
        result.key !== claimed.key ||
        result.workflow !== claimed.workflow ||
        digest(result.run.input) !== digest(claimed.run.input)
      )
        throw new Error("QUEUE_IDENTITY_CHANGED");
    } catch {
      return this.store.change(actor, (state) => {
        const job = state.jobs.find((j) => j.id === claimed.id);
        if (!job || job.lease?.token !== token || job.status !== "RUNNING") return null;
        job.status = job.inFlight ? "HOLD" : "FAILED";
        job.reason = job.inFlight ? "UNCERTAIN_PROVIDER_OUTCOME" : "STAGE_FAILED";
        if (!job.inFlight) job.lease = null;
        job.run.status = "FAILED";
        job.run.research.facts = [];
        job.run.updatedAt = this.now().toISOString();
        return structuredClone(job);
      });
    }
    return this.store.change(actor, (state) => {
      const index = state.jobs.findIndex((j) => j.id === claimed.id),
        current = state.jobs[index];
      if (
        !current ||
        current.lease?.token !== token ||
        current.status !== "RUNNING" ||
        Date.parse(current.lease.until) <= this.now().getTime()
      )
        return null;
      const at = this.now().toISOString();
      result.checkpoints = [
        ...current.checkpoints,
        {
          stage: claimed.stage,
          cursor: claimed.cursor,
          at,
          hash: createHash("sha256")
            .update(
              JSON.stringify({
                run: result.run,
                signalEvidence: result.signalEvidence,
                signalReport: result.signalReport,
              }),
            )
            .digest("hex"),
        },
      ];
      result.lease = null;
      result.inFlight = null;
      result.run.updatedAt = at;
      result.status = result.stage === "DONE" ? "COMPLETE" : "RUNNING";
      state.jobs[index] = jobSchema.parse(result);
      return structuredClone(result);
    });
  }
}
