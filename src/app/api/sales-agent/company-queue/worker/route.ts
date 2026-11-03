import { previewApiDenied } from "@/lib/preview-policy.mjs";
import { companyQueueRequest } from "@/server/agent-workforce/company-queue/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const POST = (request: Request) => { const denied = previewApiDenied();
  if (denied) return denied; return companyQueueRequest(request, true); };
