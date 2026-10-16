import { protectRunDrafts } from "@/server/agent-workforce/dashboard/service";
import { WorkforceOrchestrator } from "@/server/agent-workforce/orchestrator";
import { workforceActor, workforceFailure, workforceResponse } from "@/server/agent-workforce/http";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request, context: { params: Promise<{ runId: string }> }) {
  try {
    const auth = await workforceActor(request);
    if (auth.response) return auth.response;
    const run = await new WorkforceOrchestrator().advance(
      auth.actor.id,
      (await context.params).runId,
    );
    return workforceResponse({ ok: true, run: await protectRunDrafts(auth.actor.id,run) });
  } catch (error) {
    return workforceFailure(error);
  }
}
