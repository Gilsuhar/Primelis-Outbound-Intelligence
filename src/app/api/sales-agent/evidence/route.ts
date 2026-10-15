import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/server";
import {
  collectSalesAgentEvidence,
  getSalesAgentDailyReview,
} from "@/server/services/sales-agent-collection-service";

export const runtime = "nodejs";
export const maxDuration = 120;
const collectionInput = z
  .object({
    after: z
      .string()
      .regex(/^\d{1,20}$/)
      .optional(),
  })
  .strict();
const respond = (body: unknown, status: number) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET() {
  try {
    const actor = await getCurrentUser();
    if (!actor)
      return respond(
        { ok: false, code: "UNAUTHENTICATED", message: "Sign in to review evidence" },
        401,
      );
    const result = await getSalesAgentDailyReview(actor.id);
    return respond(result, result.ok ? 200 : 503);
  } catch {
    return respond(
      { ok: false, code: "SERVER_ERROR", message: "Evidence review is unavailable" },
      500,
    );
  }
}
export async function POST(request: Request) {
  try {
    const actor = await getCurrentUser();
    if (!actor)
      return respond(
        { ok: false, code: "UNAUTHENTICATED", message: "Sign in to collect evidence" },
        401,
      );
    // CSRF protection for cookie-authenticated collection writes to local evidence storage.
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      return respond({ ok: false, code: "FORBIDDEN" }, 403);
    let input: z.infer<typeof collectionInput>;
    try {
      const text = await request.text();
      if (text.length > 1000) return respond({ ok: false, code: "PAYLOAD_TOO_LARGE" }, 413);
      input = collectionInput.parse(JSON.parse(text));
    } catch {
      return respond(
        {
          ok: false,
          code: "VALIDATION_ERROR",
          message: "Expected an optional HubSpot page cursor only",
        },
        400,
      );
    }
    const result = await collectSalesAgentEvidence(actor.id, input.after);
    return respond(result, result.ok ? 200 : 503);
  } catch {
    return respond(
      { ok: false, code: "SERVER_ERROR", message: "Evidence collection is unavailable" },
      500,
    );
  }
}
