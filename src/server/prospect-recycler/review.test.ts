// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { loadRecyclerReview } from "./review";
import { recyclerReviewDemo } from "./review-demo";
import { reviewCsv, reviewSections } from "../../features/prospect-recycler/review";
import { OutreachRecyclerReader } from "./outreach";
import { emptySnapshot } from "./shared";
import { type Reader, type Snapshot, type SupplementalEvidence, EMAIL_SCOPE } from "./types";
import { matchIdentities, toRecyclerInput } from "./pipeline";
import { reviewFetch } from "./review-live";
import { qualifiedFixture } from "@/test/recycler-qualified";

const now = "2026-10-25T09:00:00.000Z";
function snap(system: "HUBSPOT" | "OUTREACH", id: string, email = id + "@example.com") {
  return emptySnapshot(
    {
      record: { system, id },
      email,
      emails: [email],
      fullName: "Test Person",
      employerDomain: "example.com",
    },
    now,
  );
}
function reader(system: "HUBSPOT" | "OUTREACH", snapshots: Snapshot[]): Reader {
  return {
    system,
    discover: vi.fn(async (limit: number) => ({
      items: snapshots.slice(0, limit).map((s) => s.prospect),
      status: "COMPLETE" as const,
      pages: 1,
      issues: [],
    })),
    collect: vi.fn(async (id: string) =>
      structuredClone(snapshots.find((s) => s.prospect.record.id === id)!),
    ),
  };
}
function receipts(s: Snapshot): SupplementalEvidence {
  const input = toRecyclerInput(matchIdentities([s])[0], now);
  const proof = {
    record: s.prospect.record,
    email: s.prospect.email!,
    employerDomain: s.prospect.employerDomain!,
    providerId: "test-only",
    independent: true,
    checkedAt: now,
    expiresAt: "2026-10-26T09:00:00Z",
    evidenceId: "test-only",
  };
  return {
    history: input.history.map((h) => ({
      ...h,
      status: h.recordIds.length ? "COMPLETE" : "NOT_PRESENT",
      authoritative: true,
      from: "2020-01-01T00:00:00Z",
      allUsers: true,
      retentionComplete: true,
    })),
    suppressions: input.suppressions.map((p) => ({
      ...p,
      status: p.source === "LOCAL" || p.recordIds.length ? "COMPLETE" : "NOT_PRESENT",
      authoritative: true,
      unsubscribed: false,
      complained: false,
      hardBounced: false,
      doNotContact: false,
    })),
    sequences: input.sequences.map((p) => ({
      ...p,
      status: p.recordIds.length ? "COMPLETE" : "NOT_PRESENT",
      authoritative: true,
    })),
    emailVerification: { ...proof, status: "VALID", businessEmail: true },
    employmentVerification: { ...proof, status: "VERIFIED", current: true },
  };
}
async function mailingSnapshot(attributes: Record<string, unknown>, next?: string) {
  const read = vi.fn(async (path: string) => {
    if (path === "/api/v2/prospects/7")
      return {
        data: {
          type: "prospect",
          id: "7",
          attributes: {
            firstName: "Test",
            emails: ["test@example.com"],
            emailOptedOut: false,
            optedOut: false,
          },
        },
      };
    if (path.startsWith("/api/v2/sequenceStates")) return { data: [] };
    if (path.startsWith("/api/v2/mailings"))
      return {
        data: [
          {
            id: "m1",
            type: "mailing",
            attributes,
            relationships: { prospect: { data: { id: "7" } } },
          },
        ],
        links: { next: next ?? null },
      };
    throw new Error("Unexpected mock read");
  });
  return { snapshot: await new OutreachRecyclerReader({ read }, now, 1).collect("7"), read };
}
describe("Recycler review and documented Outreach semantics", () => {
  it("shows five fictional candidates with incomplete evidence, without network", async () => {
    const list = await recyclerReviewDemo();
    expect(list.rows).toHaveLength(5);
    expect(reviewSections(list).top50).toHaveLength(0);
    expect(reviewSections(list).needsVerification).toHaveLength(4);
    expect(reviewSections(list).excluded).toHaveLength(1);
    expect(list.rows.some((r) => r.providers.join() === "HUBSPOT")).toBe(true);
    expect(list.rows.some((r) => r.providers.join() === "OUTREACH")).toBe(true);
  });
  it("merges only explicit one-to-one matching identities and uses the latest event across providers", async () => {
    const h = snap("HUBSPOT", "h1", "same@example.com"),
      o = snap("OUTREACH", "o1", "same@example.com");
    h.prospect.mappedOutreachId = "o1";
    for (const [s, at] of [
      [h, "2026-04-01T09:00:00Z"],
      [o, "2026-05-01T09:00:00Z"],
    ] as const)
      s.communications.push({
        id: s.prospect.record.id,
        record: s.prospect.record,
        at,
        scopeId: EMAIL_SCOPE.id,
        channel: "EMAIL",
        direction: "OUTBOUND",
        outcome: "DELIVERED",
        relevance: "RELEVANT",
      });
    const list = await loadRecyclerReview({
      readers: { HUBSPOT: reader("HUBSPOT", [h]), OUTREACH: reader("OUTREACH", [o]) },
      asOf: now,
      mode: "DEMO",
    });
    expect(list.rows).toHaveLength(1);
    expect(list.rows[0].providers).toEqual(["HUBSPOT", "OUTREACH"]);
    expect(list.rows[0].decision.latestRelevantOutbound?.record.system).toBe("OUTREACH");
    expect(list.rows[0].decision.status).toBe("HOLD");
  });
  it("keeps conflicting explicit identities separate and held", async () => {
    const h = snap("HUBSPOT", "h1"),
      o = snap("OUTREACH", "o1");
    h.prospect.mappedOutreachId = "o1";
    const list = await loadRecyclerReview({
      readers: { HUBSPOT: reader("HUBSPOT", [h]), OUTREACH: reader("OUTREACH", [o]) },
      asOf: now,
      mode: "DEMO",
    });
    expect(list.rows).toHaveLength(2);
    expect(list.rows.every((r) => r.identity === "AMBIGUOUS" && r.decision.status === "HOLD")).toBe(
      true,
    );
  });
  it("caps provider records across discovery and additional mapped hydration", async () => {
    const hs = [1, 2, 3].map((n) => snap("HUBSPOT", "h" + n));
    hs[0].prospect.mappedOutreachId = "extra";
    const out = reader("OUTREACH", [
      snap("OUTREACH", "o1"),
      snap("OUTREACH", "o2"),
      snap("OUTREACH", "extra"),
    ]);
    const list = await loadRecyclerReview({
      readers: { HUBSPOT: reader("HUBSPOT", hs), OUTREACH: out },
      asOf: now,
      mode: "DEMO",
      limit: 5,
    });
    expect(list.rows).toHaveLength(5);
    expect(out.collect).not.toHaveBeenCalledWith("extra");
    expect(list.issues).toContainEqual({ code: "PROSPECT_LIMIT", resource: "OUTREACH" });
  });
  it.each(["HUBSPOT", "OUTREACH"] as const)(
    "supports %s-only discovery without implying the other system is absent",
    async (system) => {
      const list = await loadRecyclerReview({
        readers: { [system]: reader(system, [snap(system, "only")]) },
        source: system,
        asOf: now,
        mode: "DEMO",
      });
      expect(list.rows).toHaveLength(1);
      expect(list.rows[0].decision.status).toBe("HOLD");
      expect(list.rows[0].history.find((h) => h.system !== system)?.status).toBe("UNKNOWN");
    },
  );
  it("uses documented delivery without requiring or inventing sentAt", async () => {
    const { snapshot } = await mailingSnapshot({ deliveredAt: "2026-06-20T09:00:00Z" });
    expect(snapshot.communications).toEqual([
      expect.objectContaining({ outcome: "DELIVERED", at: "2026-06-20T09:00:00.000Z" }),
    ]);
    expect(snapshot.issues.some((i) => i.code === "EMAIL_EVENT_UNKNOWN")).toBe(false);
    expect(snapshot.historyTraversal).toBe("COMPLETE");
    expect(snapshot.history.status).toBe("PARTIAL");
    expect(snapshot.history.authoritative).toBe(false);
  });
  it("ignores undocumented sentAt, scheduling and creation as contact events", async () => {
    const { snapshot } = await mailingSnapshot({
      sentAt: "2026-06-20T09:00:00Z",
      createdAt: "2026-06-20T09:00:00Z",
      scheduledAt: "2026-06-20T09:00:00Z",
    });
    expect(snapshot.communications).toEqual([]);
    expect(snapshot.historyTraversal).toBe("PARTIAL");
    expect(snapshot.issues).toContainEqual({ code: "EMAIL_EVENT_UNKNOWN", resource: "mailings" });
  });
  it.each([null, "invalid", "2026-12-01T09:00:00Z"])(
    "does not manufacture a delivery event from %s",
    async (deliveredAt) => {
      expect((await mailingSnapshot({ deliveredAt })).snapshot.communications).toEqual([]);
    },
  );
  it("preserves partial pagination and does not clear null bounce/complaint indicators", async () => {
    const { snapshot, read } = await mailingSnapshot(
      { deliveredAt: "2026-06-20T09:00:00Z", bouncedAt: null, markedAsSpamAt: null },
      "/api/v2/mailings?filter[prospect][id]=7&page[size]=100&count=false&page[after]=mock",
    );
    expect(snapshot.historyTraversal).toBe("PARTIAL");
    expect(snapshot.suppression).toMatchObject({
      status: "PARTIAL",
      authoritative: false,
      complained: null,
      hardBounced: null,
    });
    expect(read).toHaveBeenCalledTimes(3);
  });
  it.each(["unsubscribedAt", "markedAsSpamAt"])(
    "preserves positive %s suppression",
    async (field) => {
      const { snapshot } = await mailingSnapshot({
        deliveredAt: null,
        [field]: "2026-05-20T09:00:00Z",
      });
      const list = await loadRecyclerReview({
        readers: { OUTREACH: reader("OUTREACH", [snapshot]) },
        source: "OUTREACH",
        asOf: now,
        mode: "DEMO",
      });
      expect(list.rows[0].decision.status).toBe("EXCLUDED");
    },
  );
  it("allows Top 50 only with complete trusted evidence and excludes a missing suppression check", async () => {
    const s = snap("OUTREACH", "verified");
    s.historyTraversal = "COMPLETE";
    const hub = snap("HUBSPOT", "owned", s.prospect.email);
    hub.prospect.mappedOutreachId = s.prospect.record.id;
    hub.historyTraversal = "COMPLETE";
    const id = toRecyclerInput(matchIdentities([hub, s])[0], now).candidateId;
    const proof = receipts(s);
    proof.qualification = qualifiedFixture(now).qualification;
    for (const receipt of Object.values(proof.qualification)) {
      receipt.hubspotId = hub.prospect.record.id;
      receipt.employerDomain = hub.prospect.employerDomain!;
    }
    for (const check of [...proof.history!, ...proof.sequences!]) {
      if (check.system === "HUBSPOT") {
        check.status = "COMPLETE";
        check.recordIds = [hub.prospect.record.id];
      }
    }
    for (const check of proof.suppressions!) {
      if (check.source === "HUBSPOT") {
        check.status = "COMPLETE";
        check.recordIds = [hub.prospect.record.id];
      }
      if (check.source === "LOCAL")
        check.recordIds.push(JSON.stringify(["HUBSPOT", hub.prospect.record.id]));
    }
    const options = {
      readers: { HUBSPOT: reader("HUBSPOT", [hub]), OUTREACH: reader("OUTREACH", [s]) },
      source: "BOTH" as const,
      asOf: now,
      mode: "DEMO" as const,
    };
    const complete = await loadRecyclerReview({ ...options, evidence: { [id]: proof } });
    expect(reviewSections(complete).top50).toHaveLength(1);
    proof.suppressions!.find((s) => s.source === "OUTREACH")!.complained = null;
    const partial = await loadRecyclerReview({ ...options, evidence: { [id]: proof } });
    expect(partial.rows[0].decision.status).toBe("HOLD");
    expect(reviewSections(partial).top50).toHaveLength(0);
  });
  it("exports statuses, gaps, delivery semantics, UTC timestamps and no false eligible rows", async () => {
    const list = await recyclerReviewDemo();
    const csv = reviewCsv(list, "REVIEW");
    expect(csv).toContain('"HOLD"');
    expect(csv).toContain('"DISQUALIFIED"');
    expect(csv).toContain('"DELIVERED"');
    expect(csv).toContain("2026-05-20T09:00:00.000Z");
    expect(csv).toContain("HISTORY_AUTHORITY_UNPROVEN");
    expect(reviewCsv(list, "TOP50").split("\r\n")).toHaveLength(2);
  });
  it.each(["=HYPERLINK(1)", " +SUM(1)", "\t@cmd", "-1+1", "\r=1"])(
    "neutralizes CSV formula prefix %j",
    async (name) => {
      const list = await recyclerReviewDemo();
      list.rows[0].name = name;
      expect(reviewCsv(list, "REVIEW")).toContain("\"'" + name);
    },
  );
  it("quotes commas, double quotes and line breaks", async () => {
    const list = await recyclerReviewDemo();
    list.rows[0].name = 'Last, "First"\nSecond';
    expect(reviewCsv(list, "REVIEW")).toContain('"Last, ""First""\nSecond"');
  });
  it("caps and deterministically orders the eligible view without mutating the review", async () => {
    const list = await recyclerReviewDemo();
    list.rows = Array.from({ length: 55 }, (_, i) => ({
      ...list.rows[0],
      id: String(i).padStart(2, "0"),
      decision: { ...list.rows[0].decision, status: "ELIGIBLE" as const },
    })).reverse();
    const before = list.rows.map((r) => r.id);
    expect(reviewSections(list).top50).toHaveLength(50);
    expect(reviewSections(list).top50[0].id).toBe("00");
    expect(list.rows.map((r) => r.id)).toEqual(before);
  });
});
describe("read-only review transport stop guard", () => {
  const url = "https://api.outreach.io/api/v2/prospects?page[size]=2&count=false";
  const init = { method: "GET", redirect: "error" as const };
  it.each([401, 403, 429, 500])("stops subsequent requests after HTTP %s", async (status) => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status }));
    const guard = reviewFetch(fetcher);
    await expect(guard(url, init)).rejects.toThrow();
    await expect(guard(url + "&page[after]=x", init)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    "https://evil.example/api/v2/prospects?count=false",
    "/api/v2/prospects?page[size]=2&count=true&page[after]=x",
    "/api/v2/prospects?page[size]=2&count=false&count=false&page[after]=x",
    "/api/v2/prospects?page[size]=2&count=false&page[extra]=x",
  ])("stops unsafe continuation %s", async (next) => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ data: [], links: { next } }));
    const guard = reviewFetch(fetcher);
    await expect(guard(url, init)).rejects.toThrow();
    await expect(guard(url + "&page[after]=x", init)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("enforces a shared request ceiling", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ data: [] }));
    const guard = reviewFetch(fetcher, 1);
    await guard(url, init);
    await expect(guard(url + "&page[after]=x", init)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
