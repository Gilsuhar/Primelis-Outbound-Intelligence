import { previewApiDenied } from "@/lib/preview-policy.mjs";
import { workforceSameOrigin } from "@/server/agent-workforce/request-origin";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { saveSalesAgentResearch } from "@/server/services/sales-agent-research-service";
const respond = (body: unknown, status: number) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  const denied = previewApiDenied();
  if (denied) return denied;
  try {
    const actor = await getCurrentUser();
    if (!actor) return respond({ ok: false, message: "Sign in to save research" }, 401);
    if (
      process.env.VERCEL_ENV === "production" ||
      actor.id !== process.env.INTEGRATION_OPERATOR_USER_ID
    )
      return respond(
        { ok: false, message: "Research writes require the configured Preview operator" },
        403,
      );
    // Same-origin manual review writes only. Fail closed without Origin.
    if (!workforceSameOrigin(request))
      return respond({ ok: false, message: "Same-origin request required" }, 403);
    const text = await request.text();
    if (text.length > 8000)
      return respond({ ok: false, message: "Research entry is too large" }, 413);
    let input: unknown;
    try {
      input = JSON.parse(text);
    } catch {
      return respond({ ok: false, message: "Invalid research input" }, 400);
    }
    const result = await saveSalesAgentResearch(actor.id, input);
    return respond(
      result,
      result.ok
        ? 200
        : result.code === "NOT_FOUND"
          ? 404
          : result.code === "VALIDATION_ERROR"
            ? 400
            : 503,
    );
  } catch {
    return respond({ ok: false, message: "Research is unavailable" }, 500);
  }
}
