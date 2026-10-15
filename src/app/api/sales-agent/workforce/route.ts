import { WorkforceOrchestrator } from "@/server/agent-workforce/orchestrator";
import {
  workforceActor,
  workforceBody,
  workforceFailure,
  workforceResponse,
} from "@/server/agent-workforce/http";
export const runtime = "nodejs";
export async function GET() {
  try {
    const auth = await workforceActor();
    if (auth.response) return auth.response;
    const runs = await new WorkforceOrchestrator().store.list(auth.actor.id);
    return workforceResponse({ ok: true, runs });
  } catch (error) {
    return workforceFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    const auth = await workforceActor(request);
    if (auth.response) return auth.response;
    const run = await new WorkforceOrchestrator().start(
      auth.actor.id,
      await workforceBody(request),
    );
    return workforceResponse({ ok: true, run }, 202);
  } catch (error) {
    return workforceFailure(error);
  }
}
