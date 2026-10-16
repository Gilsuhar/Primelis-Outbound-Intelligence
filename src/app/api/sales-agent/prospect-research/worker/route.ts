import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { workforceBody, workforceResponse } from "@/server/agent-workforce/http";
import { PrismaIntegrationStore } from "@/server/integrations/store";
import { enqueueResearchBatch } from "@/server/agent-workforce/prospect-research/intake";
import { enqueueDraftBatch, drainDraftStudio } from "@/server/agent-workforce/draft-studio/worker";
import { drainProspectResearch } from "@/server/agent-workforce/prospect-research/worker";
export const runtime = "nodejs";
export const maxDuration = 120;
/** Reuse existing scheduler authentication; never install a Production cron. */
export async function POST(request: Request) {
  if (process.env.VERCEL_ENV === "production") return workforceResponse({ ok: false }, 403);
  const secret = process.env.INTEGRATION_WORKER_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") ?? ""),
    expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (
    !secret ||
    secret.length < 32 ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    return workforceResponse({ ok: false }, 401);
  try {
    const body = z
      .object({ actorId: z.string().min(1).max(200) })
      .strict()
      .parse(await workforceBody(request));
    if (body.actorId !== process.env.INTEGRATION_OPERATOR_USER_ID)
      return workforceResponse({ ok: false }, 403);
    const batch = await enqueueResearchBatch(body.actorId);
    await enqueueDraftBatch(body.actorId);
    // Alternate research and writing while sharing the existing one-stage operator lease.
    const store = new PrismaIntegrationStore();
    const turn = (await store.get(body.actorId, "HUBSPOT")).state.workforceTurn ?? "RESEARCH";
    if (turn === "RESEARCH") {
      if (!(await drainProspectResearch(body.actorId))) await drainDraftStudio(body.actorId);
    } else {
      if (!(await drainDraftStudio(body.actorId))) await drainProspectResearch(body.actorId);
    }
    await store.change(body.actorId, "HUBSPOT", async (row) => {
      row.state.workforceTurn = turn === "RESEARCH" ? "DRAFT" : "RESEARCH";
      return { row, value: undefined };
    });
    return workforceResponse({ ok: true, ...batch });
  } catch {
    return workforceResponse(
      { ok: false, message: "Research worker unavailable; checkpoint retained" },
      503,
    );
  }
}
