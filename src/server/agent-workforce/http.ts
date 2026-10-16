import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/server";
export const workforceResponse = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function workforceActor(request?: Request) {
  const actor = await getCurrentUser();
  if (!actor)
    return {
      response: workforceResponse({ ok: false, message: "Sign in to use Agent Workforce" }, 401),
    };
  if (request && process.env.VERCEL_ENV === "production")
    return {
      response: workforceResponse(
        { ok: false, message: "Gate A writes are disabled in Production; use the feature Preview" },
        403,
      ),
    };
  if (request && request.headers.get("origin") !== new URL(request.url).origin)
    return {
      response: workforceResponse({ ok: false, message: "Same-origin request required" }, 403),
    };
  return { actor };
}
export async function workforceBody(request: Request) {
  const text = await request.text();
  if (text.length > 20000) throw new Error("PAYLOAD_TOO_LARGE");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("INVALID_JSON");
  }
}
export function workforceFailure(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "DRAFT_ELIGIBILITY_HOLD")
    return workforceResponse(
      {
        ok: false,
        message:
          "Contact eligibility changed. Refresh the workspace and resolve HOLD reasons before editing. The draft remains unapproved. Human content approval cannot override eligibility.",
      },
      409,
    );
  if (
    [
      "DRAFT_ELIGIBILITY_HOLD",
      "RESEARCH_IDENTITY_CHANGED",
      "RESEARCH_REVIEW_REQUIRED",
      "RESEARCH_REQUIRED",
      "APPROVED_KNOWLEDGE_REQUIRED",
      "QUALITY_REVIEW_REQUIRED",
      "VERSION_LIMIT_REACHED",
      "REGENERATION_LIMIT_REACHED",
      "DRAFT_STUDIO_REQUIRED",
    ].includes(code)
  )
    return workforceResponse(
      {
        ok: false,
        message:
          "Draft preparation or review is blocked. Refresh eligibility, verified research and approved product knowledge, and inspect the quality/retry/version limits. Human approval cannot override these gates.",
      },
      409,
    );
  const status =
    error instanceof z.ZodError || ["INVALID_JSON", "NO_SEQUENCE"].includes(code)
      ? 400
      : code === "NOT_FOUND"
        ? 404
        : code === "PAYLOAD_TOO_LARGE"
          ? 413
          : ["VERSION_CONFLICT", "IDEMPOTENCY_CONFLICT"].includes(code)
            ? 409
            : 503;
  return workforceResponse(
    {
      ok: false,
      message:
        status === 409
          ? "The request or draft version changed. Refresh before retrying."
          : status === 400
            ? "Check the supplied account, prospect and draft fields."
            : status === 404
              ? "Run not found in your account."
              : "Agent Workforce is unavailable. Check server-side database/provider configuration; no substitute research was generated.",
    },
    status,
  );
}
