import { describe, expect, it } from "vitest";
import {
  getWorkforceDashboard,
  markProspectReviewed,
  summarizeRun,
  protectRunDrafts,
} from "./service";
import { collectSalesAgentEvidence } from "@/server/services/sales-agent-collection-service";
import {
  MemoryEvidenceStore,
  collectedContact,
  collectionNow,
  fixtureProviders,
} from "@/test/sales-agent-collection-fixtures";
import {
  MemoryWorkforceStore,
  testKnowledge,
  testNow,
  workforceIntake,
  MockWorkforceModel,
  testReader,
} from "@/test/workforce-fixtures";
import { initialRun } from "../store";
import { WorkforceOrchestrator } from "../orchestrator";
async function setup() {
  const evidence = new MemoryEvidenceStore();
  const runs = new MemoryWorkforceStore();
  await collectSalesAgentEvidence("actor", undefined, {
    store: evidence,
    providers: fixtureProviders(),
    intake: {
      listOwnedContacts: async () => ({
        contacts: [collectedContact],
        complete: true,
        warnings: [],
      }),
    },
    now: () => collectionNow,
  });
  return { evidence, runs, now: () => collectionNow, configured: { hubspot: true, openai: true } };
}
describe("persistent daily intelligence projections", () => {
  it("unlocks only a bound, currently eligible, quality-reviewed draft with still-approved knowledge", async () => {
    const deps = await setup();
    const intake = {
      ...workforceIntake,
      hubspotRecordId: "42",
      companyName: collectedContact.companyName!,
      companyDomain: collectedContact.companyDomain!,
      prospectName: collectedContact.fullName,
    };
    const engine = new WorkforceOrchestrator({
      store: deps.runs,
      model: new MockWorkforceModel(),
      knowledge: async () => testKnowledge,
      reader: testReader(intake),
      eligibility: async () => ({ status: "READY", reasons: [], blockDrafting: false }),
      now: deps.now,
    });
    let run = await engine.start("actor", { idempotencyKey: "draft-ready-test-0001", intake });
    for (let i = 0; i < 12 && run.status === "RUNNING"; i++)
      run = await engine.advance("actor", run.id);
    expect(run.status).toBe("READY_FOR_REVIEW");
    const data = await getWorkforceDashboard("actor", {
      ...deps,
      knowledge: async () => testKnowledge,
    });
    expect(data.prospects[0]).toMatchObject({ draftReady: true, draftRunId: run.id });
    expect(data.prospects[0].drafting.emails).toEqual([]);
    expect(data.runs[0]).not.toHaveProperty("sequence");
    const revoked = await getWorkforceDashboard("actor", { ...deps, knowledge: async () => [] });
    expect(revoked.prospects[0]).toMatchObject({ draftReady: false, draftRunId: null });
    const invalidated = (await deps.evidence.list("actor"))[0];
    invalidated.observations = invalidated.observations.filter(
      (item) => item.field !== "emailVerification",
    );
    await deps.evidence.save("actor", [invalidated]);
    expect(
      (await getWorkforceDashboard("actor", { ...deps, knowledge: async () => testKnowledge }))
        .prospects[0].draftReady,
    ).toBe(false);
  });

  it("uses actual scoped snapshots, starts human review counts at zero and never assumes configured providers work", async () => {
    const deps = await setup();
    const data = await getWorkforceDashboard("actor", deps);
    expect(data.prospects).toHaveLength(1);
    expect(data.metrics).toEqual({ reviewedToday: 0, eligible: 1, hold: 0, rejected: 0 });
    expect(data.integrations.find((i) => i.id === "HUBSPOT")?.status).toBe("LAST_SUCCESS");
    expect(data.integrations.find((i) => i.id === "OPENAI")?.status).toBe("CONFIGURED_UNTESTED");
    for (const id of ["OUTREACH", "SIMILARWEB"])
      expect(data.integrations.find((i) => i.id === id)?.status).toBe("NOT_IMPLEMENTED");
    expect(data.integrations.find((i) => i.id === "EMAIL_VERIFICATION")?.status).toBe(
      "NOT_CONFIGURED",
    );
    expect(data.prospects[0].draftReady).toBe(false);
  });
  it("persists explicit reviews without approving contact or draft and isolates other actors", async () => {
    const deps = await setup();
    await markProspectReviewed("actor", "42", deps);
    const data = await getWorkforceDashboard("actor", deps);
    expect(data.metrics.reviewedToday).toBe(1);
    expect(data.prospects[0].review).toMatchObject({
      approved: false,
      reviewedAt: collectionNow.toISOString(),
    });
    await markProspectReviewed("actor", "42", deps);
    expect((await getWorkforceDashboard("actor", deps)).metrics.reviewedToday).toBe(1);
    expect((await getWorkforceDashboard("other", deps)).prospects).toEqual([]);
    await expect(markProspectReviewed("other", "42", deps)).rejects.toThrow("NOT_FOUND");
    expect(
      (
        await getWorkforceDashboard("actor", {
          ...deps,
          now: () => new Date("2026-10-16T01:00:00Z"),
        })
      ).metrics.reviewedToday,
    ).toBe(0);
  });
  it("excludes legacy/missing assignment provenance and other owners, without implying zero when storage fails", async () => {
    const deps = await setup();
    const snapshot = (await deps.evidence.list("actor"))[0];
    await deps.evidence.save("actor", [
      {
        ...snapshot,
        contact: { ...snapshot.contact, hubspotRecordId: "legacy", intakeSince: undefined },
      },
      {
        ...snapshot,
        contact: { ...snapshot.contact, hubspotRecordId: "outsider", ownerId: "other" },
      },
    ]);
    expect(
      (await getWorkforceDashboard("actor", deps)).prospects.map((p) => p.contact.hubspotRecordId),
    ).toEqual(["42"]);
    deps.evidence.list = async () => {
      throw Error("secret diagnostics");
    };
    const data = await getWorkforceDashboard("actor", deps);
    expect(data.metrics).toEqual({
      reviewedToday: null,
      eligible: null,
      hold: null,
      rejected: null,
    });
    expect(JSON.stringify(data)).not.toContain("secret diagnostics");
  });
  it("does not attach an unbound manual run or namesake to a CRM contact", async () => {
    const deps = await setup();
    await deps.runs.create(
      "actor",
      "manual-id-000000000",
      {
        ...workforceIntake,
        prospectName: collectedContact.fullName,
        companyDomain: collectedContact.companyDomain!,
      },
      collectionNow,
    );
    const bound = await deps.runs.create(
      "actor",
      "bound-id-0000000000",
      {
        ...workforceIntake,
        hubspotRecordId: "42",
        prospectName: collectedContact.fullName,
        companyDomain: collectedContact.companyDomain!,
      },
      collectionNow,
    );
    expect((await getWorkforceDashboard("actor", deps)).prospects[0].runIds).toEqual([bound.id]);
  });
  it("reports blocked and interrupted stages rather than optimistic completion", () => {
    const run = initialRun("actor", "key", workforceIntake, testNow);
    run.stage = "SEQUENCE";
    run.status = "INSUFFICIENT_EVIDENCE";
    run.events = [{ stage: "SEQUENCE", state: "COMPLETED", at: testNow.toISOString() }];
    expect(summarizeRun(run, testNow).stages.find((s) => s.stage === "SEQUENCE")?.status).toBe(
      "BLOCKED",
    );
    run.stage = "KNOWLEDGE";
    run.status = "RUNNING";
    run.events = [{ stage: "KNOWLEDGE", state: "STARTED", at: testNow.toISOString() }];
    expect(summarizeRun(run, testNow).stages[0].status).toBe("INTERRUPTED");
    run.leaseUntil = new Date(testNow.getTime() + 1000).toISOString();
    expect(summarizeRun(run, testNow).stages[0].status).toBe("RUNNING");
  });
  it("redacts persisted drafts on HOLD or failed eligibility lookup without changing the saved run", async () => {
    const run = initialRun("actor", "key", workforceIntake, testNow);
    run.sequence = { body: "sensitive draft" } as unknown as NonNullable<typeof run.sequence>;
    const read = await protectRunDrafts("actor", run, {
      eligibility: async () => ({
        status: "HOLD",
        reasons: ["Unknown history"],
        blockDrafting: false,
      }),
      knowledge: async () => testKnowledge,
      now: testNow,
    });
    expect(read.sequence).toBeNull();
    expect(read.eligibility.status).toBe("HOLD");
    expect(run.sequence).not.toBeNull();
    const failed = await protectRunDrafts("actor", run, {
      eligibility: async () => {
        throw Error("private provider error");
      },
    });
    expect(failed.sequence).toBeNull();
    expect(failed.eligibility.status).toBe("HOLD");
    expect(JSON.stringify(failed)).not.toContain("private provider error");
  });
});

it("orders the actual queue by reviewed opportunity evidence independently of eligibility", async () => {
  const { qualityFixture } = await import("@/test/workforce-quality-fixtures");
  const eligible = qualityFixture("SAAS"),
    hold = qualityFixture("HISTORY_HOLD"),
    rejected = qualityFixture("PAID_SOCIAL");
  const evidence = new MemoryEvidenceStore(),
    runs = new MemoryWorkforceStore();
  await evidence.save("synthetic-operator", [eligible.snapshot, rejected.snapshot, hold.snapshot]);
  for (const f of [eligible, rejected, hold]) {
    f.run.sequence = null;
    // Keep the quoted company evidence beyond the bounded client excerpt, as on real pages.
    f.run.research.sources[0].excerpt =
      "Source preamble. ".repeat(100) + f.run.research.sources[0].excerpt;
    runs.records.set(`synthetic-operator:${f.run.id}`, f.run);
  }
  const data = await getWorkforceDashboard("synthetic-operator", {
    evidence,
    runs,
    now: () => testNow,
    configured: { hubspot: false, openai: false },
  });
  expect(data.prospects.map((p) => p.contact.hubspotRecordId)).toEqual([
    hold.snapshot.contact.hubspotRecordId,
    eligible.snapshot.contact.hubspotRecordId,
    rejected.snapshot.contact.hubspotRecordId,
  ]);
  expect(data.prospects[0].opportunityPriority?.level).toBe("OBSERVED_SIGNAL");
  expect(data.prospects[0].plan.decision.status).toBe("HOLD");
  expect(data.prospects[0].draftReady).toBe(false);
  expect(data.metrics).toMatchObject({ eligible: 1, hold: 1, rejected: 1 });
});
