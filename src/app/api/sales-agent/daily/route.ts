import { z } from "zod";
import { after } from "next/server";
import { DailyEngine } from "@/server/agent-workforce/daily/engine";
import {
  workforceActor,
  workforceBody,
  workforceResponse,
  workforceFailure,
} from "@/server/agent-workforce/http";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function GET() {
  const auth = await workforceActor();
  if (auth.response) return auth.response;
  if (auth.actor.id !== process.env.INTEGRATION_OPERATOR_USER_ID)
    return workforceResponse({ ok: false }, 403);
  try {
    return workforceResponse({ ok: true, report: await new DailyEngine().report(auth.actor.id) });
  } catch (error) {
    return workforceFailure(error);
  }
}
const command = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("RUN"), requestKey: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/) })
    .strict(),
  z.object({ action: z.literal("ADVANCE") }).strict(),
  z.object({ action: z.enum(["CANCEL", "RETRY"]), runId: z.string().uuid() }).strict(),
]);
export async function POST(request: Request) {
  const auth = await workforceActor(request);
  if (auth.response) return auth.response;
  if (auth.actor.id !== process.env.INTEGRATION_OPERATOR_USER_ID)
    return workforceResponse({ ok: false }, 403);
  try {
    const body = command.parse(await workforceBody(request)),
      engine = new DailyEngine();
    const run =
      body.action === "RUN"
        ? await engine.start(auth.actor.id, body.requestKey, "MANUAL")
        : body.action === "ADVANCE"
          ? null
          : await engine.control(auth.actor.id, body.runId, body.action);
    if (body.action !== "CANCEL")
      after(async () => {
        try {
          await engine.tick(auth.actor.id);
        } catch {
          /* Durable checkpoint; no raw provider logs. */
        }
      });
    return workforceResponse({ ok: true, run }, 202);
  } catch (error) {
    return workforceFailure(error);
  }
}
