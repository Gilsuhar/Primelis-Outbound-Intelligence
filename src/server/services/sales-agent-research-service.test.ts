import { describe, expect, it } from "vitest";
import { saveSalesAgentResearch } from "./sales-agent-research-service";
import { getSalesAgentDailyReview } from "./sales-agent-collection-service";
import {
  MemoryEvidenceStore,
  collectedContact,
  verifiedObservations,
  collectionNow,
} from "@/test/sales-agent-collection-fixtures";
import type { DraftResearch } from "@/features/sales-agent/draft-engine";
const entry: DraftResearch = {
  id: "42:COMPANY_FACT",
  contactId: "42",
  companyDomain: "example.com",
  kind: "COMPANY_FACT",
  text: "This fictional business sells outdoor equipment through its online store.",
  sourceUrl: "https://example.com/test-source",
  observedAt: "2026-10-15T08:00:00Z",
  verifiedAt: null,
  manuallyVerified: true,
  approvedForOutbound: false,
};
async function setup() {
  const store = new MemoryEvidenceStore();
  await store.save("actor-a", [
    {
      version: 1,
      contact: collectedContact,
      observations: verifiedObservations,
      provenanceAtCollection: [],
      blockers: [],
      providers: [],
      collectedAt: collectionNow.toISOString(),
    },
  ]);
  return { store, now: () => collectionNow };
}
describe("actor-scoped locally persisted human research", () => {
  it("saves, reloads and rechecks research without provider verification or CRM calls", async () => {
    const deps = await setup();
    expect((await saveSalesAgentResearch("actor-a", entry, deps)).ok).toBe(true);
    const result = await getSalesAgentDailyReview("actor-a", deps);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected review");
    expect(result.data.rows[0].drafting.findings[0].status).toBe("VERIFIED");
    expect(result.data.rows[0].drafting.findings[0].evidence[0].verifiedAt).toBe(
      collectionNow.toISOString(),
    );
    expect(result.data.rows[0].plan.decision.status).toBe("READY");
    expect(result.data.rows[0].drafting.emails[0].status).toBe("REQUIRES_RESEARCH");
    await saveSalesAgentResearch(
      "actor-a",
      { ...entry, text: "Updated fictional company fact for the same current contact." },
      deps,
    );
    expect((await deps.store.list("actor-a"))[0].research).toHaveLength(1);
  });
  it("does not leak existence or facts across users or contacts", async () => {
    const deps = await setup();
    expect(await saveSalesAgentResearch("actor-b", entry, deps)).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(
      await saveSalesAgentResearch("actor-a", { ...entry, contactId: "99" }, deps),
    ).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await deps.store.list("actor-b")).toEqual([]);
    expect((await deps.store.list("actor-a"))[0].research).toBeUndefined();
  });
  it("rejects forged qualification fields, fictional fixture writes and wrong company", async () => {
    const deps = await setup();
    for (const input of [
      { ...entry, unsubscribed: false },
      { ...entry, contactId: "test-fixture-qualified" },
      { ...entry, companyDomain: "other.example" },
    ])
      expect(await saveSalesAgentResearch("actor-a", input, deps)).toMatchObject({
        ok: false,
        code: "VALIDATION_ERROR",
      });
    expect(await saveSalesAgentResearch("", entry, deps)).toMatchObject({
      ok: false,
      code: "UNAUTHENTICATED",
    });
    expect((await deps.store.list("actor-a"))[0].research).toBeUndefined();
  });
  it("cannot turn missing eligibility into READY or grant approval", async () => {
    const deps = await setup();
    const [snapshot] = await deps.store.list("actor-a");
    snapshot.observations = snapshot.observations.filter((item) => item.provider !== "OUTREACH");
    await deps.store.save("actor-a", [snapshot]);
    await saveSalesAgentResearch("actor-a", entry, deps);
    const result = await getSalesAgentDailyReview("actor-a", deps);
    if (!result.ok) throw new Error("Expected review");
    expect(result.data.rows[0].plan.decision.status).toBe("HOLD");
    expect(result.data.rows[0].drafting).toMatchObject({
      status: "BLOCKED",
      approved: false,
      canSend: false,
      canEnroll: false,
    });
  });
  it("validates central proof approval on save and rechecks revocation on review", async () => {
    const deps = await setup();
    const proof = {
      ...entry,
      id: "42:CASE_STUDY",
      kind: "CASE_STUDY",
      caseStudyId: "approved-library-record",
      approvedForOutbound: true,
    };
    const allowed = { ...deps, verifyProof: async () => true };
    const revoked = { ...deps, verifyProof: async () => false };
    expect(await saveSalesAgentResearch("actor-a", proof, revoked)).toMatchObject({
      ok: false,
      code: "VALIDATION_ERROR",
    });
    expect((await saveSalesAgentResearch("actor-a", proof, allowed)).ok).toBe(true);
    const reviewed = await getSalesAgentDailyReview("actor-a", allowed);
    if (!reviewed.ok) throw new Error("Expected review");
    expect(reviewed.data.rows[0].drafting.emails[2].status).toBe("PENDING_HUMAN_REVIEW");
    const afterRevocation = await getSalesAgentDailyReview("actor-a", revoked);
    if (!afterRevocation.ok) throw new Error("Expected review");
    expect(afterRevocation.data.rows[0].drafting.emails[2].status).toBe("REQUIRES_RESEARCH");
    expect(afterRevocation.data.rows[0].drafting.emails[2].sources).toEqual([]);
  });
});
