import { previewApiDenied } from "@/lib/preview-policy.mjs";
import { z } from "zod";
import { workforceActor, workforceResponse } from "@/server/agent-workforce/http";
import {
  createInternalReview,
  listInternalReviews,
} from "@/server/agent-workforce/company-research/internal-review-store";
import {
  companyRequestSchema,
  importedEvidenceGroundingRequestSchema,
} from "@/features/agent-workforce/company-research/internal-review";
import { resolveChoiceContinuationContact } from "@/server/agent-workforce/dashboard/preparation";
import { automaticCompanyConfig } from "@/server/agent-workforce/company-research/automatic-execution";
import { groundImportedEvidenceOnce } from "@/server/agent-workforce/company-research/imported-evidence-grounding";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function boundedBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("INVALID_JSON");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > 2_900_000) {
      await reader.cancel();
      throw new Error("PAYLOAD_TOO_LARGE");
    }
    chunks.push(part.value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new Error("INVALID_JSON");
  }
}
function failure(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  const status =
    code === "LOCAL_COMPANY_ONLY"
      ? 403
      : code === "PAID_AUTHORIZATION_REQUIRED"
        ? 403
        : code === "PAYLOAD_TOO_LARGE"
          ? 413
          : error instanceof z.ZodError || ["INVALID_JSON", "INVALID_IMAGE"].includes(code)
            ? 400
            : [
                  "REVIEW_LIMIT",
                  "RESEARCH_BUSY",
                  "CONTINUATION_CONTACT_REQUIRES_SAVED_RESEARCH",
                  "CONTINUATION_CONTACT_NOT_AVAILABLE",
                  "CONTINUATION_CONTACT_COMPANY_MISMATCH",
                  "CONTINUATION_CONTACT_IDENTITY_UNVERIFIED",
                  "PROFILE_CONTINUATION_NOT_SUPPORTED",
                  "PROFILE_CRM_CONTACT_CONFLICT",
                ].includes(code)
              ? 409
              : 503;
  return workforceResponse(
    {
      ok: false,
      message:
        status === 400
          ? "Enter a company name or domain and, optionally, a PNG/JPEG under 2 MB."
          : code === "PAID_AUTHORIZATION_REQUIRED"
            ? "Explicit paid-AI authorization is required; no grounding request started."
            : status === 409
              ? code === "RESEARCH_BUSY"
                ? "A local retrieval is already running. No second execution started."
                : "Local review document limit reached (25)."
              : "Research could not finish. Check saved history before submitting again; no automatic retry occurs.",
    },
    status,
  );
}
export async function GET(request: Request) {
  const denied = previewApiDenied();
  if (denied) return denied;
  try {
    const headers = new Headers(request.headers);
    if (!headers.has("origin"))
      headers.set("origin", `${new URL(request.url).protocol}//${headers.get("host")}`);
    const access = await workforceActor(new Request(request.url, { headers }), true);
    if (access.response) return access.response;
    let aiReady = false;
    try {
      automaticCompanyConfig(access.actor.id);
      aiReady = true;
    } catch {
      /* no activation */
    }
    return workforceResponse({
      ok: true,
      aiReady,
      documents: await listInternalReviews(access.actor.id, headers.get("host")),
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
    const body = await boundedBody(request);
    if (
      body &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      (body as Record<string, unknown>).action === "GROUND_IMPORTED_EVIDENCE"
    ) {
      const groundingRequest = importedEvidenceGroundingRequestSchema.parse(body);
      const result = await groundImportedEvidenceOnce(
        access.actor.id,
        request.headers.get("host"),
        groundingRequest,
      );
      return workforceResponse({ ok: true, grounding: result });
    }
    const input = companyRequestSchema.parse(body);
    if (input.continueContactId && !input.continueResearchId)
      throw new Error("CONTINUATION_CONTACT_REQUIRES_SAVED_RESEARCH");
    const contactDraft = input.continueContactId
      ? await resolveChoiceContinuationContact(
          access.actor.id,
          request.headers.get("host"),
          input.continueContactId,
        )
      : undefined;
    const document = contactDraft
      ? await createInternalReview(access.actor.id, request.headers.get("host"), input, true, {
          contactDraft,
        })
      : await createInternalReview(access.actor.id, request.headers.get("host"), input, true);
    return workforceResponse({ ok: true, document });
  } catch (error) {
    return failure(error);
  }
}
