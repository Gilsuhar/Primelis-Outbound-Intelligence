import { afterEach, describe, expect, it, vi } from "vitest";
import { IntegrationError, nextReadPage, ReadTransport } from "./http";
import { HubSpotConnector } from "./hubspot";
import { OutreachConnector, OutreachTokens } from "./outreach";
import { decryptToken, encryptToken, type IntegrationStore, type StoredIntegration } from "./store";
import { initialState, type IntegrationProvider } from "./contracts";
import { IntegrationSync } from "./sync";
import { normalizeCollectedEvidence, type IntakeContact } from "@/features/sales-agent/evidence";
import { qualifyProspect } from "@/features/sales-agent/qualification";
import type { EvidenceSnapshot, EvidenceStore } from "@/server/sales-agent/evidence-store";
const now = new Date("2026-10-16T12:00:00Z");
const contact = (): IntakeContact => ({
  hubspotRecordId: "42",
  ownerId: "1087915602",
  fullName: "Fictional Morgan",
  email: "morgan@fictional.example",
  companyDomain: "fictional.example",
  observedAt: now.toISOString(),
  intakeSince: "2026-10-01T00:00:00Z",
  hubspotCreatedAt: "2026-10-15T00:00:00Z",
  observations: [],
  warnings: [],
  outreachProspectId: "7",
});
const json = (value: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(value, { status, headers });
class MemoryStore implements IntegrationStore {
  rows = new Map<string, StoredIntegration>();
  leases = new Set<string>();
  async get(actor: string, provider: IntegrationProvider) {
    return structuredClone(
      this.rows.get(`${actor}:${provider}`) ?? {
        state: initialState(provider),
        secret: null,
        version: 0,
      },
    );
  }
  async change<T>(
    actor: string,
    provider: IntegrationProvider,
    update: Parameters<IntegrationStore["change"]>[2],
  ) {
    const { row, value } = await update(await this.get(actor, provider));
    this.rows.set(`${actor}:${provider}`, structuredClone({ ...row, version: row.version + 1 }));
    return value as T;
  }
  async claim(actor: string, provider: IntegrationProvider) {
    const key = `${actor}:${provider}`;
    if (this.leases.has(key)) return false;
    this.leases.add(key);
    return true;
  }
  async release(actor: string, provider: IntegrationProvider) {
    this.leases.delete(`${actor}:${provider}`);
  }
}
function evidenceStore() {
  const data = new Map<string, EvidenceSnapshot>();
  const store: EvidenceStore = {
    save: async (_actor, snapshots) => {
      snapshots.forEach((snapshot) =>
        data.set(snapshot.contact.hubspotRecordId, structuredClone(snapshot)),
      );
    },
    list: async () => [...data.values()].map((snapshot) => structuredClone(snapshot)),
    edit: async (_actor, id, update) => {
      const saved = data.get(id);
      if (!saved) return false;
      const next = update(structuredClone(saved));
      if (!next) return false;
      data.set(id, next);
      return true;
    },
    suppressionRecords: async () => [],
  };
  return { store, data };
}
function resource(
  type: string,
  id: string,
  attributes: Record<string, unknown> = {},
  relationships?: Record<string, unknown>,
) {
  return { type, id, attributes, ...(relationships ? { relationships } : {}) };
}
const relation = (type: string, id: string) => ({ data: { type, id } });
function outreachFetch(overrides: Record<string, unknown> = {}) {
  const responses: Record<string, unknown> = {
    "/api/v2/prospects/7": {
      data: resource(
        "prospect",
        "7",
        {
          firstName: "Fictional",
          lastName: "Morgan",
          emails: ["morgan@fictional.example"],
          optedOut: false,
          emailOptedOut: false,
        },
        { account: relation("account", "8") },
      ),
    },
    "/api/v2/accounts/8": { data: resource("account", "8", { domain: "fictional.example" }) },
    "/api/v2/mailings": {
      data: [
        resource(
          "mailing",
          "9",
          { sentAt: "2026-09-10T00:00:00Z", bouncedAt: null, markedAsSpamAt: null },
          { prospect: relation("prospect", "7") },
        ),
      ],
      links: { next: null },
    },
    "/api/v2/sequenceStates": { data: [], links: { next: null } },
    ...overrides,
  };
  return vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input)).pathname;
    if (!(path in responses)) throw new Error("Unexpected API path");
    return json(responses[path]);
  });
}
afterEach(() => vi.unstubAllEnvs());
describe("read-only transport", () => {
  it("retries transient responses and honors Retry-After without leaking bodies", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json({ secret: "never output" }, 429, { "Retry-After": "1" }))
      .mockResolvedValueOnce(json({}, 503))
      .mockResolvedValueOnce(json({ data: [] }));
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
    await new ReadTransport("https://api.outreach.io", async () => "private", {
      fetcher,
      sleep,
    }).read("/api/v2/prospects");
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls[0]).toEqual([1000]);
    expect(fetcher.mock.calls.every((call) => call[1].method === "GET")).toBe(true);
  });
  it.each([401, 403, 404])(
    "reports HTTP %i without exposing provider content or retrying",
    async (status) => {
      const fetcher = vi.fn(async () => json({ token: "private" }, status));
      await expect(
        new ReadTransport("https://api.outreach.io", async () => "private", { fetcher }).read(
          "/api/v2/prospects",
        ),
      ).rejects.toThrow(`HTTP ${status}`);
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it("defers long rate limits and never retries authentication failures", async () => {
    const sleep = vi.fn();
    const reader = new ReadTransport("https://api.outreach.io", async () => "private", {
      fetcher: vi.fn(async () => json({}, 429, { "Retry-After": "120" })),
      sleep,
    });
    await expect(reader.read("/api/v2/prospects")).rejects.toMatchObject({
      code: "RATE_LIMITED",
      retryAfterMs: 120000,
    });
    expect(sleep).not.toHaveBeenCalled();
  });
  it("rejects write endpoints, foreign hosts, credentials and search bodies on other resources", async () => {
    const fetcher = vi.fn();
    const reader = new ReadTransport("https://api.outreach.io", async () => "private", { fetcher });
    for (const path of [
      "https://foreign.example/api/v2/prospects",
      "/api/v2/sequenceStates/7/activate",
      "//user:pass@api.outreach.io/api/v2/prospects",
    ])
      await expect(reader.read(path)).rejects.toThrow("CONFIGURATION");
    await expect(reader.read("/api/v2/prospects", {})).rejects.toThrow("CONFIGURATION");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("binds pagination to the same resource and prospect filter", () => {
    const current = "/api/v2/mailings?filter[prospect][id]=7&page[offset]=0";
    expect(
      nextReadPage(current, "?filter[prospect][id]=7&page[offset]=100", "https://api.outreach.io"),
    ).toBe("/api/v2/mailings?filter[prospect][id]=7&page[offset]=100");
    for (const next of [
      "https://foreign.example/api/v2/mailings",
      "/api/v2/mailings?filter[prospect][id]=8&page[offset]=100",
      "/api/v2/mailings?filter[prospect][id]=7&page[offset]=0",
    ])
      expect(() => nextReadPage(current, next, "https://api.outreach.io")).toThrow();
  });
});
describe("Outreach OAuth and identity/history", () => {
  it("encrypts tokens with actor binding and rejects wrong keys/actors", () => {
    const key = Buffer.alloc(32, 5).toString("base64"),
      encrypted = encryptToken("actor", "private-refresh", key);
    expect(encrypted).not.toContain("private-refresh");
    expect(decryptToken("actor", encrypted, key)).toBe("private-refresh");
    expect(() => decryptToken("other", encrypted, key)).toThrow("CONFIGURATION");
    expect(() => encryptToken("actor", "x", "invalid")).toThrow();
  });
  it("persists rotated tokens before use and reuses an unexpired access token", async () => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", Buffer.alloc(32, 6).toString("base64"));
    const store = new MemoryStore(),
      fetcher = vi.fn(async () =>
        json({ access_token: "new-access", refresh_token: "rotated", expires_in: 3600 }),
      );
    const tokens = new OutreachTokens(
      "actor",
      store,
      {
        clientId: "id",
        clientSecret: "secret",
        refreshToken: "old",
        redirectUri: "https://preview.example/callback",
      },
      fetcher,
    );
    expect(await tokens.access()).toBe("new-access");
    expect(await tokens.access()).toBe("new-access");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(decryptToken("actor", (await store.get("actor", "OUTREACH")).secret!)).toContain(
      "rotated",
    );
    expect(JSON.stringify((await store.get("actor", "OUTREACH")).state)).not.toContain(
      "new-access",
    );
  });
  it("does not retry a rejected or possibly consumed refresh grant", async () => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", Buffer.alloc(32, 6).toString("base64"));
    const fetcher = vi.fn(async () => json({ error: "invalid_grant" }, 400));
    await expect(
      new OutreachTokens(
        "actor",
        new MemoryStore(),
        {
          clientId: "id",
          clientSecret: "secret",
          refreshToken: "old",
          redirectUri: "https://preview.example/callback",
        },
        fetcher,
      ).access(),
    ).rejects.toThrow("DISCONNECTED");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("reads actual outbound dates, sequence blocks and suppression while keeping unproven coverage HOLD", async () => {
    const fetcher = outreachFetch({
      "/api/v2/sequenceStates": {
        data: [
          resource(
            "sequenceState",
            "10",
            { state: "paused" },
            { prospect: relation("prospect", "7") },
          ),
        ],
      },
    });
    const result = await new OutreachConnector(
      async () => "test",
      { fetcher },
      () => now,
    ).collect(contact(), []);
    expect(result.observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "lastOutboundAt", value: "2026-09-10T00:00:00.000Z" }),
        expect.objectContaining({ field: "activeSequence", value: true }),
        expect.objectContaining({ field: "outreachHistoryComplete", value: false }),
      ]),
    );
    expect(result.blockers.join()).toContain("UNKNOWN");
    expect(
      result.observations.some((item) => item.field === "complained" && item.value === false),
    ).toBe(false);
    expect(
      fetcher.mock.calls.every((call) =>
        String(call[0]).startsWith("https://api.outreach.io/api/v2/"),
      ),
    ).toBe(true);
  });
  it("never equates an empty mailing page with never contacted", async () => {
    const result = await new OutreachConnector(
      async () => "test",
      { fetcher: outreachFetch({ "/api/v2/mailings": { data: [] } }) },
      () => now,
    ).collect(contact(), []);
    expect(result.observations.some((item) => item.field === "lastOutboundAt")).toBe(false);
    expect(
      result.observations.find((item) => item.field === "outreachHistoryComplete")?.value,
    ).toBe(false);
  });
  it("refuses unverified email matching and unscoped CRM external IDs", async () => {
    const fetcher = vi.fn();
    const input = contact();
    delete input.outreachProspectId;
    const result = await new OutreachConnector(async () => "test", { fetcher }).collect(input, []);
    expect(result.blockers[0]).toContain("UNKNOWN");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects multiple email matches rather than merging", async () => {
    const input = contact();
    delete input.outreachProspectId;
    input.emailModifiedAt = "2026-10-14T00:00:00Z";
    const proof = {
      hubspotRecordId: "42",
      field: "emailVerification" as const,
      value: {
        status: "VALID",
        independentlyVerified: true,
        emailMatchesCurrentRecord: true,
        businessEmailVerified: true,
      },
      provider: "INDEPENDENT_VERIFICATION" as const,
      sourceRecordId: "fictional-test-proof",
      observedAt: now.toISOString(),
      verifiedAt: now.toISOString(),
      independent: true,
      supportingEvidence: ["fictional independent verification"],
      subjectEmail: input.email,
    };
    const fetcher = outreachFetch({
      "/api/v2/prospects": { data: [resource("prospect", "7"), resource("prospect", "8")] },
    });
    const result = await new OutreachConnector(
      async () => "test",
      { fetcher },
      () => now,
    ).collect(input, [proof]);
    expect(result.blockers[0]).toContain("AMBIGUOUS");
    expect(result.observations).toEqual([]);
  });
  it("rejects conflicting contact and company identities", async () => {
    for (const overrides of [
      {
        "/api/v2/prospects/7": {
          data: resource("prospect", "7", { emails: ["other@fictional.example"] }),
        },
      },
      { "/api/v2/accounts/8": { data: resource("account", "8", { domain: "other.example" }) } },
    ]) {
      const result = await new OutreachConnector(
        async () => "test",
        { fetcher: outreachFetch(overrides) },
        () => now,
      ).collect(contact(), []);
      expect(result.observations).toEqual([]);
      expect(result.blockers.join()).toMatch(/conflict/);
    }
  });
  it("paginates mailings and rejects data from another prospect", async () => {
    const fetcher = outreachFetch({
      "/api/v2/mailings": {
        data: [
          resource(
            "mailing",
            "9",
            { sentAt: "2026-09-10T00:00:00Z" },
            { prospect: relation("prospect", "999") },
          ),
        ],
      },
    });
    await expect(
      new OutreachConnector(
        async () => "test",
        { fetcher },
        () => now,
      ).collect(contact(), []),
    ).rejects.toThrow("INVALID_RESPONSE");
  });
  it("retains bounce and complaint blocks", async () => {
    const fetcher = outreachFetch({
      "/api/v2/mailings": {
        data: [
          resource(
            "mailing",
            "9",
            { bouncedAt: "2026-10-01T00:00:00Z", markedAsSpamAt: "2026-10-02T00:00:00Z" },
            { prospect: relation("prospect", "7") },
          ),
        ],
      },
    });
    const result = await new OutreachConnector(
      async () => "test",
      { fetcher },
      () => now,
    ).collect(contact(), []);
    expect(result.observations).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "complained", value: true })]),
    );
    expect(result.blockers.join()).toContain("bounce observed");
    expect(result.observations.some((item) => item.field === "hardBounced")).toBe(false);
  });
});
describe("HubSpot initial and incremental discovery", () => {
  it("filters owner, deduplicates records and uses modification only for discovery", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      json({
        results: [
          { id: "42", properties: { hubspot_owner_id: "1087915602" } },
          { id: "42", properties: { hubspot_owner_id: "1087915602" } },
          { id: "99", properties: { hubspot_owner_id: "other" } },
        ],
      }),
    );
    const connector = new HubSpotConnector(
      { token: "test", portalId: "123" },
      { fetcher },
      () => now,
    );
    expect(await connector.discover("2026-10-01T00:00:00Z", now.toISOString(), "40")).toEqual({
      ids: ["42"],
      next: undefined,
    });
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body.filterGroups[0].filters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ propertyName: "hubspot_owner_id", value: "1087915602" }),
        expect.objectContaining({ propertyName: "hs_object_id", operator: "GT", value: "40" }),
      ]),
    );
  });
  it("requires authenticated reads before declaring connected", async () => {
    const fetcher = vi.fn(async () => json({}, 403));
    await expect(
      new HubSpotConnector({ token: "test", portalId: "123" }, { fetcher }).check(),
    ).rejects.toThrow("PERMISSION_MISSING");
  });
});
describe("durable sync safety", () => {
  function setup() {
    const store = new MemoryStore(),
      evidence = evidenceStore();
    const hubspot = {
      check: vi.fn(async () => {}),
      discover: vi.fn<
        (since: string, until: string, cursor?: string) => Promise<{ ids: string[]; next?: string }>
      >(async () => ({
        ids: ["42", "42"],
        next: undefined,
      })),
      contact: vi.fn(async () => contact()),
    };
    const sync = new IntegrationSync("actor", {
      store,
      evidence: evidence.store,
      hubspot,
      now: () => now,
      intakeSince: "2026-10-01T00:00:00Z",
    });
    return { store, evidence, hubspot, sync };
  }
  it("deduplicates requests and contacts and advances success only after all units", async () => {
    const { sync, store, evidence, hubspot } = setup();
    const job = await sync.start("HUBSPOT", "INITIAL", "request-0001");
    expect((await sync.start("HUBSPOT", "INITIAL", "request-0001")).id).toBe(job.id);
    expect(hubspot.check).toHaveBeenCalledTimes(1);
    await sync.step("HUBSPOT");
    expect((await store.get("actor", "HUBSPOT")).state.lastSuccessfulSync).toBeNull();
    await sync.step("HUBSPOT");
    expect(evidence.data.size).toBe(1);
    await sync.step("HUBSPOT");
    const state = (await store.get("actor", "HUBSPOT")).state;
    expect(state.job?.status).toBe("COMPLETED");
    expect(state.job?.imported).toBe(1);
    expect(state.lastSuccessfulSync).toBe(now.toISOString());
  });
  it("checkpoints failures without marking partial import complete", async () => {
    const { sync, store, hubspot } = setup();
    await sync.start("HUBSPOT", "INITIAL", "request-0002");
    await sync.step("HUBSPOT");
    hubspot.contact.mockRejectedValueOnce(new IntegrationError("PERMISSION_MISSING", 403));
    await sync.step("HUBSPOT");
    const state = (await store.get("actor", "HUBSPOT")).state;
    expect(state.status).toBe("PERMISSION_MISSING");
    expect(state.job?.pending).toEqual(["42"]);
    expect(state.lastSuccessfulSync).toBeNull();
    await sync.resume("HUBSPOT");
    await sync.step("HUBSPOT");
    await sync.step("HUBSPOT");
    expect((await store.get("actor", "HUBSPOT")).state.job?.status).toBe("COMPLETED");
  });
  it("prevents concurrent workers and isolates actor state", async () => {
    const { sync, store, hubspot } = setup();
    await sync.start("HUBSPOT", "INITIAL", "request-0003");
    await store.claim("actor", "HUBSPOT");
    expect(await sync.step("HUBSPOT")).toBe(false);
    expect(hubspot.discover).not.toHaveBeenCalled();
    expect((await store.get("other", "HUBSPOT")).state.job).toBeNull();
  });
  it("uses incremental overlap and refreshes unchanged existing contacts", async () => {
    const { sync, store, hubspot } = setup();
    await sync.start("HUBSPOT", "INITIAL", "request-0004");
    while (await sync.step("HUBSPOT")) {
      /* drain */
    }
    hubspot.discover.mockResolvedValueOnce({ ids: [], next: undefined });
    await sync.start("HUBSPOT", "INCREMENTAL", "request-0005");
    while (await sync.step("HUBSPOT")) {
      /* drain */
    }
    expect(hubspot.discover.mock.calls[1][0]).toBe("2026-10-16T11:55:00.000Z");
    expect(hubspot.contact).toHaveBeenCalledTimes(2);
    expect((await store.get("actor", "HUBSPOT")).state.job?.updated).toBe(1);
  });
  it("does not reuse an older request key after a newer window or research unauthorized contacts", async () => {
    const { sync, store, evidence, hubspot } = setup();
    await sync.start("HUBSPOT", "INITIAL", "window-first-0001");
    while (await sync.step("HUBSPOT")) {
      /* drain */
    }
    await sync.start("HUBSPOT", "INCREMENTAL", "window-second-0001");
    while (await sync.step("HUBSPOT")) {
      /* drain */
    }
    await expect(sync.start("HUBSPOT", "INITIAL", "window-first-0001")).rejects.toThrow(
      "IDEMPOTENCY_CONFLICT",
    );
    const saved = evidence.data.get("42")!;
    saved.contact.ownerId = "UNAUTHORIZED";
    const outreach = {
      check: vi.fn(async () => {}),
      collect: vi.fn(async () => ({ observations: [], blockers: [] })),
    };
    const importer = new IntegrationSync("actor", {
      store,
      evidence: evidence.store,
      hubspot,
      outreach,
      now: () => now,
      intakeSince: "2026-10-01T00:00:00Z",
    });
    const job = await importer.start("OUTREACH", "INITIAL", "outreach-authorized-0001");
    expect(job.pending).toEqual([]);
    while (await importer.step("OUTREACH")) {
      /* drain */
    }
    expect(outreach.collect).not.toHaveBeenCalled();
  });
  it("requires a fresh completed HubSpot sync before Outreach identity collection", async () => {
    const store = new MemoryStore(),
      evidence = evidenceStore();
    const outreach = {
      check: vi.fn(async () => {}),
      collect: vi.fn(async () => ({ observations: [], blockers: [] })),
    };
    const importer = new IntegrationSync("actor", {
      store,
      evidence: evidence.store,
      outreach,
      now: () => now,
      intakeSince: "2026-10-01T00:00:00Z",
    });
    await expect(importer.start("OUTREACH", "INITIAL", "without-hubspot-0001")).rejects.toThrow(
      "CONFIGURATION",
    );
    expect(outreach.collect).not.toHaveBeenCalled();
  });
  it("replays a crash after evidence persistence without importing or counting twice", async () => {
    const { sync, store, hubspot } = setup();
    await sync.start("HUBSPOT", "INITIAL", "crash-replay-0001");
    await sync.step("HUBSPOT");
    const change = store.change.bind(store);
    let crash = true;
    store.change = async (actor, provider, update) =>
      change(actor, provider, async (row) => {
        const result = await update(row);
        if (crash && result.row.state.job?.imported === 1) {
          crash = false;
          throw new Error("fixture checkpoint crash");
        }
        return result;
      });
    await sync.step("HUBSPOT");
    expect((await store.get("actor", "HUBSPOT")).state.job?.status).toBe("FAILED");
    await sync.resume("HUBSPOT");
    while (await sync.step("HUBSPOT")) {
      /* drain */
    }
    expect(hubspot.contact).toHaveBeenCalledTimes(1);
    expect((await store.get("actor", "HUBSPOT")).state.job).toMatchObject({
      status: "COMPLETED",
      imported: 1,
      updated: 0,
    });
  });
});
describe("latest outbound across sources", () => {
  it("uses the latest reliable date, rather than flagging different activity timestamps as conflicts", () => {
    const observations = ["OUTREACH", "HUBSPOT"].map((provider, index) => ({
      hubspotRecordId: "42",
      field: "lastOutboundAt" as const,
      value: index ? "2026-09-15T00:00:00Z" : "2026-01-01T00:00:00Z",
      provider: provider as "OUTREACH" | "HUBSPOT",
      sourceRecordId: `${provider}:email`,
      observedAt: now.toISOString(),
      verifiedAt: now.toISOString(),
      independent: false,
      supportingEvidence: ["fictional sent activity"],
    }));
    const normalized = normalizeCollectedEvidence(contact(), observations, now);
    expect(normalized.input.lastOutboundAt?.value).toBe("2026-09-15T00:00:00Z");
    expect(normalized.conflicts).not.toContain("Conflicting lastOutboundAt evidence");
    expect(qualifyProspect(normalized.input, now).status).not.toBe("READY");
  });
});

describe("live eligibility diagnostics gate", () => {
  it("requires both fresh successful connections and fully finished imports", async () => {
    const { integrationEligibilityBlockers } = await import("./eligibility");
    const store = new MemoryStore();
    expect(await integrationEligibilityBlockers("actor", now, store)).toHaveLength(2);
    for (const provider of ["HUBSPOT", "OUTREACH"] as const) {
      await store.change("actor", provider, async (row) => {
        row.state.status = "CONNECTED";
        row.state.checkedAt = now.toISOString();
        row.state.lastSuccessfulSync = now.toISOString();
        row.state.coverage = "VISIBLE_RECORDS_ONLY";
        row.state.job = {
          id: "job",
          requestKey: "request-0001",
          mode: "INITIAL",
          status: "COMPLETED",
          since: now.toISOString(),
          until: now.toISOString(),
          phase: "REFRESH",
          pending: [],
          refreshed: [],
          imported: 0,
          updated: 0,
          unchanged: 0,
          attempts: 0,
          startedAt: now.toISOString(),
        };
        return { row, value: undefined };
      });
    }
    expect(await integrationEligibilityBlockers("actor", now, store)).toEqual([]);
    await store.change("actor", "OUTREACH", async (row) => {
      row.state.status = "PERMISSION_MISSING";
      return { row, value: undefined };
    });
    expect((await integrationEligibilityBlockers("actor", now, store)).join()).toContain(
      "OUTREACH",
    );
    expect(
      await integrationEligibilityBlockers("actor", new Date("2026-10-18T00:00:00Z"), store),
    ).toHaveLength(2);
  });
  it("does not convert diagnostics persistence failures into eligibility", async () => {
    const { integrationEligibilityBlockers } = await import("./eligibility");
    const store = new MemoryStore();
    store.get = async () => {
      throw new Error("fixture storage failure");
    };
    expect((await integrationEligibilityBlockers("actor", now, store)).join()).toContain("UNKNOWN");
  });
});

describe("Outreach resource pagination", () => {
  it("follows the next page, deduplicates identical records and selects the latest sent date", async () => {
    const base = outreachFetch(),
      fetcher = vi.fn<typeof fetch>(async (input) => {
        const url = new URL(String(input));
        if (url.pathname !== "/api/v2/mailings") return base(input);
        const first = resource(
          "mailing",
          "9",
          { sentAt: "2026-01-01T00:00:00Z" },
          { prospect: relation("prospect", "7") },
        );
        return url.searchParams.get("page[offset]") === "100"
          ? json({
              data: [
                first,
                resource(
                  "mailing",
                  "10",
                  { sentAt: "2026-09-20T00:00:00Z" },
                  { prospect: relation("prospect", "7") },
                ),
              ],
              links: { next: null },
            })
          : json({
              data: [first],
              links: {
                next: "/api/v2/mailings?filter[prospect][id]=7&page[size]=100&page[offset]=100",
              },
            });
      });
    const result = await new OutreachConnector(
      async () => "fixture",
      { fetcher },
      () => now,
    ).collect(contact(), []);
    expect(result.observations.filter((item) => item.field === "lastOutboundAt")).toHaveLength(2);
    expect(
      normalizeCollectedEvidence(contact(), result.observations, now).input.lastOutboundAt?.value,
    ).toBe("2026-09-20T00:00:00.000Z");
  });
  it("does not return partial evidence when a later page is forbidden", async () => {
    const base = outreachFetch(),
      fetcher = vi.fn<typeof fetch>(async (input) => {
        const url = new URL(String(input));
        if (url.pathname !== "/api/v2/mailings") return base(input);
        return url.searchParams.has("page[offset]")
          ? json({}, 403)
          : json({
              data: [],
              links: { next: "/api/v2/mailings?filter[prospect][id]=7&page[offset]=100" },
            });
      });
    await expect(
      new OutreachConnector(async () => "fixture", { fetcher }).collect(contact(), []),
    ).rejects.toThrow("PERMISSION_MISSING");
  });
});

describe("bootstrap grant operator binding", () => {
  it("does not let another signed-in application user consume the configured rotating grant", () => {
    vi.stubEnv("INTEGRATION_OPERATOR_USER_ID", "gil-fixture-user");
    expect(() => new IntegrationSync("another-user")).toThrow("CONFIGURATION");
    expect(() => new IntegrationSync("gil-fixture-user")).not.toThrow();
  });
});
