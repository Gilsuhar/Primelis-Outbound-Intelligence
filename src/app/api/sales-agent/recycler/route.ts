import { previewApiDenied } from "@/lib/preview-policy.mjs";
import { z } from "zod";
import { workforceActor, workforceBody, workforceResponse } from "@/server/agent-workforce/http";
import { localDevelopmentConfig } from "@/lib/auth/local-development";
import { liveRecyclerReview } from "@/server/prospect-recycler/review-live";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const input = z
  .object({
    action: z.literal("READ_FIVE"),
    source: z.enum(["BOTH", "HUBSPOT", "OUTREACH"]),
  })
  .strict();
// Explicit user action only. GET/page rendering never starts CRM collection.
export async function POST(request: Request) {
  const denied = previewApiDenied();
  if (denied) return denied;
  try {
    const auth = await workforceActor(request, true);
    if (auth.response) return auth.response;
    if (!localDevelopmentConfig())
      return workforceResponse(
        {
          ok: false,
          message: "Live Recycler review is available only in the existing local operator session.",
        },
        403,
      );
    const body = input.parse(await workforceBody(request));
    return workforceResponse({
      ok: true,
      data: await liveRecyclerReview(auth.actor.id, body.source),
    });
  } catch (error) {
    const invalid =
      error instanceof z.ZodError ||
      (error instanceof Error && ["INVALID_JSON", "PAYLOAD_TOO_LARGE"].includes(error.message));
    const busy = error instanceof Error && error.message === "RECYCLER_BUSY";
    return workforceResponse(
      {
        ok: false,
        message: invalid
          ? "Choose a valid read-only source."
          : busy
            ? "A Recycler read is already running. Wait for it to finish."
            : "Recycler read could not start. Check the existing local connection; no automatic credential refresh or retry was attempted.",
      },
      invalid ? 400 : busy ? 409 : 503,
    );
  }
}
