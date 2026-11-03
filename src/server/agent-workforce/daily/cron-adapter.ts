import "server-only";
import { timingSafeEqual } from "node:crypto";
import { isPreviewRestricted } from "@/lib/preview-policy.mjs";

type Tick = (actor: string, scheduled: boolean) => Promise<{ status: string } | null>;
/** Prepared adapter only: no route registration or live schedule. Rehearsal requires injected engine.
 * All hosted execution stays denied until a separately reviewed cloud-worker implementation exists. */
export function dailyCronRehearsal(tick: Tick, env: NodeJS.ProcessEnv = process.env) {
  return async (request: Request): Promise<Response> => {
    const reply = (status: number, code: string) => Response.json({ code }, { status, headers: { "Cache-Control": "no-store" } });
    // Check both injected and real runtime: a test fixture cannot authorize a hosted worker.
    for (const config of [process.env, env]) {
      if (isPreviewRestricted(config) || config.VERCEL_ENV || config.VERCEL || config.VERCEL_URL || config.VERCEL_PROJECT_ID)
        return reply(403, "CLOUD_SCHEDULING_NOT_APPROVED");
    }
    if (env.NODE_ENV !== "test" || env.WORKFORCE_CRON_REHEARSAL_ENABLED !== "true" || env.WORKFORCE_DAILY_ENABLED !== "true")
      return reply(403, "SCHEDULER_DISABLED");
    const secret = env.CRON_SECRET, actor = env.INTEGRATION_OPERATOR_USER_ID;
    if (!secret || secret.length < 32 || !actor) return reply(403, "SCHEDULER_CONFIGURATION_REQUIRED");
    const expected = Buffer.from(`Bearer ${secret}`), supplied = Buffer.from(request.headers.get("authorization") ?? "");
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return reply(401, "UNAUTHORIZED");
    const url = new URL(request.url);
    if (request.method !== "GET" || url.pathname !== "/api/sales-agent/daily/worker" || url.search)
      return reply(400, "INVALID_SCHEDULER_REQUEST");
    try {
      // One tick, no automatic retries/loops. DailyEngine owns atomic scheduling, leases and budgets.
      const run = await tick(actor, true);
      const status = run?.status ?? "IDLE";
      return reply(200, ["RUNNING", "PAUSED", "COMPLETED", "PARTIAL", "FAILED", "CANCELLED", "IDLE"].includes(status) ? status : "CHECKPOINT_RETAINED");
    } catch {
      return reply(503, "SCHEDULER_UNAVAILABLE_CHECKPOINT_RETAINED");
    }
  };
}
