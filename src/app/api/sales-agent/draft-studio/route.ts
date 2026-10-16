import { z } from "zod";
import { after } from "next/server";
import {
  workforceActor,
  workforceBody,
  workforceFailure,
  workforceResponse,
} from "@/server/agent-workforce/http";
import { DraftStudioEngine } from "@/server/agent-workforce/draft-studio/engine";
import { drainDraftStudio } from "@/server/agent-workforce/draft-studio/worker";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function GET(request: Request) {
  const auth = await workforceActor();
  if (auth.response) return auth.response;
  try {
    const contactId = z
      .string()
      .min(1)
      .max(200)
      .parse(new URL(request.url).searchParams.get("contactId"));
    const engine = new DraftStudioEngine();
    const runs = await (engine.store.byContact?.(auth.actor.id, contactId) ??
      engine.store.list(auth.actor.id));
    const latest = runs
      .filter((r) => r.draftStudio && r.intake.hubspotRecordId === contactId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return workforceResponse({
      ok: true,
      run: latest ? await engine.read(auth.actor.id, latest.id) : null,
    });
  } catch (error) {
    return workforceFailure(error);
  }
}
export async function POST(request: Request) {
  const auth = await workforceActor(request);
  if (auth.response) return auth.response;
  if (auth.actor.id !== process.env.INTEGRATION_OPERATOR_USER_ID)
    return workforceResponse(
      { ok: false, message: "Draft preparation is restricted to the integration operator" },
      403,
    );
  try {
    const body = z
      .union([
        z.object({ contactId: z.string().min(1).max(200) }).strict(),
        z.object({ runId: z.string().min(1).max(100) }).strict(),
      ])
      .parse(await workforceBody(request));
    const engine = new DraftStudioEngine();
    const run =
      "contactId" in body
        ? await engine.prepareContact(auth.actor.id, body.contactId)
        : await engine.read(auth.actor.id, body.runId);
    if (run.status === "RUNNING")
      after(async () => {
        try {
          await drainDraftStudio(auth.actor.id, run.id);
        } catch {
          /* Safe status polling retains the durable checkpoint; never log provider payloads. */
        }
      });
    return workforceResponse({ ok: true, run }, 202);
  } catch (error) {
    return workforceFailure(error);
  }
}
export async function PATCH(request: Request) {
  const auth = await workforceActor(request);
  if (auth.response) return auth.response;
  if (auth.actor.id !== process.env.INTEGRATION_OPERATOR_USER_ID)
    return workforceResponse({ ok: false }, 403);
  try {
    const body = z
      .object({ runId: z.string().min(1).max(100), mutation: z.unknown() })
      .strict()
      .parse(await workforceBody(request));
    const run = await new DraftStudioEngine().mutate(auth.actor.id, body.runId, body.mutation);
    if (run.status === "RUNNING")
      after(async () => {
        try {
          await drainDraftStudio(auth.actor.id, run.id);
        } catch {
          /* Safe status polling retains the durable checkpoint; never log provider payloads. */
        }
      });
    return workforceResponse({ ok: true, run });
  } catch (error) {
    return workforceFailure(error);
  }
}
