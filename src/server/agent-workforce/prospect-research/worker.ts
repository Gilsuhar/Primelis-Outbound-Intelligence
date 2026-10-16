import "server-only";
import { ProspectResearchEngine } from "./engine";
/** One bounded agent stage per invocation. Durable checkpoints, no fire-and-forget promises. */
export async function drainProspectResearch(actor: string, runId?: string) {
  if (process.env.VERCEL_ENV === "production") return;
  const engine = new ProspectResearchEngine();
  if (runId) return engine.advance(actor, runId);
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
  if (candidate) return engine.advance(actor, candidate.id);
}
