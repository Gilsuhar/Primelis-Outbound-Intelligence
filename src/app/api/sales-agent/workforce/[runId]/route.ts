import { protectRunDrafts } from "@/server/agent-workforce/dashboard/service";
import { WorkforceOrchestrator } from "@/server/agent-workforce/orchestrator";
import {
  workforceActor,
  workforceBody,
  workforceFailure,
  workforceResponse,
} from "@/server/agent-workforce/http";
type Context = { params: Promise<{ runId: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const auth = await workforceActor();
    if (auth.response) return auth.response;
    const run = await new WorkforceOrchestrator().store.get(
      auth.actor.id,
      (await context.params).runId,
    );
    if (!run) throw new Error("NOT_FOUND");
    return workforceResponse({ ok: true, run: await protectRunDrafts(auth.actor.id,run) });
  } catch (error) {
    return workforceFailure(error);
  }
}
export async function PATCH(request: Request, context: Context) {
  try {
    const auth = await workforceActor(request);
    if (auth.response) return auth.response;
    const run = await new WorkforceOrchestrator().edit(
      auth.actor.id,
      (await context.params).runId,
      await workforceBody(request),
    );
    return workforceResponse({ ok: true, run: await protectRunDrafts(auth.actor.id,run) });
  } catch (error) {
    return workforceFailure(error);
  }
}
