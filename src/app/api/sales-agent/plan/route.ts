import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import { createSalesAgentPlan } from "@/server/services/sales-agent-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const respond = (body: unknown, status: number) =>
    NextResponse.json(body, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  try {
    const actor = await getCurrentUser();
    if (!actor)
      return respond(
        { ok: false, code: "UNAUTHENTICATED", message: "Sign in to plan a prospect workflow" },
        401,
      );
    let input: unknown;
    try {
      const body = await request.text();
      if (new TextEncoder().encode(body).length > 32_768)
        return respond({ ok: false, code: "PAYLOAD_TOO_LARGE" }, 413);
      input = JSON.parse(body);
    } catch {
      return respond(
        { ok: false, code: "VALIDATION_ERROR", message: "Expected JSON evidence" },
        400,
      );
    }
    const result = createSalesAgentPlan(input);
    return respond(result, result.ok ? 200 : 400);
  } catch {
    return respond(
      { ok: false, code: "SERVER_ERROR", message: "Unable to plan prospect workflow" },
      500,
    );
  }
}
