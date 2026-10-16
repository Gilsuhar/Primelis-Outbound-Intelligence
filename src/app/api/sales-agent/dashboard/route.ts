import { z } from "zod";
import {
  workforceActor,
  workforceBody,
  workforceFailure,
  workforceResponse,
} from "@/server/agent-workforce/http";
import {
  getWorkforceDashboard,
  markProspectReviewed,
} from "@/server/agent-workforce/dashboard/service";
export const runtime = "nodejs";
export async function GET() {
  try {
    const auth = await workforceActor();
    if (auth.response) return auth.response;
    return workforceResponse({ ok: true, data: await getWorkforceDashboard(auth.actor.id) });
  } catch (error) {
    return workforceFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    const auth = await workforceActor(request);
    if (auth.response) return auth.response;
    const input = z
      .object({ action: z.literal("MARK_REVIEWED"), contactId: z.string().regex(/^\d{1,30}$/) })
      .strict()
      .parse(await workforceBody(request));
    await markProspectReviewed(auth.actor.id, input.contactId);
    return workforceResponse({ ok: true });
  } catch (error) {
    return workforceFailure(error);
  }
}
