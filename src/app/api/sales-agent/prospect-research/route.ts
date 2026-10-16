import { z } from "zod";
import { after } from "next/server";
import {
  workforceActor,
  workforceBody,
  workforceFailure,
  workforceResponse,
} from "@/server/agent-workforce/http";
import {
  researchIdentity,
  ProspectResearchEngine,
} from "@/server/agent-workforce/prospect-research/engine";
import { drainProspectResearch } from "@/server/agent-workforce/prospect-research/worker";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function GET() {
  const auth = await workforceActor();
  if (auth.response) return auth.response;
  try {
    const engine = new ProspectResearchEngine();
    const { snapshotSchema } = await import("@/server/services/sales-agent-collection-service");
    const snapshots = (await engine.evidence.list(auth.actor.id)).flatMap((raw) => {
      const p = snapshotSchema.safeParse(raw);
      return p.success ? [p.data] : [];
    });
    const runs = (await engine.store.list(auth.actor.id)).filter(
      (r) =>
        r.prospectResearch &&
        snapshots.some(
          (s) =>
            s.contact.hubspotRecordId === r.intake.hubspotRecordId &&
            researchIdentity(s) === r.prospectResearch!.identityHash,
        ),
    );
    // Only research outputs; never expose an existing generation draft through this endpoint.
    return workforceResponse({
      ok: true,
      runs: runs.map((r) => ({
        id: r.id,
        intake: r.intake,
        research: {
          ...r.research,
          sources: r.research.sources.map((source) => ({
            ...source,
            excerpt: source.excerpt.slice(0, 1200),
          })),
        },
        prospectResearch: r.prospectResearch,
        usage: r.usage,
        updatedAt: r.updatedAt,
      })),
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
      { ok: false, message: "Research requires the configured integration operator" },
      403,
    );
  try {
    const body = z
      .object({
        contactId: z.string().min(1).max(200).optional(),
        after: z.string().min(1).max(200).optional(),
        limit: z.number().int().min(1).max(25).optional(),
        runId: z.string().min(1).max(100).optional(),
      })
      .strict()
      .parse(await workforceBody(request));
    const engine = new ProspectResearchEngine();
    if (body.runId) {
      const run = await engine.store.get(auth.actor.id, body.runId);
      if (!run?.prospectResearch) throw new Error("NOT_FOUND");
      after(async () => {
        await drainProspectResearch(auth.actor.id, body.runId);
      });
      return workforceResponse(
        { ok: true, message: "Resume scheduled; refresh for persisted stage progress" },
        202,
      );
    }
    const result = await engine.enqueue(auth.actor.id, body);
    after(async () => {
      await drainProspectResearch(auth.actor.id, result.records.find((r) => r.runId)?.runId);
    });
    return workforceResponse({ ok: true, ...result }, 202);
  } catch (error) {
    return workforceFailure(error);
  }
}
