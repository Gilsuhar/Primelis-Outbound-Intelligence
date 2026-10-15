import { describe, expect, it, vi } from "vitest";
import {
  collectSalesAgentEvidence,
  getSalesAgentDailyReview,
} from "./sales-agent-collection-service";
import {
  collectedContact,
  collectionNow,
  fixtureProviders,
  MemoryEvidenceStore,
  observation,
  verifiedObservations,
} from "@/test/sales-agent-collection-fixtures";
import type { ContactIntakeAdapter } from "@/server/sales-agent/providers";

const intake = (contacts = [collectedContact]): ContactIntakeAdapter => ({
  listOwnedContacts: async () => ({
    contacts: structuredClone(contacts),
    complete: true,
    warnings: [],
  }),
});
const dependencies = () => ({
  intake: intake(),
  providers: fixtureProviders(),
  store: new MemoryEvidenceStore(),
  now: () => collectionNow,
});

describe("evidence collection and daily review integration", () => {
  it("collects, stores full provenance, and re-evaluates the real workflow", async () => {
    const deps = dependencies();
    const result = await collectSalesAgentEvidence("sales-user", undefined, deps);
    expect(result.ok && result.data.collected).toBe(1);
    const snapshots = await deps.store.list("sales-user");
    expect(snapshots[0].provenanceAtCollection[0]).toMatchObject({
      provider: "ZOOMINFO",
      freshness: "FRESH",
      accepted: true,
    });
    const review = await getSalesAgentDailyReview("sales-user", deps);
    expect(review.ok && review.data.counts).toEqual({ READY: 1, HOLD: 0, REJECTED: 0 });
    if (!review.ok) return;
    expect(review.data.rows[0].plan.canSend).toBe(false);
    expect(review.data.rows[0].humanApproval.granted).toBe(false);
    expect(review.data.rows[0].plan.tasks.map((task) => task.stage)).toEqual([
      "ACCOUNT_RESEARCH",
      "SERP_EVIDENCE",
      "SEQUENCE_DRAFT",
      "HUMAN_REVIEW",
    ]);
  });
  it("deduplicates repeated HubSpot IDs and repeat collections", async () => {
    const deps = { ...dependencies(), intake: intake([collectedContact, collectedContact]) };
    await collectSalesAgentEvidence("sales-user", undefined, deps);
    await collectSalesAgentEvidence("sales-user", undefined, deps);
    expect(await deps.store.list("sales-user")).toHaveLength(1);
  });
  it("excludes any duplicate record with a conflicting owner", async () => {
    const deps = {
      ...dependencies(),
      intake: intake([collectedContact, { ...collectedContact, ownerId: "other" }]),
    };
    const result = await collectSalesAgentEvidence("sales-user", undefined, deps);
    expect(result.ok && result.data.collected).toBe(0);
  });
  it("holds conflicting duplicate contact identities", async () => {
    const deps = {
      ...dependencies(),
      intake: intake([collectedContact, { ...collectedContact, email: "other@example.com" }]),
    };
    const result = await collectSalesAgentEvidence("sales-user", undefined, deps);
    expect(result.ok && result.data.rows[0].plan.decision.status).toBe("HOLD");
  });
  it("uses observed HubSpot facts without certifying them; missing Outreach becomes a task", async () => {
    const result = await collectSalesAgentEvidence("sales-user", undefined, {
      ...dependencies(),
      providers: [],
    });
    expect(result.ok && result.data.rows[0].plan.decision.status).toBe("HOLD");
    if (!result.ok) return;
    expect(result.data.rows[0].plan.decision.reasons).toContain("Outreach history incomplete");
    expect(
      result.data.rows[0].plan.tasks.some(
        (task) => task.action === "Connect or verify full Outreach history",
      ),
    ).toBe(true);
    expect(result.data.rows[0].plan.tasks.every((task) => task.stage === "QUALIFICATION")).toBe(
      true,
    );
  });
  it("retains conservative suppression blocks from the existing suppression infrastructure", async () => {
    const deps = dependencies();
    vi.spyOn(deps.store, "suppressionRecords").mockResolvedValue([
      {
        id: "dnc-42",
        companyName: "Fixture Company",
        domain: "example.com",
        status: "DO_NOT_CONTACT",
        reason: "Existing account restriction",
      },
    ]);
    const result = await collectSalesAgentEvidence("sales-user", undefined, deps);
    expect(result.ok && result.data.rows[0].plan.decision.status).toBe("HOLD");
    if (!result.ok) return;
    expect(
      result.data.rows[0].provenance.some(
        (item) => item.provider === "LOCAL_SUPPRESSION" && item.sourceRecordId === "dnc-42",
      ),
    ).toBe(true);
    expect(result.data.rows[0].plan.decision.reasons.join(" ")).toContain("DO_NOT_CONTACT");
  });
  it("rejects positive unsubscribe evidence and creates no outbound tasks", async () => {
    const deps = {
      ...dependencies(),
      providers: fixtureProviders([
        ...verifiedObservations,
        observation("unsubscribed", true, "OUTREACH"),
      ]),
    };
    const result = await collectSalesAgentEvidence("sales-user", undefined, deps);
    expect(result.ok && result.data.rows[0].plan.decision.status).toBe("REJECTED");
    expect(result.ok && result.data.rows[0].plan.tasks).toEqual([]);
  });
  it("re-evaluates freshness without changing original verification/observation timestamps", async () => {
    const deps = dependencies();
    await collectSalesAgentEvidence("sales-user", undefined, deps);
    const review = await getSalesAgentDailyReview("sales-user", {
      ...deps,
      now: () => new Date("2026-11-16T12:00:00Z"),
    });
    expect(review.ok && review.data.counts.HOLD).toBe(1);
    if (!review.ok) return;
    expect(review.data.rows[0].provenance[0].freshness).toBe("STALE");
    expect(review.data.rows[0].provenance[0].verifiedAt).toBe("2026-10-15T08:00:00.000Z");
  });
  it("isolates saved reviews by authenticated application actor", async () => {
    const deps = dependencies();
    await collectSalesAgentEvidence("sales-user", undefined, deps);
    const result = await getSalesAgentDailyReview("different-user", deps);
    expect(result.ok && result.data.rows).toEqual([]);
  });
  it("fails closed on adapter errors and preserves completed evidence", async () => {
    const deps = dependencies();
    deps.providers.push({
      provider: "SIMILARWEB",
      collect: async () => {
        throw new Error("private provider failure");
      },
    });
    const result = await collectSalesAgentEvidence("sales-user", undefined, deps);
    expect(result.ok && result.data.rows[0].plan.decision.status).toBe("HOLD");
    expect(JSON.stringify(result)).not.toContain("private provider failure");
  });
  it("prevents provider identity spoofing", async () => {
    const deps = dependencies();
    deps.providers.push({
      provider: "BORING",
      collect: async () => ({
        observations: [observation("emailVerification", {}, "ZOOMINFO")],
        blockers: [],
      }),
    });
    const result = await collectSalesAgentEvidence("sales-user", undefined, deps);
    expect(result.ok && result.data.rows[0].plan.decision.status).toBe("HOLD");
    expect(
      result.ok &&
        result.data.rows[0].providers.some(
          (item) => item.provider === "BORING" && item.status === "ERROR",
        ),
    ).toBe(true);
  });
  it("fails before external reads if suppression/persistence is unavailable", async () => {
    const deps = dependencies();
    const list = vi.spyOn(deps.intake, "listOwnedContacts");
    vi.spyOn(deps.store, "suppressionRecords").mockRejectedValue(new Error("DB secret"));
    expect(await collectSalesAgentEvidence("sales-user", undefined, deps)).toMatchObject({
      ok: false,
      code: "COLLECTION_FAILED",
    });
    expect(list).not.toHaveBeenCalled();
  });
  it("never reports collection success when persistence fails", async () => {
    const deps = dependencies();
    vi.spyOn(deps.store, "save").mockRejectedValue(new Error("DB secret"));
    expect(await collectSalesAgentEvidence("sales-user", undefined, deps)).toMatchObject({
      ok: false,
      code: "COLLECTION_FAILED",
    });
  });
  it("requires an actor for service operations", async () => {
    expect(await collectSalesAgentEvidence("", undefined, dependencies())).toMatchObject({
      ok: false,
      code: "UNAUTHENTICATED",
    });
    expect(await getSalesAgentDailyReview("", dependencies())).toMatchObject({
      ok: false,
      code: "UNAUTHENTICATED",
    });
  });
});

describe("daily review safety refresh", () => {
  it("rechecks current local suppression when reviewing saved evidence", async () => {
    const deps = dependencies();
    await collectSalesAgentEvidence("sales-user", undefined, deps);
    vi.spyOn(deps.store, "suppressionRecords").mockResolvedValue([
      {
        id: "new-dnc",
        companyName: "Fixture Company",
        domain: "example.com",
        status: "EXISTING_CUSTOMER",
      },
    ]);
    const review = await getSalesAgentDailyReview("sales-user", deps);
    expect(review.ok && review.data.counts.HOLD).toBe(1);
    expect(review.ok && review.data.rows[0].plan.decision.reasons.join(" ")).toContain(
      "EXISTING_CUSTOMER",
    );
  });
  it("does not ignore invalid positive safety evidence in favor of a negative", async () => {
    const deps = {
      ...dependencies(),
      providers: fixtureProviders([
        ...verifiedObservations,
        observation("unsubscribed", true, "OUTREACH", { verifiedAt: "2027-01-01T00:00:00Z" }),
      ]),
    };
    const result = await collectSalesAgentEvidence("sales-user", undefined, deps);
    expect(result.ok && result.data.rows[0].plan.decision.status).toBe("HOLD");
  });
});

describe("collection completion clock", () => {
  it("evaluates evidence at completion, not before the network responses were observed", async () => {
    const finished = new Date("2026-10-15T12:00:10.000Z");
    const deps = dependencies();
    const contact = { ...collectedContact, observedAt: "2026-10-15T12:00:05.000Z" };
    let clockCalls = 0;
    const result = await collectSalesAgentEvidence("sales-user", undefined, {
      ...deps,
      intake: intake([contact]),
      now: () => (clockCalls++ === 0 ? collectionNow : finished),
    });
    expect(result.ok && result.data.rows[0].plan.decision.status).toBe("READY");
    expect(result.ok && result.data.rows[0].collectedAt).toBe(finished.toISOString());
  });
});

describe("unreadable saved source isolation", () => {
  it("reports malformed snapshots while retaining valid daily review rows", async () => {
    const deps = dependencies();
    await collectSalesAgentEvidence("sales-user", undefined, deps);
    const valid = await deps.store.list("sales-user");
    const review = await getSalesAgentDailyReview("sales-user", {
      ...deps,
      store: {
        save: deps.store.save.bind(deps.store),
        suppressionRecords: deps.store.suppressionRecords.bind(deps.store),
        list: async () => [...valid, null],
      },
    });
    expect(review.ok && review.data.rows).toHaveLength(1);
    expect(review.ok && review.data.warnings).toEqual([
      "1 saved snapshots could not be read; recollect evidence",
    ]);
  });
});
