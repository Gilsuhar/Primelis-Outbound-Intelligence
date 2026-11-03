import { previewApiDenied } from "@/lib/preview-policy.mjs";
import { z } from "zod";
import { workforceActor, workforceBody, workforceResponse } from "@/server/agent-workforce/http";
import {
  requireLocalCompanyAccess,
  localCompanyAiConfig,
} from "@/server/agent-workforce/company-research/config";
import { PrismaCompanyStore } from "@/server/agent-workforce/company-research/store";
import { runCompanyResearch } from "@/server/agent-workforce/company-research/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function failure(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "LOCAL_COMPANY_ONLY")
    return workforceResponse(
      { ok: false, message: "Company Research V1 requires the local workspace" },
      403,
    );
  if (code.startsWith("COMPANY_AI_") || code === "PRICING_REQUIRED")
    return workforceResponse(
      {
        ok: false,
        message:
          "Company AI is disabled or its explicit local budget/model/pricing configuration is incomplete",
      },
      503,
    );
  if (
    error instanceof z.ZodError ||
    ["INVALID_JSON", "INVALID_REQUEST_KEY", "INVALID_COMPANY_DOMAIN"].includes(code)
  )
    return workforceResponse(
      { ok: false, message: "Enter company name and domain only; a valid request key is required" },
      400,
    );
  if (code === "PAYLOAD_TOO_LARGE")
    return workforceResponse({ ok: false, message: "Request too large" }, 413);
  if (code === "IDEMPOTENCY_CONFLICT")
    return workforceResponse(
      { ok: false, message: "Request key already used for different company input" },
      409,
    );
  return workforceResponse(
    { ok: false, message: "Company research unavailable; no substitute findings were generated" },
    503,
  );
}
export async function GET(request: Request) {
  const denied = previewApiDenied();
  if (denied) return denied;
  try {
    // Browsers omit Origin on same-origin GET. Supply the exact Host only for
    // this read; the existing origin guard still validates both loopback hosts,
    // URL/protocol and forwarded headers. An explicitly foreign Origin is retained.
    const headers = new Headers(request.headers);
    if (!headers.has("origin")) headers.set("origin", `http://${headers.get("host")}`);
    const access = await workforceActor(new Request(request.url, { headers }), true);
    if (access.response) return access.response;
    requireLocalCompanyAccess(access.actor.id);
    let aiReady = false;
    try {
      localCompanyAiConfig(access.actor.id);
      aiReady = true;
    } catch {
      /* Read history without enabling AI. */
    }
    return workforceResponse({
      ok: true,
      runs: await new PrismaCompanyStore().list(access.actor.id),
      aiReady,
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  const denied = previewApiDenied();
  if (denied) return denied;
  try {
    const access = await workforceActor(request, true);
    if (access.response) return access.response;
    requireLocalCompanyAccess(access.actor.id);
    const run = await runCompanyResearch(
      access.actor.id,
      await workforceBody(request),
      request.headers.get("idempotency-key") ?? "",
    );
    return workforceResponse({ ok: true, run });
  } catch (error) {
    return failure(error);
  }
}
