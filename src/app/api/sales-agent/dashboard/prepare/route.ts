import { previewApiDenied } from "@/lib/preview-policy.mjs";
import { z } from "zod";
import { workforceActor, workforceBody, workforceResponse } from "@/server/agent-workforce/http";
import {
  getPreparationPlan,
  prepareProspects,
} from "@/server/agent-workforce/dashboard/preparation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
function failed(error: unknown, paidAuthorized?: boolean) {
  const code =
    error instanceof Error && /^PREPARATION_[A-Z_]+$/.test(error.message)
      ? error.message
      : "PREPARATION_UNAVAILABLE";
  const knownNoCallPreflight = code === "PREPARATION_AI_NOT_READY";
  return workforceResponse(
    {
      ok: false,
      code,
      message: `${code}: preparation stopped. Inspect saved results before taking another action; no automatic retry.`,
      ...(paidAuthorized === undefined
        ? {}
        : {
            action: {
              paidAuthorized,
              outcome: "BLOCKED" as const,
              actualCalls: knownNoCallPreflight ? 0 : null,
              actualEstimatedUsd: knownNoCallPreflight ? 0 : null,
            },
          }),
    },
    error instanceof z.ZodError ? 400 : 409,
  );
}
export async function GET(request: Request) {
  const denied = previewApiDenied();
  if (denied) return denied;
  try {
    const headers = new Headers(request.headers);
    if (!headers.has("origin"))
      headers.set("origin", `${new URL(request.url).protocol}//${headers.get("host")}`);
    const auth = await workforceActor(new Request(request.url, { headers }), true);
    if (auth.response) return auth.response;
    return workforceResponse({
      ok: true,
      data: await getPreparationPlan(auth.actor.id, headers.get("host")),
    });
  } catch (error) {
    return failed(error);
  }
}
export async function POST(request: Request) {
  const denied = previewApiDenied();
  if (denied) return denied;
  let paidAuthorized: boolean | undefined;
  try {
    const auth = await workforceActor(request, true);
    if (auth.response) return auth.response;
    const input = z
      .object({ allowPaid: z.boolean(), contactId: z.string().min(1).max(200) })
      .strict()
      .parse(await workforceBody(request));
    paidAuthorized = input.allowPaid;
    return workforceResponse({
      ok: true,
      data: await prepareProspects(
        auth.actor.id,
        request.headers.get("host"),
        input.allowPaid,
        input.contactId,
      ),
    });
  } catch (error) {
    return failed(error, paidAuthorized);
  }
}
