import { z } from "zod";
import { workforceActor, workforceBody, workforceResponse } from "@/server/agent-workforce/http";
import { verificationKindSchema } from "@/features/sales-agent/verification/contracts";
import { retryVerification } from "@/server/verification/service";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const auth = await workforceActor(request);
  if (auth.response) return auth.response;
  if (auth.actor.id !== process.env.INTEGRATION_OPERATOR_USER_ID)
    return workforceResponse(
      { ok: false, message: "Verification is restricted to the configured integration operator" },
      403,
    );
  try {
    const body = z
      .object({
        contactId: z.string().min(1).max(200),
        kind: verificationKindSchema,
        requestKey: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/),
      })
      .strict()
      .parse(await workforceBody(request));
    return workforceResponse({
      ok: true,
      data: await retryVerification(auth.actor.id, body.contactId, body.kind, body.requestKey),
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    return workforceResponse(
      {
        ok: false,
        message: ["EMAIL_HISTORY_REQUIRED", "INTAKE_REFRESH_REQUIRED"].includes(code)
          ? "Refresh owner-scoped HubSpot intake and email edit history before verification"
          : code === "IDEMPOTENCY_CONFLICT"
            ? "Contact identity or request changed. Refresh the workspace before retrying."
            : "Verification unavailable; no result was assumed and no CRM fields were modified",
      },
      error instanceof z.ZodError
        ? 400
        : code === "NOT_FOUND"
          ? 404
          : code === "IDEMPOTENCY_CONFLICT"
            ? 409
            : 503,
    );
  }
}
