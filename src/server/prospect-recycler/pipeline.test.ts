// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createRecyclerReaders } from "./connection";
import { nextOutreach } from "./shared";
import { collectRecycler, matchIdentities, toRecyclerInput } from "./pipeline";
import { EMAIL_SCOPE, type SupplementalEvidence } from "./types";
import { evaluateRecycler } from "../../features/prospect-recycler/eligibility";
import {
  recyclerInputSchema,
  type RecyclerInput,
} from "../../features/prospect-recycler/contracts";
import { OutreachTokens } from "../integrations/outreach";
import { encryptToken, type IntegrationStore } from "../integrations/store";
import { initialState } from "../integrations/contracts";

const now = "2026-10-25T10:00:00.000Z";
const hub = (id: string, properties: Record<string, string | null>) => ({ id, properties });
const related = (id: string, type = "prospect") => ({ data: { type, id } });
const prospect = (id = "7", address = "morgan@example.com") => ({
  id,
  type: "prospect",
  attributes: {
    firstName: "Morgan",
    lastName: "Tester",
    emails: [address],
    emailOptedOut: false,
    optedOut: false,
  },
  relationships: { account: related("20", "account") },
});
const mailing = (id = "70", prospectId = "7", attributes: Record<string, unknown> = {}) => ({
  id,
  type: "mailing",
  attributes: {
    sentAt: "2026-06-20T10:00:00Z",
    deliveredAt: "2026-06-20T10:01:00Z",
    ...attributes,
  },
  relationships: { prospect: related(prospectId) },
});
const sequence = (state: string) => ({
  id: "80",
  type: "sequenceState",
  attributes: { state },
  relationships: { prospect: related("7") },
});
const page = (data: unknown[], next?: string) => ({ data, links: { next: next ?? null } });
type Override = (url: URL, init?: RequestInit) => Response | undefined;
function setup(
  override?: Override,
  extra: { maxPages?: number; maxRequestsPerProvider?: number; mapping?: boolean } = {},
) {
  const contact = hub("1", {
    firstname: "Morgan",
    lastname: "Tester",
    email: "morgan@example.com",
    hubspot_owner_id: "42",
    createdate: "2000-01-01T00:00:00Z",
    hs_email_optout: "false",
    hs_email_hard_bounce_reason: null,
    hs_sequences_is_enrolled: "false",
    outreach_id: "7",
  });
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    const response = override?.(url, init);
    if (response) return response;
    const p = url.pathname;
    if (p === "/crm/v3/objects/contacts/search") return Response.json({ results: [contact] });
    if (p === "/crm/v3/objects/contacts/1") return Response.json(contact);
    if (p === "/crm/v4/objects/contacts/1/associations/companies")
      return Response.json({ results: [{ toObjectId: "10", associationTypes: [{ typeId: 1 }] }] });
    if (p === "/crm/v3/objects/companies/10")
      return Response.json(hub("10", { domain: "example.com" }));
    if (p === "/crm/v4/objects/contacts/1/associations/emails")
      return Response.json({ results: [{ toObjectId: "100" }] });
    if (p === "/crm/v3/objects/emails/100")
      return Response.json(
        hub("100", {
          hs_timestamp: "2026-06-01T10:00:00Z",
          hs_email_direction: "EMAIL",
          hs_email_status: "SENT",
          hs_email_to_email: "Morgan <morgan@example.com>",
        }),
      );
    if (p === "/api/v2/prospects") return Response.json(page([prospect()]));
    if (p === "/api/v2/prospects/7") return Response.json({ data: prospect() });
    if (p === "/api/v2/accounts/20")
      return Response.json({
        data: { id: "20", type: "account", attributes: { domain: "example.com" } },
      });
    if (p === "/api/v2/mailings") return Response.json(page([mailing()]));
    if (p === "/api/v2/sequenceStates") return Response.json(page([]));
    throw new Error("Unexpected mock endpoint");
  });
  const access = vi.fn(async (allowRefresh?: boolean) => {
    if (allowRefresh !== false) throw new Error("Refresh forbidden in Recycler tests");
    return "fictional-access";
  });
  const readers = createRecyclerReaders({
    asOf: now,
    hubspotOwnerId: "42",
    hubspotToken: async () => "fictional-hubspot",
    outreachTokens: { access },
    outreachIdProperty: extra.mapping === false ? undefined : "outreach_id",
    fetcher,
    maxPages: extra.maxPages,
    maxRequestsPerProvider: extra.maxRequestsPerProvider,
  });
  return { readers, fetcher, access };
}
function receipts(input: RecyclerInput): SupplementalEvidence {
  const record = input.identity.records[0];
  const proof = {
    record,
    email: input.identity.email!,
    employerDomain: input.identity.employerDomain!,
    providerId: "independent-fixture",
    independent: true,
    checkedAt: now,
    expiresAt: "2026-10-26T10:00:00Z",
    evidenceId: "verification-fixture",
  };
  return {
    history: input.history.map((h) => ({
      ...h,
      status: h.recordIds.length ? "COMPLETE" : "NOT_PRESENT",
      authoritative: true,
      from: "2020-01-01T00:00:00Z",
      allUsers: true,
      retentionComplete: true,
      evidenceId: `${h.system}-coverage-receipt`,
    })),
    suppressions: input.suppressions.map((s) => ({
      ...s,
      status: s.source === "LOCAL" || s.recordIds.length ? "COMPLETE" : "NOT_PRESENT",
      authoritative: true,
      unsubscribed: false,
      hardBounced: false,
      complained: false,
      doNotContact: false,
      evidenceId: `${s.source}-suppression-receipt`,
    })),
    sequences: input.sequences.map((s) => ({
      ...s,
      status: s.recordIds.length ? "COMPLETE" : "NOT_PRESENT",
      authoritative: true,
      states: [],
    })),
    emailVerification: { ...proof, status: "VALID", businessEmail: true },
    employmentVerification: { ...proof, status: "VERIFIED", current: true },
  };
}

describe("Recycler provider pipeline", () => {
  it("reads old owned contacts and independent Outreach prospects, maps explicit IDs, and produces valid Phase 1 contracts", async () => {
    const { readers, fetcher, access } = setup();
    const result = await collectRecycler({ readers, asOf: now });
    expect(result.candidates).toHaveLength(1);
    const input = result.candidates[0].input;
    expect(recyclerInputSchema.safeParse(input).success).toBe(true);
    expect(input.identity.records).toHaveLength(2);
    expect(input.communications).toHaveLength(2);
    expect(result.decisions[0]).toMatchObject({
      status: "HOLD",
      nextEligibleDate: "2026-10-20",
      latestRelevantOutbound: { id: "mailing:70:deliveredAt" },
    });
    expect(
      input.history.every(
        (h) => h.status === "PARTIAL" && !h.authoritative && !h.allUsers && !h.retentionComplete,
      ),
    ).toBe(true);
    expect(input.emailVerification).toBeUndefined();
    expect(input.employmentVerification).toBeUndefined();
    expect(access.mock.calls.every(([refresh]) => refresh === false)).toBe(true);
    for (const [url, init] of fetcher.mock.calls) {
      expect(new URL(String(url)).pathname).not.toContain("oauth");
      expect(init?.method).toBe(String(url).includes("contacts/search") ? "POST" : "GET");
      expect(init?.redirect).toBe("error");
    }
    const search = fetcher.mock.calls.find(([u]) => String(u).includes("contacts/search"))!;
    const body = JSON.parse(String(search[1]?.body));
    expect(body.filterGroups[0].filters).toEqual([
      { propertyName: "hubspot_owner_id", operator: "EQ", value: "42" },
    ]);
  });
  it("reads Outreach-only prospects when HubSpot is absent without claiming HubSpot absence", async () => {
    const { readers, fetcher } = setup();
    const result = await collectRecycler({ readers: { OUTREACH: readers.OUTREACH }, asOf: now });
    expect(result.candidates[0].input.identity.records).toEqual([{ system: "OUTREACH", id: "7" }]);
    expect(result.candidates[0].input.history.find((h) => h.system === "HUBSPOT")?.status).toBe(
      "UNKNOWN",
    );
    expect(result.decisions[0].status).toBe("HOLD");
    expect(
      fetcher.mock.calls.every(([url]) => new URL(String(url)).hostname === "api.outreach.io"),
    ).toBe(true);
  });
  it("continues Outreach discovery after a HubSpot permission failure", async () => {
    const { readers } = setup((url) =>
      url.hostname === "api.hubapi.com" ? Response.json({}, { status: 403 }) : undefined,
    );
    const result = await collectRecycler({ readers, asOf: now });
    expect(result.discovery.HUBSPOT).toMatchObject({
      status: "UNKNOWN",
      issues: [{ code: "PERMISSION_MISSING", resource: "pagination" }],
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.decisions[0].status).toBe("HOLD");
  });
  it("supports explicit prospect IDs without discovery or email-based search", async () => {
    const { readers, fetcher } = setup();
    const result = await collectRecycler({
      readers,
      asOf: now,
      ids: { HUBSPOT: [], OUTREACH: ["7"] },
    });
    expect(result.candidates).toHaveLength(1);
    expect(
      fetcher.mock.calls.some(([url]) => /contacts\/search|prospects\?/.test(String(url))),
    ).toBe(false);
  });
  it("hydrates an explicitly mapped Outreach prospect outside the discovery page", async () => {
    const { readers, fetcher } = setup((url) =>
      url.pathname === "/api/v2/prospects" ? Response.json(page([])) : undefined,
    );
    const result = await collectRecycler({ readers, asOf: now });
    expect(result.candidates[0].input.identity.records).toHaveLength(2);
    expect(
      fetcher.mock.calls.some(([url]) => new URL(String(url)).pathname === "/api/v2/prospects/7"),
    ).toBe(true);
  });
  it("keeps shared unverified emails separate without explicit ID mapping", async () => {
    const { readers } = setup(undefined, { mapping: false });
    const result = await collectRecycler({ readers, asOf: now });
    expect(result.candidates).toHaveLength(2);
    expect(
      result.candidates.every(
        (c) => c.input.identity.resolution === "AMBIGUOUS" && c.input.identity.records.length === 1,
      ),
    ).toBe(true);
    expect(result.decisions.every((d) => d.status === "HOLD")).toBe(true);
  });
  it.each(["name", "email", "employer"])(
    "does not merge an explicit mapping with conflicting %s",
    async (field) => {
      const { readers } = setup((url) => {
        if (url.pathname === "/api/v2/prospects/7" && field !== "employer") {
          const p = prospect();
          if (field === "name") p.attributes.firstName = "Different";
          else p.attributes.emails = ["other@example.com"];
          return Response.json({ data: p });
        }
        if (field === "employer" && url.pathname === "/api/v2/accounts/20")
          return Response.json({
            data: { id: "20", type: "account", attributes: { domain: "other.example" } },
          });
      });
      const result = await collectRecycler({ readers, asOf: now });
      expect(result.candidates).toHaveLength(2);
      expect(result.candidates.every((c) => c.input.identity.resolution === "AMBIGUOUS")).toBe(
        true,
      );
    },
  );
  it("rejects many-to-one mappings instead of choosing a winner", async () => {
    const { readers } = setup();
    const h = await readers.HUBSPOT.collect("1"),
      o = await readers.OUTREACH.collect("7");
    const second = structuredClone(h);
    second.prospect.record.id = "2";
    const groups = matchIdentities([h, second, o]);
    expect(groups).toHaveLength(3);
    expect(groups.every((g) => g.resolution === "AMBIGUOUS")).toBe(true);
  });
  it("does not select an arbitrary email from multiple Outreach addresses", async () => {
    const { readers } = setup((url) => {
      if (url.pathname === "/api/v2/prospects/7") {
        const p = prospect();
        p.attributes.emails.push("alias@example.com");
        return Response.json({ data: p });
      }
    });
    const snapshot = await readers.OUTREACH.collect("7");
    expect(snapshot.prospect.email).toBeUndefined();
    expect(snapshot.issues.some((i) => i.code === "EMAIL_IDENTITY_AMBIGUOUS")).toBe(true);
  });
  it("validates mismatched record IDs and preserves read failure as an unresolved candidate", async () => {
    const { readers } = setup((url) =>
      url.pathname === "/api/v2/prospects/7" ? Response.json({ data: prospect("999") }) : undefined,
    );
    const result = await collectRecycler({ readers: { OUTREACH: readers.OUTREACH }, asOf: now });
    expect(result.candidates[0].input.identity.resolution).toBe("UNRESOLVED");
    expect(result.decisions[0].status).toBe("HOLD");
  });
});

describe("history and pagination coverage", () => {
  it("collects both mailing pages but keeps authority partial", async () => {
    const { readers } = setup((url) => {
      if (url.pathname === "/api/v2/mailings")
        return Response.json(
          url.searchParams.has("page[offset]")
            ? page([mailing("71", "7", { deliveredAt: "2026-09-01T00:00:00Z" })])
            : page(
                [mailing()],
                "/api/v2/mailings?filter[prospect][id]=7&page[size]=100&page[offset]=100&count=false",
              ),
        );
    });
    const snapshot = await readers.OUTREACH.collect("7");
    expect(snapshot.historyTraversal).toBe("COMPLETE");
    expect(snapshot.history.status).toBe("PARTIAL");
    expect(snapshot.communications.some((c) => c.id === "mailing:71:deliveredAt")).toBe(true);
  });
  it.each([401, 403, 429, 500])(
    "preserves first-page facts when the next page returns HTTP %s",
    async (status) => {
      const { readers, fetcher } = setup((url) =>
        url.pathname === "/api/v2/mailings"
          ? url.searchParams.has("page[offset]")
            ? Response.json({ secret: "must-not-be-returned" }, { status })
            : Response.json(
                page(
                  [mailing()],
                  "/api/v2/mailings?filter[prospect][id]=7&page[size]=100&page[offset]=100&count=false",
                ),
              )
          : undefined,
      );
      const snapshot = await readers.OUTREACH.collect("7");
      expect(snapshot.historyTraversal).toBe("PARTIAL");
      expect(snapshot.communications).toHaveLength(1);
      expect(JSON.stringify(snapshot)).not.toContain("must-not-be-returned");
      expect(fetcher.mock.calls.filter(([url]) => String(url).includes("/mailings")).length).toBe(
        2,
      );
    },
  );
  it.each([
    "https://evil.example/api/v2/mailings?filter[prospect][id]=7&page[offset]=100&count=false",
    "/api/v2/mailings?filter[prospect][id]=8&page[offset]=100&count=false",
    "/api/v2/mailings?page[offset]=100&count=false",
    "/api/v2/prospects?page[offset]=100&count=false",
  ])("rejects unsafe pagination %s", async (next) => {
    const { readers, fetcher } = setup((url) =>
      url.pathname === "/api/v2/mailings" ? Response.json(page([mailing()], next)) : undefined,
    );
    const snapshot = await readers.OUTREACH.collect("7");
    expect(snapshot.historyTraversal).not.toBe("COMPLETE");
    expect(fetcher.mock.calls.some(([url]) => String(url).includes("evil.example"))).toBe(false);
  });
  it("caps pages without pretending completion", async () => {
    const { readers } = setup(
      (url) =>
        url.pathname === "/api/v2/mailings"
          ? Response.json(
              page(
                [mailing()],
                "/api/v2/mailings?filter[prospect][id]=7&page[size]=100&page[offset]=100&count=false",
              ),
            )
          : undefined,
      { maxPages: 1 },
    );
    const snapshot = await readers.OUTREACH.collect("7");
    expect(snapshot.historyTraversal).toBe("PARTIAL");
    expect(snapshot.communications).toHaveLength(1);
  });
  it("bounds discovery and returns a continuation marker", async () => {
    const { readers } = setup((url) =>
      url.pathname === "/api/v2/prospects"
        ? Response.json(
            page([prospect()], "/api/v2/prospects?page[size]=1&page[offset]=1&count=false"),
          )
        : undefined,
    );
    const found = await readers.OUTREACH.discover(1);
    expect(found.status).toBe("PARTIAL");
    expect(found.next).toContain("page[offset]=1");
  });
  it("does not accept mailings or sequences for a different prospect", async () => {
    const { readers } = setup((url) =>
      url.pathname === "/api/v2/mailings"
        ? Response.json(page([mailing("70", "999")]))
        : url.pathname === "/api/v2/sequenceStates"
          ? Response.json(
              page([{ ...sequence("finished"), relationships: { prospect: related("999") } }]),
            )
          : undefined,
    );
    const snapshot = await readers.OUTREACH.collect("7");
    expect(snapshot.communications).toEqual([]);
    expect(snapshot.historyTraversal).toBe("UNKNOWN");
    expect(snapshot.sequences.status).toBe("UNKNOWN");
  });
  it("does not treat missing result arrays as checked empty history", async () => {
    const { readers } = setup((url) =>
      url.pathname === "/api/v2/mailings" ? Response.json({}) : undefined,
    );
    expect((await readers.OUTREACH.collect("7")).historyTraversal).toBe("UNKNOWN");
  });
  it("holds email events with missing recipient identity or malformed timestamps", async () => {
    const { readers } = setup((url) =>
      url.pathname === "/crm/v3/objects/emails/100"
        ? Response.json(
            hub("100", {
              hs_timestamp: "2026-06-20T00:00:00Z",
              hs_email_direction: "EMAIL",
              hs_email_status: "SENT",
              hs_email_to_email: null,
            }),
          )
        : url.pathname === "/api/v2/mailings"
          ? Response.json(
              page([mailing("70", "7", { sentAt: "bad", deliveredAt: "2026-10-26T00:00:00Z" })]),
            )
          : undefined,
    );
    const h = await readers.HUBSPOT.collect("1"),
      o = await readers.OUTREACH.collect("7");
    expect(h.communications[0].relevance).toBe("UNKNOWN");
    expect(h.historyTraversal).toBe("PARTIAL");
    expect(o.communications).toHaveLength(0);
    expect(o.historyTraversal).toBe("PARTIAL");
  });
  it.each(["INCOMING_EMAIL", "FORWARDED_EMAIL"])(
    "does not count %s as outbound",
    async (direction) => {
      const { readers } = setup((url) =>
        url.pathname === "/crm/v3/objects/emails/100"
          ? Response.json(
              hub("100", {
                hs_timestamp: "2026-06-01T00:00:00Z",
                hs_email_direction: direction,
                hs_email_status: "SENT",
              }),
            )
          : undefined,
      );
      expect((await readers.HUBSPOT.collect("1")).communications).toEqual([]);
    },
  );
  it("records incomplete HubSpot email associations and preserves their visible email", async () => {
    const { readers } = setup((url) =>
      url.pathname.endsWith("/associations/emails")
        ? url.searchParams.has("after")
          ? Response.json({}, { status: 403 })
          : Response.json({ results: [{ toObjectId: "100" }], paging: { next: { after: "100" } } })
        : undefined,
    );
    const snapshot = await readers.HUBSPOT.collect("1");
    expect(snapshot.historyTraversal).toBe("PARTIAL");
    expect(snapshot.communications).toHaveLength(1);
  });
  it("enforces the request ceiling", async () => {
    const { readers, fetcher } = setup(undefined, { maxRequestsPerProvider: 1 });
    const snapshot = await readers.OUTREACH.collect("7");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(snapshot.historyTraversal).toBe("UNKNOWN");
  });
});

describe("suppression, sequence and trusted evidence mapping", () => {
  it.each([
    "active",
    "pending",
    "paused",
    "stalled",
    "failed",
    "disabled",
    "bounced",
    "unknown-new-state",
  ])("preserves %s sequences for HOLD", async (state) => {
    const { readers } = setup((url) =>
      url.pathname === "/api/v2/sequenceStates"
        ? Response.json(page([sequence(state)]))
        : undefined,
    );
    const result = await collectRecycler({ readers, asOf: now });
    expect(
      result.candidates[0].input.sequences.find((s) => s.system === "OUTREACH")?.states[0].state,
    ).toBe(state);
    expect(result.decisions[0].reasons.some((r) => r.code === "SEQUENCE_UNRESOLVED")).toBe(true);
  });
  it.each(["unsubscribe", "complaint", "hard-bounce", "sequence-optout"])(
    "excludes observed %s even with incomplete history",
    async (kind) => {
      const { readers } = setup((url) => {
        if (kind === "unsubscribe" && url.pathname === "/api/v2/prospects/7") {
          const p = prospect();
          p.attributes.emailOptedOut = true;
          return Response.json({ data: p });
        }
        if (kind === "complaint" && url.pathname === "/api/v2/mailings")
          return Response.json(
            page([mailing("70", "7", { markedAsSpamAt: "2026-08-01T00:00:00Z" })]),
          );
        if (kind === "hard-bounce" && url.pathname === "/crm/v3/objects/contacts/1")
          return Response.json(
            hub("1", {
              firstname: "Morgan",
              lastname: "Tester",
              email: "morgan@example.com",
              hubspot_owner_id: "42",
              outreach_id: "7",
              hs_email_hard_bounce_reason: "UNKNOWN_USER",
            }),
          );
        if (kind === "sequence-optout" && url.pathname === "/api/v2/sequenceStates")
          return Response.json(page([sequence("opted_out")]));
      });
      expect((await collectRecycler({ readers, asOf: now })).decisions[0].status).toBe("EXCLUDED");
    },
  );
  it("does not invent a hard-bounce classification or complaint clearance", async () => {
    const { readers } = setup((url) =>
      url.pathname === "/api/v2/mailings"
        ? Response.json(page([mailing("70", "7", { bouncedAt: "2026-08-01T00:00:00Z" })]))
        : undefined,
    );
    const snapshot = await readers.OUTREACH.collect("7");
    expect(snapshot.suppression.hardBounced).toBeNull();
    expect(snapshot.suppression.complained).toBeNull();
    expect(snapshot.issues.some((i) => i.code === "BOUNCE_CLASSIFICATION_UNKNOWN")).toBe(true);
  });
  it("does not promote API-only pagination to complete history", async () => {
    const { readers } = setup();
    const result = await collectRecycler({ readers, asOf: now });
    expect(result.discovery.OUTREACH?.status).toBe("COMPLETE");
    expect(result.decisions[0].status).toBe("HOLD");
    expect(result.decisions[0].reasons.some((r) => r.code === "EMAIL_VERIFICATION_MISSING")).toBe(
      true,
    );
  });
  it("can consume explicit trusted complete receipts, but still requires independent verification", async () => {
    const { readers } = setup();
    const result = await collectRecycler({ readers, asOf: now });
    const input = result.candidates[0].input;
    const proof = receipts(input);
    delete proof.emailVerification;
    const snapshots = [await readers.HUBSPOT.collect("1"), await readers.OUTREACH.collect("7")];
    const group = matchIdentities(snapshots)[0];
    const mapped = toRecyclerInput(group, now, proof);
    expect(mapped.history.every((h) => h.status === "COMPLETE")).toBe(true);
    expect(evaluateRecycler(mapped, now).status).toBe("HOLD");
    expect(evaluateRecycler(toRecyclerInput(group, now, receipts(input)), now).status).toBe(
      "ELIGIBLE",
    );
  });
  it("cannot upgrade partial reads using a complete-history receipt", async () => {
    const { readers } = setup((url) =>
      url.pathname === "/api/v2/mailings" ? Response.json({}, { status: 403 }) : undefined,
    );
    const snapshots = [await readers.HUBSPOT.collect("1"), await readers.OUTREACH.collect("7")];
    const group = matchIdentities(snapshots)[0],
      input = toRecyclerInput(group, now);
    const mapped = toRecyclerInput(group, now, receipts(input));
    expect(mapped.history.find((h) => h.system === "OUTREACH")?.status).toBe("UNKNOWN");
    expect(evaluateRecycler(mapped, now).status).toBe("HOLD");
  });
  it("does not erase a positive suppression with a negative trusted receipt", async () => {
    const { readers } = setup();
    const snapshots = [await readers.HUBSPOT.collect("1"), await readers.OUTREACH.collect("7")];
    snapshots[1].suppression.unsubscribed = true;
    const group = matchIdentities(snapshots)[0],
      input = toRecyclerInput(group, now);
    expect(evaluateRecycler(toRecyclerInput(group, now, receipts(input)), now).status).toBe(
      "EXCLUDED",
    );
  });
  it("fails closed on malformed supplemental evidence", async () => {
    const { readers } = setup();
    const initial = await collectRecycler({ readers, asOf: now });
    const evidence = receipts(initial.candidates[0].input);
    evidence.history![0].through = "bad";
    const result = await collectRecycler({
      readers,
      asOf: now,
      evidence: { [initial.candidates[0].input.candidateId]: evidence },
    });
    expect(result.decisions[0].status).toBe("HOLD");
    expect(
      result.candidates[0].issues.some((i) => i.code === "INVALID_SUPPLEMENTAL_EVIDENCE"),
    ).toBe(true);
  });
  it("rejects unsupported scopes by always producing the declared email-only scope", async () => {
    const { readers } = setup();
    const result = await collectRecycler({ readers, asOf: now });
    expect(result.candidates[0].input.scope).toEqual(EMAIL_SCOPE);
  });
});

describe("existing credential flow remains read-only", () => {
  it.each([false, true])("never refreshes or persists credentials (fresh=%s)", async (fresh) => {
    const key = Buffer.alloc(32, 7).toString("base64");
    const store: IntegrationStore = {
      get: vi.fn(async () => ({
        state: initialState("OUTREACH"),
        version: 1,
        secret: encryptToken(
          "actor",
          JSON.stringify({
            accessToken: "fictional-access",
            refreshToken: "fictional-refresh",
            expiresAt: fresh ? Date.now() + 600000 : 0,
          }),
          key,
        ),
      })),
      change: vi.fn(async () => {
        throw new Error("Writes forbidden");
      }),
      claim: vi.fn(async () => false),
      release: vi.fn(async () => undefined),
    };
    const refreshFetcher = vi.fn<typeof fetch>();
    const tokens = new OutreachTokens(
      "actor",
      store,
      {
        clientId: "fictional",
        clientSecret: "fictional",
        encryptionKey: key,
        redirectUri: "https://127.0.0.1/callback",
      },
      refreshFetcher,
    );
    const { fetcher } = setup();
    const readers = createRecyclerReaders({
      asOf: now,
      hubspotOwnerId: "42",
      hubspotToken: async () => "fictional",
      outreachTokens: tokens,
      fetcher,
    });
    if (fresh) expect((await readers.OUTREACH.collect("7")).prospect.record.id).toBe("7");
    else {
      await expect(readers.OUTREACH.collect("7")).rejects.toMatchObject({ code: "DISCONNECTED" });
      expect(fetcher).not.toHaveBeenCalled();
    }
    expect(refreshFetcher).not.toHaveBeenCalled();
    expect(store.change).not.toHaveBeenCalled();
    expect(store.claim).not.toHaveBeenCalled();
    expect(store.release).not.toHaveBeenCalled();
  });
  it("does not fetch when readers are merely constructed", () => {
    const { fetcher, access } = setup();
    expect(fetcher).not.toHaveBeenCalled();
    expect(access).not.toHaveBeenCalled();
  });
});

describe("Recycler authority regressions", () => {
  it("keeps observed suppression provenance when a contradictory receipt arrives", async () => {
    const { readers } = setup();
    const snapshots = [await readers.HUBSPOT.collect("1"), await readers.OUTREACH.collect("7")];
    snapshots[1].suppression.unsubscribed = true;
    const group = matchIdentities(snapshots)[0];
    const mapped = toRecyclerInput(group, now, receipts(toRecyclerInput(group, now)));
    expect(
      mapped.suppressions.some((s) => s.evidenceId === "OUTREACH:7:suppression" && s.unsubscribed),
    ).toBe(true);
    expect(
      mapped.suppressions.some(
        (s) => s.evidenceId === "OUTREACH-suppression-receipt" && s.unsubscribed === false,
      ),
    ).toBe(true);
  });
  it("does not upgrade missing mailing timestamp fields with a coverage receipt", async () => {
    const { readers } = setup((url) =>
      url.pathname === "/api/v2/mailings"
        ? Response.json(page([{ ...mailing(), attributes: {} }]))
        : undefined,
    );
    const snapshot = await readers.OUTREACH.collect("7");
    expect(snapshot.historyTraversal).toBe("PARTIAL");
    const group = matchIdentities([snapshot])[0];
    const input = toRecyclerInput(group, now, receipts(toRecyclerInput(group, now)));
    expect(input.history.find((h) => h.system === "OUTREACH")?.status).toBe("PARTIAL");
    expect(evaluateRecycler(input, now).status).toBe("HOLD");
  });
  it("does not infer HubSpot sequence clearance from a false contact flag", async () => {
    const { readers } = setup();
    const snapshot = await readers.HUBSPOT.collect("1");
    expect(snapshot.sequences.status).toBe("UNKNOWN");
    expect(snapshot.sequences.authoritative).toBe(false);
  });
  it("treats a future complaint timestamp as unknown evidence", async () => {
    const { readers } = setup((url) =>
      url.pathname === "/api/v2/mailings"
        ? Response.json(page([mailing("70", "7", { markedAsSpamAt: "2027-01-01T00:00:00Z" })]))
        : undefined,
    );
    expect((await readers.OUTREACH.collect("7")).suppression.complained).toBeNull();
  });
});

describe("Recycler conflicting coverage receipts", () => {
  it("does not select a complete receipt while ignoring contradictory partial coverage", async () => {
    const { readers } = setup();
    const group = matchIdentities([
      await readers.HUBSPOT.collect("1"),
      await readers.OUTREACH.collect("7"),
    ])[0];
    const evidence = receipts(toRecyclerInput(group, now));
    evidence.history!.push({
      ...evidence.history!.find((h) => h.system === "OUTREACH")!,
      status: "PARTIAL",
    });
    const input = toRecyclerInput(group, now, evidence);
    expect(input.history.find((h) => h.system === "OUTREACH")?.status).toBe("PARTIAL");
    expect(evaluateRecycler(input, now).status).toBe("HOLD");
  });
  it("keeps valid first-page events when an unsafe continuation is rejected", async () => {
    const { readers, fetcher } = setup((url) =>
      url.pathname === "/api/v2/mailings"
        ? Response.json(page([mailing()], "https://evil.example/next"))
        : undefined,
    );
    const snapshot = await readers.OUTREACH.collect("7");
    expect(snapshot.historyTraversal).toBe("PARTIAL");
    expect(snapshot.communications).toHaveLength(1);
    expect(fetcher.mock.calls.some(([url]) => String(url).startsWith("https://evil.example"))).toBe(
      false,
    );
  });
});

describe("Recycler explicit count and cursor pagination", () => {
  it("sends count=false exactly once on all three collection requests, not detail reads", async () => {
    const { readers, fetcher } = setup();
    await collectRecycler({ readers, asOf: now });
    const collectionPaths = ["/api/v2/prospects", "/api/v2/mailings", "/api/v2/sequenceStates"];
    const urls = fetcher.mock.calls.map(([url]) => new URL(String(url)));
    for (const path of collectionPaths) {
      const requests = urls.filter((url) => url.pathname === path);
      expect(requests.length).toBeGreaterThan(0);
      for (const url of requests) expect(url.searchParams.getAll("count")).toEqual(["false"]);
    }
    for (const url of urls.filter((url) => !collectionPaths.includes(url.pathname)))
      expect(url.searchParams.has("count")).toBe(false);
  });

  it("reproduces the added-count rejection and accepts an explicitly matching request", () => {
    const first = "/api/v2/prospects?page[size]=2";
    const next =
      "https://api.outreach.io/api/v2/prospects?count=false&page%5Bafter%5D=fictional-cursor&page%5Bsize%5D=2";
    expect(() => nextOutreach(first, next)).toThrow("INVALID_RESPONSE");
    expect(() => nextOutreach(first + "&count=false", next)).not.toThrow();
  });

  it.each(["absolute", "path-relative", "query-relative"] as const)(
    "reads %s encoded cursor links without changing the selected collection",
    async (form) => {
      const query = "?count=false&page%5Bafter%5D=fictional-cursor&page%5Bsize%5D=2";
      const next =
        form === "absolute"
          ? "https://api.outreach.io/api/v2/prospects" + query
          : form === "path-relative"
            ? "/api/v2/prospects" + query
            : query;
      const { readers, fetcher } = setup((url) =>
        url.pathname === "/api/v2/prospects"
          ? Response.json(
              url.searchParams.has("page[after]")
                ? page([prospect("8", "second@example.com")])
                : page([prospect()], next),
            )
          : undefined,
      );
      const result = await readers.OUTREACH.discover(2);
      expect(result.status).toBe("COMPLETE");
      expect(result.items.map((p) => p.record.id)).toEqual(["7", "8"]);
      expect(result.issues).toEqual([]);
      expect(fetcher).toHaveBeenCalledTimes(2);
      for (const [target, init] of fetcher.mock.calls) {
        const url = new URL(String(target));
        expect(url.origin).toBe("https://api.outreach.io");
        expect(url.pathname).toBe("/api/v2/prospects");
        expect(url.searchParams.getAll("count")).toEqual(["false"]);
        expect(init?.redirect).toBe("error");
      }
    },
  );

  it.each(["mailings", "sequenceStates"] as const)(
    "reads %s cursor pages with encoded identity filters without granting historical authority",
    async (resource) => {
      const path = "/api/v2/" + resource;
      const next =
        "https://api.outreach.io" +
        path +
        "?count=false&filter%5Bprospect%5D%5Bid%5D=7&page%5Bafter%5D=fictional-cursor&page%5Bsize%5D=100";
      const { readers, fetcher } = setup((url) => {
        if (url.pathname !== path) return undefined;
        const second = url.searchParams.has("page[after]");
        const item =
          resource === "mailings"
            ? mailing(second ? "71" : "70")
            : { ...sequence(second ? "stalled" : "finished"), id: second ? "81" : "80" };
        return Response.json(page([item], second ? undefined : next));
      });
      const snapshot = await readers.OUTREACH.collect("7");
      const requests = fetcher.mock.calls
        .map(([url]) => new URL(String(url)))
        .filter((url) => url.pathname === path);
      expect(requests).toHaveLength(2);
      for (const url of requests) {
        expect(url.searchParams.getAll("count")).toEqual(["false"]);
        expect(url.searchParams.getAll("filter[prospect][id]")).toEqual(["7"]);
      }
      if (resource === "mailings") {
        expect(snapshot.historyTraversal).toBe("COMPLETE");
        expect(snapshot.communications).toHaveLength(2);
      } else {
        expect(snapshot.sequences.states.map((state) => state.state)).toEqual([
          "finished",
          "stalled",
        ]);
      }
      expect(snapshot.history.status).toBe("PARTIAL");
      expect(snapshot.history.authoritative).toBe(false);
      expect(snapshot.sequences.authoritative).toBe(false);
      const input = toRecyclerInput(matchIdentities([snapshot])[0], now);
      expect(input.emailVerification).toBeUndefined();
      expect(evaluateRecycler(input, now).status).toBe("HOLD");
    },
  );

  const invalidLinks: [string, (url: URL) => void][] = [
    ["changed count", (url) => url.searchParams.set("count", "true")],
    ["missing count", (url) => url.searchParams.delete("count")],
    ["empty count", (url) => url.searchParams.set("count", "")],
    ["nonboolean count", (url) => url.searchParams.set("count", "0")],
    ["case-changed count", (url) => url.searchParams.set("count", "FALSE")],
    ["duplicate count", (url) => url.searchParams.append("count", "false")],
    ["conflicting duplicate count", (url) => url.searchParams.append("count", "true")],
    ["unrelated parameter", (url) => url.searchParams.set("sort", "id")],
    [
      "foreign origin",
      (url) => {
        url.hostname = "evil.example";
      },
    ],
    [
      "scheme downgrade",
      (url) => {
        url.protocol = "http:";
      },
    ],
    [
      "changed port",
      (url) => {
        url.port = "444";
      },
    ],
    [
      "embedded username",
      (url) => {
        url.username = "fictional";
      },
    ],
    [
      "embedded password",
      (url) => {
        url.password = "fictional";
      },
    ],
    [
      "fragment",
      (url) => {
        url.hash = "fictional";
      },
    ],
    [
      "changed resource",
      (url) => {
        url.pathname = "/api/v2/prospects";
      },
    ],
    [
      "trailing slash",
      (url) => {
        url.pathname += "/";
      },
    ],
    [
      "encoded path separator",
      (url) => {
        url.pathname = "/api/v2%2Fmailings";
      },
    ],
    ["changed identity filter", (url) => url.searchParams.set("filter[prospect][id]", "8")],
    ["missing identity filter", (url) => url.searchParams.delete("filter[prospect][id]")],
    ["duplicate identity filter", (url) => url.searchParams.append("filter[prospect][id]", "7")],
    ["additional identity filter", (url) => url.searchParams.set("filter[account][id]", "20")],
    ["nonincreasing offset", (url) => url.searchParams.set("page[offset]", "0")],
    ["negative offset", (url) => url.searchParams.set("page[offset]", "-1")],
    ["fractional offset", (url) => url.searchParams.set("page[offset]", "1.5")],
    ["unsafe integer offset", (url) => url.searchParams.set("page[offset]", "9007199254740992")],
  ];
  it.each(invalidLinks)(
    "rejects %s without following it or dropping valid first-page evidence",
    async (_name, mutate) => {
      const next = new URL(
        "https://api.outreach.io/api/v2/mailings?count=false&filter[prospect][id]=7&page[size]=100&page[after]=fictional-cursor",
      );
      mutate(next);
      const { readers, fetcher } = setup((url) =>
        url.pathname === "/api/v2/mailings"
          ? Response.json(page([mailing()], next.href))
          : undefined,
      );
      const snapshot = await readers.OUTREACH.collect("7");
      expect(snapshot.historyTraversal).toBe("PARTIAL");
      expect(snapshot.history.status).toBe("PARTIAL");
      expect(snapshot.communications).toHaveLength(1);
      expect(snapshot.issues).toContainEqual({ code: "INVALID_RESPONSE", resource: "pagination" });
      // Exactly the prospect, account, first mailing page and first sequence page are read.
      expect(fetcher.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
        "/api/v2/prospects/7",
        "/api/v2/accounts/20",
        "/api/v2/mailings",
        "/api/v2/sequenceStates",
      ]);
      expect(
        fetcher.mock.calls.every(
          ([url]) => new URL(String(url)).origin === "https://api.outreach.io",
        ),
      ).toBe(true);
    },
  );

  it("stops a repeated cursor and retains partial history within the existing request bounds", async () => {
    const next =
      "/api/v2/mailings?count=false&filter[prospect][id]=7&page[size]=100&page[after]=fictional-cursor";
    const { readers, fetcher } = setup((url) =>
      url.pathname === "/api/v2/mailings"
        ? Response.json(page([mailing(url.searchParams.has("page[after]") ? "71" : "70")], next))
        : undefined,
    );
    const snapshot = await readers.OUTREACH.collect("7");
    expect(snapshot.historyTraversal).toBe("PARTIAL");
    expect(snapshot.communications).toHaveLength(2);
    expect(snapshot.issues).toContainEqual({ code: "PAGINATION_LOOP", resource: "pagination" });
    expect(
      fetcher.mock.calls.filter(([url]) => new URL(String(url)).pathname === "/api/v2/mailings"),
    ).toHaveLength(2);
  });
});
