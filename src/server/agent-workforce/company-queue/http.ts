import { previewApiDenied } from "@/lib/preview-policy.mjs";
import "server-only";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/server";
import { workforceBody, workforceResponse } from "../http";
import { requirePilotConfig, requirePilotRequest } from "./auth";
import { PrismaQueueStore } from "./store";
import { CompanyQueue } from "./engine";
import { signalFixtureExecutor } from "../signal-opportunity/fixtures";
import { scheduleSignalFixtureCohort } from "./schedule";
import type { QueueState } from "./contracts";

/** Do not expose checkpoint candidates as verified facts while work is incomplete. */
export function publicQueue(state: QueueState) {
  return {
    version: state.version,
    lastWorkerAt: state.lastWorkerAt,
    jobs: state.jobs.map((job) => ({
      id: job.id,
      mode: job.mode,
      status: job.status,
      stage: job.stage,
      company: job.run.input,
      reason: job.reason,
      checkpointCount: job.checkpoints.length,
      diagnostics: job.diagnostics,
      approved: false,
      canSend: false,
      canEnroll: false,
      ...(job.status === "COMPLETE"
        ? {
            result: job.run,
            signalOpportunity: job.signalReport ?? null,
            judgement: job.judgement ? (JSON.parse(job.judgement) as unknown) : null,
          }
        : {}),
    })),
  };
}
export async function companyQueueRequest(request: Request, worker = false) {
  const denied = previewApiDenied();
  if (denied) return denied;
  try {
    const config = requirePilotConfig(); // Before session lookup/database import.
    const actor = worker ? undefined : await getCurrentUser();
    requirePilotRequest(request, actor?.id, worker);
    const store = new PrismaQueueStore(),
      queue = new CompanyQueue(store, signalFixtureExecutor());
    if (worker) {
      z.object({})
        .strict()
        .parse(await workforceBody(request));
      if (config.schedule) await scheduleSignalFixtureCohort(queue, config.actor, new Date());
      await queue.tick(config.actor);
      return workforceResponse({ ok: true, mode: "SIMULATED", providerRequests: 0 });
    }
    if (request.method === "DELETE") {
      const { id } = z
        .object({ id: z.string().max(100) })
        .strict()
        .parse(await workforceBody(request));
      await queue.cancel(config.actor, id);
    } else if (request.method === "POST") {
      // No user-selectable company, provider, mode, knowledge approval or outbound action.
      z.object({ action: z.literal("ENQUEUE_FIXTURE_COHORT") })
        .strict()
        .parse(await workforceBody(request));
      await scheduleSignalFixtureCohort(queue, config.actor, new Date());
    } else if (request.method !== "GET") return workforceResponse({ ok: false }, 405);
    return workforceResponse(
      { ok: true, ...publicQueue(await store.read(config.actor)) },
      request.method === "POST" ? 202 : 200,
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const status =
      error instanceof z.ZodError || code === "INVALID_JSON"
        ? 400
        : code === "PILOT_FORBIDDEN"
          ? 403
          : ["COMPANY_ALREADY_QUEUED", "QUEUE_CAPACITY", "IDEMPOTENCY_CONFLICT"].includes(code)
            ? 409
            : 503;
    return workforceResponse(
      {
        ok: false,
        message:
          "Company fixture queue unavailable or request denied; inspect sanitized configuration and queue status.",
      },
      status,
    );
  }
}
