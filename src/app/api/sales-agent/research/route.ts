import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { saveSalesAgentResearch } from "@/server/services/sales-agent-research-service";
const respond = (body: unknown, status: number) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  try {
    const actor = await getCurrentUser();
    if (!actor) return respond({ ok: false, message: "Sign in to save research" }, 401);
    // Same-origin manual review writes only. Fail closed without Origin.
    if (request.headers.get("origin") !== new URL(request.url).origin)
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
