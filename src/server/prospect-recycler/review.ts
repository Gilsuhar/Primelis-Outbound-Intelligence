import { collectRecycler } from "./pipeline";
import { IntegrationError } from "../integrations/http";
import { recordKey, type Reader, type SupplementalEvidence } from "./types";
import type { RecyclerSystem } from "../../features/prospect-recycler/contracts";
import type { ReviewList } from "../../features/prospect-recycler/review";
import { qualificationSchema } from "../../features/prospect-recycler/qualification";

export type ReviewSource = "BOTH" | RecyclerSystem;
/** A shared provider-record cap includes mapped records, not just discovery results. */
export async function loadRecyclerReview(options: {
  readers: Partial<Record<RecyclerSystem, Reader>>;
  asOf: string;
  mode: ReviewList["mode"];
  source?: ReviewSource;
  limit?: number;
  evidence?: Record<string, SupplementalEvidence>;
}): Promise<ReviewList> {
  const limit = options.limit ?? 5;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    throw new IntegrationError("CONFIGURATION");
  const source = options.source ?? "BOTH";
  const systems = (["HUBSPOT", "OUTREACH"] as const).filter(
    (s) => source === "BOTH" || source === s,
  );
  const readers: Partial<Record<RecyclerSystem, Reader>> = {};
  const reserved = new Set<string>();
  const issues: ReviewList["issues"] = [];
  const reserve = (system: RecyclerSystem, id: string) => {
    const key = recordKey({ system, id });
    if (!reserved.has(key) && reserved.size >= limit) {
      issues.push({ code: "PROSPECT_LIMIT", resource: system });
      throw new IntegrationError("UNAVAILABLE");
    }
    reserved.add(key);
  };
  for (const system of systems) {
    const reader = options.readers[system];
    if (!reader) continue;
    readers[system] = {
      system,
      discover: async () => {
        const allocation =
          systems.length === 1
            ? limit
            : system === "HUBSPOT"
              ? Math.ceil(limit / 2)
              : Math.floor(limit / 2);
        const count = Math.min(allocation, limit - reserved.size);
        if (!count)
          return {
            items: [],
            status: "UNKNOWN",
            pages: 0,
            issues: [{ code: "PROSPECT_LIMIT", resource: system }],
          };
        const result = await reader.discover(count);
        if (result.items.length > count) throw new IntegrationError("INVALID_RESPONSE");
        for (const p of result.items) {
          if (p.record.system !== system) throw new IntegrationError("INVALID_RESPONSE");
          reserve(system, p.record.id);
        }
        return result;
      },
      collect: async (id) => {
        reserve(system, id);
        return reader.collect(id);
      },
    };
  }
  const result = await collectRecycler({
    readers,
    asOf: options.asOf,
    limitPerProvider: limit,
    evidence: options.evidence,
  });
  const list: ReviewList = {
    mode: options.mode,
    evaluatedAt: options.asOf,
    discovery: Object.entries(result.discovery).map(([provider, scan]) => ({
      provider,
      status: scan.status,
      count: scan.items.length,
    })),
    issues: [
      ...issues,
      ...result.issues,
      ...Object.entries(result.discovery).flatMap(([provider, scan]) =>
        scan.issues.map((i) => ({ code: i.code, resource: provider + "/" + i.resource })),
      ),
    ],
    rows: result.candidates.map((candidate, index) => ({
      id: candidate.input.candidateId,
      name: candidate.displayName || "Name unavailable",
      email: candidate.input.identity.email ?? null,
      employerDomain: candidate.input.identity.employerDomain ?? null,
      providers: candidate.input.identity.records.map((r) => r.system),
      identity: candidate.input.identity.resolution,
      hubspotId: candidate.input.identity.records.find(record => record.system === "HUBSPOT")?.id ?? null,
      qualification: qualificationSchema.safeParse(options.evidence?.[candidate.input.candidateId]?.qualification).data,
      decision: result.decisions[index],
      issues: candidate.issues,
      history: candidate.input.history,
      suppressions: candidate.input.suppressions,
      sequences: candidate.input.sequences,
      historyTraversal: candidate.historyTraversal,
    })),
  };
  // One review row per HubSpot ID. Conflicting duplicate inputs were already held by batch evaluation.
  // Keep the strongest negative decision; never combine evidence to manufacture clearance.
  const rank = { EXCLUDED: 0, HOLD: 1, ELIGIBLE: 2 };
  const seen = new Set<string>();
  list.rows = list.rows.sort((a, b) => rank[a.decision.status] - rank[b.decision.status]).filter(row => {
    if (!row.hubspotId) return true;
    if (seen.has(row.hubspotId)) return false;
    seen.add(row.hubspotId);
    return true;
  });
  return list;
}
