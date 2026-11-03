import { previewApiDenied } from "@/lib/preview-policy.mjs";
import { companyQueueRequest } from "@/server/agent-workforce/company-queue/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => { const denied = previewApiDenied();
  if (denied) return denied; return companyQueueRequest(request); };
export const POST = GET;
export const DELETE = GET;
