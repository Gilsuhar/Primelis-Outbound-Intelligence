import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { workforceBody, workforceResponse } from "@/server/agent-workforce/http";
import { providerSchema } from "@/server/integrations/contracts";
import { drainSync } from "@/server/integrations/worker";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  if (process.env.VERCEL_ENV === "production") return workforceResponse({ ok: false }, 403);
  const secret = process.env.INTEGRATION_WORKER_SECRET;
  const supplied = Buffer.from(request.headers.get("authorization") ?? ""),
    expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (
    !secret ||
    secret.length < 32 ||
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return workforceResponse({ ok: false }, 401);
  try {
    const body = z
      .object({ actorId: z.string().min(1).max(200), provider: providerSchema })
      .strict()
      .parse(await workforceBody(request));
    if (body.actorId !== process.env.INTEGRATION_OPERATOR_USER_ID)
      return workforceResponse({ ok: false }, 403);
    await drainSync(body.actorId, body.provider);
    return workforceResponse({ ok: true });
  } catch {
    return workforceResponse(
      { ok: false, message: "Worker unavailable; checkpoint retained" },
      503,
    );
  }
}
