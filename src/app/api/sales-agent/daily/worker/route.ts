import { z } from "zod";
import { DailyEngine } from "@/server/agent-workforce/daily/engine";
import { dailyWorkerAuthorized } from "@/server/agent-workforce/daily/auth";
import { workforceBody, workforceResponse } from "@/server/agent-workforce/http";
export const runtime = "nodejs";
export const maxDuration = 120;
/** External authenticated wake-up. No production Cron and no client-visible worker secret. */
export async function POST(request: Request) {
  if (!dailyWorkerAuthorized(request)) return workforceResponse({ ok: false }, 401);
  try {
    z.object({})
      .strict()
      .parse(await workforceBody(request));
    const run = await new DailyEngine().tick(process.env.INTEGRATION_OPERATOR_USER_ID!, true);
    return workforceResponse({ ok: true, runId: run?.id ?? null, status: run?.status ?? "IDLE" });
  } catch {
    return workforceResponse(
      {
        ok: false,
        message:
          "Daily worker unavailable; checkpoint retained. Inspect configuration and persisted diagnostics.",
      },
      503,
    );
  }
}
