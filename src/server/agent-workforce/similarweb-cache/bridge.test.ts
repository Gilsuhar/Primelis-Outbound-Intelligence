// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cacheGrantSchema,
  type CacheGrant,
  type CacheReceipt,
} from "@/features/agent-workforce/similarweb-cache";
import { createCacheOnlyBridge, cacheHash, CACHE_TIMEOUT_MS } from "./bridge";
import { adaptCacheReceipt, projectCachedKeyword } from "./adapter";
import { existingScansReader } from "./store";
import { CompanyQueue } from "../company-queue/engine";
import { MemoryQueueStore } from "../company-queue/test-support";
import { fixtureExecutor, fixtureCompanies } from "../company-queue/fixtures";
import { signalFixtureAdapters, signalFixtureEvidence } from "../signal-opportunity/fixtures";
import { SignalStages } from "../signal-opportunity/pipeline";
import { projectSignalEvidence } from "../signal-opportunity/evidence";
import { parseQueue } from "../company-queue/contracts";

// Entirely fictional; these literals never authenticate against a real service.
const token = "fictional_offline_bearer_never_valid_outside_tests";
const now = new Date("2026-10-19T12:00:00Z");
const scope = {
  tenantId: "fictional-tenant",
  applicationId: "agent-workforce" as const,
  recordId: "fictional-cache-row",
  domain: "acme.example",
  country: "US",
  month: "2026-09",
  keyword: "Simulated Acme",
};
function permission(): CacheGrant {
  return {
    scope: { ...scope },
    tokenSha256: cacheHash(token),
    revoked: false,
    permission: {
      receiptId: "fictional-permission",
      reviewedBy: "fictional-reviewer",
      reviewedAt: "2026-10-18T12:00:00Z",
      expiresAt: "2026-10-20T12:00:00Z",
      basis: "FICTIONAL_TEST",
      licensedCacheAccess: true,
      crossApplicationReuse: true,
      purpose: "SIGNAL_OPPORTUNITY_RESEARCH",
    },
  };
}
function row() {
  return {
    id: scope.recordId,
    domain: scope.domain,
    country: "us",
    created_at: "2026-10-15T12:00:00Z",
    result: {
      schemaVersion: 3,
      domain: scope.domain,
      country: "us",
      dataMonth: "2026-09",
      brandKeywords: [
        {
          keyword: scope.keyword,
          totalClicks: 500,
          paidClicks: 100,
          cpc: 0.5,
          volume: 1000,
          competitors: [{ domain: "fictional-other.example", clicks: 20 }],
        },
      ],
      recoverable: { monthlyLow: 10000 },
      privateContact: "excluded-person@example.com",
    },
  };
}
function request(body: unknown = scope, headers: Record<string, string> = {}) {
  return new Request("https://bridge.example/cache-evidence", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + token,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
function setup() {
  const grant = permission(),
    read = vi.fn(async () => row());
  const resolveGrant = vi.fn((): unknown => grant);
  return {
    grant,
    read,
    resolveGrant,
    handle: createCacheOnlyBridge({
      mode: "SIMULATED",
      readCache: read,
      resolveGrant,
      now: () => now,
    }),
  };
}
beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("NO_NETWORK");
    }),
  ),
);
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("reads one scoped cached row, minimizes fields and preserves typed provenance without provider calls", async () => {
  const s = setup(),
    res = await s.handle(request()),
    raw = await res.json();
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(s.read).toHaveBeenCalledTimes(1);
  expect(s.read).toHaveBeenCalledWith(scope, expect.any(AbortSignal));
  const receipt = adaptCacheReceipt(raw, scope, "SIMULATED", now);
  expect(receipt).toMatchObject({
    device: "total",
    unit: "estimated_keyword_clicks",
    observedAt: "2026-10-15T12:00:00Z",
    observation: { keyword: scope.keyword, paidClicks: 100, totalClicks: 500 },
  });
  const serialized = JSON.stringify(receipt);
  for (const prohibited of [
    "cpc",
    "recoverable",
    "privateContact",
    "excluded-person",
    "competitors",
    token,
    "reviewedBy",
    "tokenSha256",
  ])
    expect(serialized).not.toContain(prohibited);
  const result = projectCachedKeyword(receipt);
  expect(result.facts).toHaveLength(2);
  for (const f of result.facts) expect(result.source.excerpt).toContain(f.quotes[0].text);
  expect(result.facts[0].statement).toContain("estimated paid keyword clicks");
  expect(result.blockers).toContain(
    "NORMALIZED_CACHE_RAW_PROVIDER_PROVENANCE_AND_BRAND_CLASSIFICATION_UNVERIFIED",
  );
});

it.each(["tenantId", "applicationId", "recordId", "domain", "country", "month", "keyword"])(
  "denies changed %s before any cache read",
  async (field) => {
    const s = setup();
    expect((await s.handle(request({ ...scope, [field]: "other" }))).status).toBe(403);
    expect(s.read).not.toHaveBeenCalled();
  },
);
it.each([
  ["missing auth", { authorization: "" }],
  ["wrong auth", { authorization: "Bearer " + "x".repeat(48) }],
  ["browser origin", { origin: "https://prime-signal.com" }],
  ["wrong content", { "content-type": "text/plain" }],
] as const)("denies %s", async (_name, headers) => {
  const s = setup();
  expect((await s.handle(request(scope, headers))).status).toBeGreaterThanOrEqual(400);
  expect(s.read).not.toHaveBeenCalled();
});
it.each([
  [
    "revoked",
    (g: CacheGrant) => {
      g.revoked = true;
    },
  ],
  [
    "expired",
    (g: CacheGrant) => {
      g.permission.expiresAt = now.toISOString();
    },
  ],
  [
    "future review",
    (g: CacheGrant) => {
      g.permission.reviewedAt = "2026-10-20T10:00:00Z";
    },
  ],
  [
    "real permission in fixture",
    (g: CacheGrant) => {
      g.permission.basis = "VERIFIED_LICENSE";
    },
  ],
  [
    "nonfictional account",
    (g: CacheGrant) => {
      g.scope.domain = "real-company.com";
    },
  ],
] as const)("rejects %s permission", async (_name, mutate) => {
  const s = setup();
  mutate(s.grant);
  expect((await s.handle(request())).status).toBe(403);
  expect(s.read).not.toHaveBeenCalled();
});
it("requires both licensed access and cross-application permission, not just a valid token", async () => {
  for (const field of [
    "licensedCacheAccess",
    "crossApplicationReuse",
    "receiptId",
    "reviewedBy",
  ] as const) {
    const grant = permission();
    delete (grant.permission as Partial<CacheGrant["permission"]>)[field];
    expect(cacheGrantSchema.safeParse(grant).success).toBe(false);
    const read = vi.fn();
    const handle = createCacheOnlyBridge({
      mode: "SIMULATED",
      resolveGrant: () => grant,
      readCache: read,
      now: () => now,
    });
    expect((await handle(request())).status).toBe(403);
    expect(read).not.toHaveBeenCalled();
  }
});
it("cannot enable LIVE with a runtime parameter, even with asserted license approval", async () => {
  const s = setup();
  s.grant.permission.basis = "VERIFIED_LICENSE";
  const handle = createCacheOnlyBridge({
    mode: "LIVE",
    resolveGrant: s.resolveGrant,
    readCache: s.read,
    now: () => now,
  });
  expect((await handle(request())).status).toBe(503);
  expect(s.resolveGrant).not.toHaveBeenCalled();
  expect(s.read).not.toHaveBeenCalled();
});
it("does not expose records if permission is revoked during a read", async () => {
  const s = setup();
  s.read.mockImplementation(async () => {
    s.grant.revoked = true;
    return row();
  });
  expect((await s.handle(request())).status).toBe(403);
});
it.each([
  [
    "wrong domain",
    (r: ReturnType<typeof row>) => {
      r.domain = "other.example";
    },
  ],
  [
    "wrong record",
    (r: ReturnType<typeof row>) => {
      r.id = "another-row";
    },
  ],
  [
    "wrong month",
    (r: ReturnType<typeof row>) => {
      r.result.dataMonth = "2026-08";
    },
  ],
  [
    "wrong country",
    (r: ReturnType<typeof row>) => {
      r.result.country = "gb";
    },
  ],
  [
    "old schema",
    (r: ReturnType<typeof row>) => {
      r.result.schemaVersion = 2;
    },
  ],
  [
    "stale",
    (r: ReturnType<typeof row>) => {
      r.created_at = "2026-09-01T00:00:00Z";
    },
  ],
  [
    "future",
    (r: ReturnType<typeof row>) => {
      r.created_at = "2026-10-21T00:00:00Z";
    },
  ],
  [
    "duplicate keyword",
    (r: ReturnType<typeof row>) => {
      r.result.brandKeywords.push(r.result.brandKeywords[0]);
    },
  ],
  [
    "oversize",
    (r: ReturnType<typeof row>) => {
      r.result.privateContact = "x".repeat(66000);
    },
  ],
] as const)("fails closed for %s cached response", async (_name, mutate) => {
  const s = setup(),
    value = row();
  mutate(value);
  s.read.mockResolvedValue(value);
  expect((await s.handle(request())).status).toBeGreaterThanOrEqual(400);
  expect(s.read).toHaveBeenCalledTimes(1);
});
it("has no miss fallback, retry or raw exception leakage", async () => {
  const s = setup();
  s.read.mockRejectedValue(new Error("private-content-must-not-escape"));
  const res = await s.handle(request());
  expect(res.status).toBe(503);
  expect(await res.text()).not.toContain("private-content");
  expect(s.read).toHaveBeenCalledTimes(1);
  const miss = vi.fn(async () => null);
  const handler = createCacheOnlyBridge({
    mode: "SIMULATED",
    resolveGrant: s.resolveGrant,
    readCache: miss,
    now: () => now,
  });
  expect((await handler(request())).status).toBe(404);
  expect(miss).toHaveBeenCalledTimes(1);
});
it("bounds input without trusting Content-Length and rejects extra fields", async () => {
  const s = setup();
  expect((await s.handle(request({ ...scope, extra: "x".repeat(3000) }))).status).toBe(413);
  expect((await s.handle(request({ ...scope, scan: true }))).status).toBe(403);
  expect(s.read).not.toHaveBeenCalled();
});
it("denies unsupported methods, query parameters, malformed JSON and missing bodies", async () => {
  const s = setup();
  const headers = { "content-type": "application/json", authorization: "Bearer " + token };
  for (const req of [
    new Request("https://bridge.example/cache-evidence"),
    new Request("https://bridge.example/cache-evidence?scan=true", {
      method: "POST",
      headers,
      body: JSON.stringify(scope),
    }),
    new Request("https://bridge.example/scan", {
      method: "POST",
      headers,
      body: JSON.stringify(scope),
    }),
    new Request("https://bridge.example/cache-evidence", { method: "POST", headers, body: "{" }),
    new Request("https://bridge.example/cache-evidence", { method: "POST", headers }),
  ])
    expect((await s.handle(req)).status).toBeGreaterThanOrEqual(400);
  expect(s.read).not.toHaveBeenCalled();
});
it("times out and holds the concurrency slot until a non-cooperative cache reader settles", async () => {
  vi.useFakeTimers();
  let resolve!: (r: unknown) => void;
  const read = vi.fn(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const handle = createCacheOnlyBridge({
    mode: "SIMULATED",
    resolveGrant: () => permission(),
    readCache: read,
    now: () => now,
  });
  const pending = handle(request());
  await vi.advanceTimersByTimeAsync(1);
  expect((await handle(request())).status).toBe(429);
  await vi.advanceTimersByTimeAsync(CACHE_TIMEOUT_MS);
  expect((await pending).status).toBe(503);
  expect((await handle(request())).status).toBe(429);
  expect(read).toHaveBeenCalledTimes(1);
  expect(read.mock.calls[0]).toBeDefined();
  resolve(row());
  await vi.advanceTimersByTimeAsync(1);
});
it("the Supabase handoff uses only exact SELECT filters, abort and maybeSingle", async () => {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    abortSignal: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data: row(), error: null })),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.abortSignal.mockReturnValue(query);
  const from = vi.fn(() => query),
    signal = new AbortController().signal;
  const read = existingScansReader({ from } as unknown as Pick<SupabaseClient, "from">);
  await read(scope, signal);
  expect(from).toHaveBeenCalledTimes(1);
  expect(from).toHaveBeenCalledWith("scans");
  expect(query.select).toHaveBeenCalledTimes(1);
  expect(query.select).toHaveBeenCalledWith("id,domain,country,created_at,result");
  expect(query.eq.mock.calls).toEqual([
    ["id", scope.recordId],
    ["domain", scope.domain],
    ["country", "us"],
    ["result->>dataMonth", scope.month],
  ]);
  expect(query.abortSignal).toHaveBeenCalledWith(signal);
  expect(query.maybeSingle).toHaveBeenCalledOnce();
});

it.each([
  [
    "metric tampering",
    (r: CacheReceipt) => {
      r.observation.paidClicks = 900;
    },
  ],
  [
    "wrong receipt tenant",
    (r: CacheReceipt) => {
      r.scope.tenantId = "other-tenant";
    },
  ],
  [
    "expired receipt permission",
    (r: CacheReceipt) => {
      r.permissionExpiresAt = now.toISOString();
    },
  ],
  [
    "wrong source identity",
    (r: CacheReceipt) => {
      r.sourceUrl = "https://bridge.example/cache-evidence/other";
    },
  ],
  [
    "simulated to live",
    (r: CacheReceipt) => {
      r.mode = "LIVE";
    },
  ],
  [
    "contradictory clicks with valid hash",
    (r: CacheReceipt) => {
      r.observation.paidClicks = 900;
      r.observationSha256 = cacheHash(JSON.stringify(r.observation));
    },
  ],
] as const)("adapter rejects %s", async (_name, mutate) => {
  const s = setup(),
    receipt: CacheReceipt = await (await s.handle(request())).json();
  mutate(receipt);
  expect(() => adaptCacheReceipt(receipt, scope, "SIMULATED", now)).toThrow();
});
it("preserves missing and zero, produces no positive claims from either and never derives a visits share", async () => {
  const s = setup(),
    raw = row();
  raw.result.brandKeywords[0].paidClicks = 0;
  s.read.mockResolvedValue(raw);
  const receipt = adaptCacheReceipt(
    await (await s.handle(request())).json(),
    scope,
    "SIMULATED",
    now,
  );
  receipt.observation.totalClicks = null;
  receipt.observationSha256 = cacheHash(JSON.stringify(receipt.observation));
  const verified = adaptCacheReceipt(receipt, scope, "SIMULATED", now),
    projected = projectCachedKeyword(verified);
  expect(verified.observation).toMatchObject({ totalClicks: null, paidClicks: 0 });
  expect(projected.facts).toEqual([]);
  expect(projected.blockers).toContain("CACHE_CLICK_METRICS_UNAVAILABLE_OR_ZERO_AMBIGUOUS");
  expect(verified).not.toHaveProperty("paidSearchVisits");
  expect(verified).not.toHaveProperty("brandedPaidSharePercent");
});

it.each([false, true])(
  "queue grounding and Judgement retain cache provenance and HOLD (review rejection: %s)",
  async (reject) => {
    const s = setup(),
      receipt = adaptCacheReceipt(
        await (await s.handle(request())).json(),
        scope,
        "SIMULATED",
        now,
      );
    const adapters = signalFixtureAdapters();
    adapters.cacheScope = () => scope;
    adapters.collect = async (job, time) => {
      const e = signalFixtureEvidence(job, time);
      delete e.search;
      return { ...e, cachedSearch: receipt };
    };
    if (reject) {
      const original = adapters.runtime;
      adapters.runtime = (job) => {
        const runtime = original(job);
        return {
          ...runtime,
          model: {
            ...runtime.model,
            structured: async (_stage, schema, _prompt, raw) => {
              const facts = (raw as { research: { facts: { id: string; sourceIds: string[] }[] } })
                .research.facts;
              return schema.parse({
                identityMatches: true,
                supportedFactIds: facts.slice(1).map((f) => f.id),
                rejectedFactIds: [facts[0].id],
                concerns: [
                  {
                    severity: "BLOCKING",
                    scope: "FACT",
                    code: "CLAIM_NOT_ENTAILED",
                    reason: "Fictional reviewer rejects the candidate.",
                    factIds: [facts[0].id],
                    sourceIds: facts[0].sourceIds,
                  },
                ],
              });
            },
          },
        };
      };
    }
    const store = new MemoryQueueStore(),
      queue = new CompanyQueue(store, new SignalStages(adapters, fixtureExecutor()), () => now);
    const { fixture, ...input } = fixtureCompanies[0];
    await queue.enqueue(
      "fictional-actor",
      input,
      "fictional-cache-job",
      fixture,
      "SIGNAL_OPPORTUNITY_V1",
    );
    for (let i = 0; i < 12; i++) await queue.tick("fictional-actor");
    const state = parseQueue(JSON.parse(JSON.stringify(await store.read("fictional-actor")))),
      job = state.jobs[0];
    expect(job.status).toBe("COMPLETE");
    expect(job.signalEvidence?.cachedSearch).toEqual(receipt);
    const corrupt = structuredClone(state);
    corrupt.jobs[0].signalEvidence!.cachedSearch!.mode = "LIVE";
    expect(() => parseQueue(corrupt)).toThrow("QUEUE_CORRUPT");
    expect(job.signalReport).toMatchObject({
      eligibility: "HOLD",
      emails: [],
      canSend: false,
      canEnroll: false,
    });
    expect(job.run.usage).toEqual([]);
    expect(job.judgement).toBeTruthy();
    if (reject) {
      expect(job.run.research.facts).toEqual([]);
      expect(job.run.groundingAudit?.reasonCodes).toContain("REJECTED_FACTS");
    } else {
      expect(job.run.research.facts).toHaveLength(3);
      expect(job.signalReport?.insights).toHaveLength(3);
    }
    const projected = projectSignalEvidence(
      job.run,
      { ...job.signalEvidence!, serp: undefined },
      now,
      "SIMULATED",
      scope,
    );
    expect(projected.blockers).toContain("DATED_LOCATION_SPECIFIC_BRANDED_SERP_REQUIRED");
    expect(projected.facts.every((f) => !f.statement.includes("competitor"))).toBe(true);
    for (const expected of [undefined, { ...scope, tenantId: "different-tenant" }]) {
      expect(
        projectSignalEvidence(job.run, job.signalEvidence!, now, "SIMULATED", expected).blockers,
      ).toContain("CACHE_EVIDENCE_IDENTITY_SCOPE_PERMISSION_OR_INTEGRITY_FAILED");
    }
    expect(projectSignalEvidence(job.run, job.signalEvidence!, now, "LIVE").blockers).toContain(
      "CACHE_EVIDENCE_IDENTITY_SCOPE_PERMISSION_OR_INTEGRITY_FAILED",
    );
  },
);
