import "server-only";
import { ProspectResearchEngine } from "./engine";
/** One bounded agent stage per invocation. Durable checkpoints, no fire-and-forget promises. */
export async function drainProspectResearch(actor: string, runId?: string) {
  if (process.env.VERCEL_ENV === "production") return;
  const engine = new ProspectResearchEngine();
  if (runId) {
    const result = await engine.advance(actor, runId);
    if (result.prospectResearch?.stages.REVIEW.status === "COMPLETE") {
      try {
        const { DraftStudioEngine } = await import("../draft-studio/engine");
        await new DraftStudioEngine().prepare(actor, result.id);
      } catch {
        /* Eligibility or dependencies remain unresolved; research progress is unaffected. */
      }
    }
    return result;
  }
  const now = Date.now();
  const runs = await (engine.store.pendingResearch?.(actor) ?? engine.store.list(actor));
  const candidate = runs
    .filter(
      (r) =>
        r.prospectResearch &&
        r.prospectResearch.status !== "STALE" &&
        (!r.leaseUntil || Date.parse(r.leaseUntil) <= now) &&
        Object.values(r.prospectResearch.stages).some(
          (s) =>
            s.status === "WAITING" ||
            s.status === "RUNNING" ||
            (s.status === "FAILED" &&
              s.attempts < 3 &&
              (!s.retryAt || Date.parse(s.retryAt) <= now)),
        ),
    )
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))[0];
  if (candidate) return drainProspectResearch(actor, candidate.id);
}
