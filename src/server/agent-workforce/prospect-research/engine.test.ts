import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import { ProspectResearchEngine } from "./engine";
import { ResearchProviderError } from "./serp";
import { WorkforceError, type WorkforceModel } from "../openai";
import {
  MemoryWorkforceStore,
  MockWorkforceModel,
  workforceIntake,
  testNow,
  testReader,
  testKnowledge,
} from "@/test/workforce-fixtures";
import {
  MemoryEvidenceStore,
  collectedContact,
  observation,
} from "@/test/sales-agent-collection-fixtures";
import type { EvidenceSnapshot } from "@/server/sales-agent/evidence-store";
import type { WorkforceRun } from "@/features/agent-workforce/gate-a-contracts";
import { reviewEvidenceSnapshot } from "@/server/services/sales-agent-collection-service";
class ResearchModel extends MockWorkforceModel {
  conflict = false;
  unsupported = false;
  override async structured<T>(
    stage: string,
    schema: z.ZodType<T>,
    instruction: string,
    context: unknown,
    usage: WorkforceRun["usage"],
  ): Promise<T> {
    if (stage === "OPPORTUNITY_ASSESSMENT")
      return schema.parse({
        hypothesis:
          "The verified retail business could explore how branded coverage decisions are made.",
        supportingFactIds: [this.unsupported ? "fabricated:fact" : "account:business"],
        supportingObservationIds: [],
        confidence: "LOW",
        limitations: ["No first-party ads measurement"],
        missingInformation: ["Similarweb unavailable"],
        recommendedAngle: "OTHER_EVIDENCE_LED",
        followUp: ["Propose additional brand query monitoring"],
      });
    if (stage === "OPPORTUNITY_REVIEW")
      return schema.parse({
        grounded: !this.conflict,
        concerns: this.conflict ? ["Sources conflict"] : [],
      });
    return super.structured(stage, schema, instruction, context, usage);
  }
}
async function setup() {
  let now = new Date(testNow);
  const evidence = new MemoryEvidenceStore();
  const snapshot: EvidenceSnapshot = {
    version: 1,
    contact: {
      ...structuredClone(collectedContact),
      fullName: workforceIntake.prospectName,
      companyName: workforceIntake.companyName,
      observedAt: testNow.toISOString(),
    },
    observations: [observation("role", workforceIntake.prospectTitle)],
    blockers: [],
    collectedAt: testNow.toISOString(),
    provenanceAtCollection: [],
    providers: [
      {
        provider: "HUBSPOT",
        status: "CONNECTED",
        message: "Isolated fictional synchronization fixture",
      },
    ],
    integrationReceipts: { HUBSPOT: { jobId: "fictional-sync", operation: "IMPORTED" } },
  };
  await evidence.save("actor", [snapshot]);
  const store = new MemoryWorkforceStore();
  const model = new ResearchModel();
  const serp = vi.fn(async () => []);
  const deps = {
    evidence,
    store,
    model: () => model as WorkforceModel,
    reader: testReader(),
    knowledge: async () => testKnowledge,
    serp,
    now: () => now,
  };
  const engine = new ProspectResearchEngine(deps);
  const queued = await engine.enqueue("actor");
  return {
    engine,
    deps,
    store,
    evidence,
    model,
    snapshot,
    id: queued.records[0].runId!,
    setNow: (d: Date) => {
      now = d;
    },
  };
}
async function finish(ctx: Awaited<ReturnType<typeof setup>>) {
  let run = (await ctx.store.get("actor", ctx.id))!;
  for (let i = 0; i < 8 && run.prospectResearch?.status === "RUNNING"; i++)
    run = await ctx.engine.advance("actor", run.id);
  return run;
}
describe("HubSpot-driven autonomous research with isolated fictional provider responses", () => {
  it("runs source extraction, grounding, contact research, assessment and review without changing HOLD or creating drafts", async () => {
    const ctx = await setup();
    expect(ctx.id).toBeTruthy();
    const before = reviewEvidenceSnapshot(ctx.snapshot, testNow).plan.decision.status;
    const run = await finish(ctx);
    expect(run.prospectResearch?.stages.COMPANY.status).toBe("COMPLETE");
    expect(run.prospectResearch?.stages.CONTACT.status).toBe("COMPLETE");
    expect(run.prospectResearch?.stages.ASSESSMENT.status).toBe("COMPLETE");
    expect(run.prospectResearch?.stages.REVIEW.status).toBe("COMPLETE");
    expect(run.prospectResearch?.similarweb.status).toBe("DATA_UNAVAILABLE");
    expect(run.prospectResearch?.status).toBe("PARTIAL");
    expect(run.prospectResearch?.opportunity?.supportingFactIds).toEqual(["account:business"]);
    expect(before).toBe("HOLD");
    expect(reviewEvidenceSnapshot(ctx.snapshot, testNow).plan.decision.status).toBe(before);
    expect(run.sequence).toBeNull();
    expect(run.approved).toBe(false);
    expect(run.canSend).toBe(false);
    expect(run.canEnroll).toBe(false);
    expect(ctx.model.calls).not.toContain("SEQUENCE");
    expect(ctx.model.calls).not.toContain("STRATEGY");
  });
  it("deduplicates concurrent intake and unchanged snapshots by stable HubSpot ID", async () => {
    const ctx = await setup();
    const [a, b] = await Promise.all([ctx.engine.enqueue("actor"), ctx.engine.enqueue("actor")]);
    expect(a.records[0].runId).toBe(ctx.id);
    expect(b.records[0].runId).toBe(ctx.id);
    expect(ctx.store.records.size).toBe(1);
    const changed = structuredClone(ctx.snapshot);
    changed.contact.observedAt = "2026-10-15T18:01:00Z";
    ctx.setNow(new Date("2026-10-15T18:01:00Z"));
    await ctx.evidence.save("actor", [changed]);
    expect((await ctx.engine.enqueue("actor")).records[0].runId).toBe(ctx.id);
  });
  it("holds unknown history and never treats research as independent employment verification", async () => {
    const ctx = await setup();
    await finish(ctx);
    const saved = (await ctx.evidence.list("actor"))[0] as EvidenceSnapshot;
    expect(saved.verification).toBeUndefined();
    expect(saved.observations.some((o) => o.field === "currentEmploymentVerified")).toBe(false);
    expect(reviewEvidenceSnapshot(saved, testNow).qualification.status).toBe("HOLD");
  });
  it("keeps contact research running through a company provider outage", async () => {
    const ctx = await setup();
    const original = ctx.model.structured.bind(ctx.model);
    vi.spyOn(ctx.model, "structured").mockImplementation(
      async (stage, schema, instruction, context, usage) => {
        if (stage === "ACCOUNT_RESEARCH")
          throw new WorkforceError("MODEL_FAILED", "Mock API failure");
        return original(stage, schema, instruction, context, usage);
      },
    );
    const run = await finish(ctx);
    expect(run.prospectResearch?.stages.COMPANY.status).toBe("FAILED");
    expect(run.prospectResearch?.stages.CONTACT.status).toBe("COMPLETE");
    expect(run.prospectResearch?.opportunity).toBeNull();
    expect(run.prospectResearch?.status).toBe("PARTIAL");
  });
  it("records missing SERP access without fictional observations", async () => {
    const ctx = await setup();
    ctx.deps.serp.mockRejectedValue(
      new ResearchProviderError("DATA_UNAVAILABLE", false, "Missing authorized SERP credentials"),
    );
    const run = await finish(ctx);
    expect(run.prospectResearch?.serp).toEqual([]);
    expect(run.prospectResearch?.stages.SERP.status).toBe("DATA_UNAVAILABLE");
    expect(run.prospectResearch?.stages.CONTACT.status).toBe("COMPLETE");
  });
  it("rejects unsupported AI references", async () => {
    const ctx = await setup();
    ctx.model.unsupported = true;
    const run = await finish(ctx);
    expect(run.prospectResearch?.stages.ASSESSMENT.status).toBe("FAILED");
    expect(run.prospectResearch?.opportunity).toBeNull();
  });
  it("withholds conflicting opportunity evidence", async () => {
    const ctx = await setup();
    ctx.model.conflict = true;
    expect((await finish(ctx)).prospectResearch?.opportunity).toBeNull();
  });
  it("does not publish hallucinated source quotes", async () => {
    const ctx = await setup();
    ctx.deps.reader = async (url) => ({
      url,
      title: "Fictional unrelated page",
      text: "This source does not contain the asserted facts. ".repeat(5),
    });
    const run = await finish(ctx);
    expect(run.research.facts).toEqual([]);
    expect(run.prospectResearch?.opportunity).toBeNull();
  });
  it("resumes an interrupted leased stage after expiry without losing completed work", async () => {
    const ctx = await setup();
    let run = await ctx.engine.advance("actor", ctx.id);
    const companyFacts = structuredClone(run.research.facts);
    const expected = run.version;
    run.version++;
    run.leaseUntil = "2026-10-15T18:00:30Z";
    run.prospectResearch!.stages.SIMILARWEB.status = "RUNNING";
    run.prospectResearch!.stages.SIMILARWEB.attempts = 1;
    await ctx.store.change("actor", expected, run);
    ctx.setNow(new Date("2026-10-15T18:01:00Z"));
    run = await ctx.engine.advance("actor", ctx.id);
    expect(run.prospectResearch?.stages.SIMILARWEB.attempts).toBe(2);
    expect(run.prospectResearch?.stages.SIMILARWEB.status).toBe("DATA_UNAVAILABLE");
    expect(run.research.facts).toEqual(companyFacts);
  });
  it("honors an active lease and compare-and-set duplicate workers", async () => {
    const ctx = await setup();
    const [a, b] = await Promise.all([
      ctx.engine.advance("actor", ctx.id),
      ctx.engine.advance("actor", ctx.id),
    ]);
    expect([a, b].some((r) => r.prospectResearch?.stages.COMPANY.status === "COMPLETE")).toBe(true);
    expect(ctx.model.calls.filter((c) => c === "ACCOUNT_RESEARCH")).toHaveLength(1);
  });
  it("invalidates old research on an email or employer change", async () => {
    const ctx = await setup();
    await ctx.engine.advance("actor", ctx.id);
    const changed = structuredClone(ctx.snapshot);
    changed.contact.email = "new@example.com";
    await ctx.evidence.save("actor", [changed]);
    const run = await ctx.engine.advance("actor", ctx.id);
    expect(run.prospectResearch?.status).toBe("STALE");
    expect(run.prospectResearch?.opportunity).toBeNull();
    expect((await ctx.engine.enqueue("actor")).records[0].runId).not.toBe(ctx.id);
  });
  it("invalidates stale research and demands fresh synchronized intake", async () => {
    const ctx = await setup();
    ctx.setNow(new Date("2026-10-17T18:00:00Z"));
    expect((await ctx.engine.advance("actor", ctx.id)).prospectResearch?.status).toBe("STALE");
    expect((await ctx.engine.enqueue("actor")).records[0].issue).toBe("INTAKE_REFRESH_REQUIRED");
  });
  it("rejects out-of-owner contacts and unsynchronized manual records", async () => {
    const ctx = await setup();
    const changed = structuredClone(ctx.snapshot);
    changed.contact.ownerId = "other-owner";
    await ctx.evidence.save("actor", [changed]);
    expect((await ctx.engine.enqueue("actor")).records[0].issue).toBe("NOT_FOUND");
    changed.contact.ownerId = "1087915602";
    delete changed.integrationReceipts;
    await ctx.evidence.save("actor", [changed]);
    expect((await ctx.engine.enqueue("actor")).records[0].issue).toBe("NOT_FOUND");
  });
  it("isolates actors and resumes bounded batches with explicit cursors", async () => {
    const ctx = await setup();
    expect((await ctx.engine.enqueue("other")).records).toEqual([]);
    await expect(ctx.engine.advance("other", ctx.id)).rejects.toThrow("NOT_FOUND");
    const second = structuredClone(ctx.snapshot);
    second.contact.hubspotRecordId = "99";
    second.observations = [];
    await ctx.evidence.save("actor", [ctx.snapshot, second]);
    const first = await ctx.engine.enqueue("actor", { limit: 1 });
    expect(first.next).toBe("42");
    const next = await ctx.engine.enqueue("actor", { limit: 1, after: first.next! });
    expect(next.records[0].contactId).toBe("99");
    expect(next.next).toBeNull();
  });
  it("requires approved product knowledge instead of model product recollection", async () => {
    const ctx = await setup();
    ctx.deps.knowledge = async () => [];
    const run = await finish(ctx);
    expect(run.prospectResearch?.stages.ASSESSMENT.status).toBe("DATA_UNAVAILABLE");
    expect(run.prospectResearch?.opportunity).toBeNull();
  });
});

it("caps retries at three and retains explicit execution history", async () => {
  const ctx = await setup();
  ctx.deps.serp.mockRejectedValue(
    new ResearchProviderError("HTTP_429", true, "Fictional rate limit", 600000),
  );
  let run = await finish(ctx);
  expect(run.prospectResearch?.stages.SERP.attempts).toBe(1);
  expect(run.prospectResearch?.stages.SERP.retryAt).toBe("2026-10-15T18:10:00.000Z");
  ctx.setNow(new Date("2026-10-15T18:05:00Z"));
  run = await ctx.engine.advance("actor", ctx.id);
  expect(run.prospectResearch?.stages.SERP.attempts).toBe(1);
  for (const at of ["18:11:00", "18:22:00", "18:33:00"]) {
    ctx.setNow(new Date(`2026-10-15T${at}Z`));
    for (let i = 0; i < 4; i++) run = await ctx.engine.advance("actor", ctx.id);
  }
  expect(run.prospectResearch?.stages.SERP.attempts).toBe(3);
  expect(ctx.deps.serp).toHaveBeenCalledTimes(3);
  expect(
    run.prospectResearch?.history.some((e) => e.stage === "SERP" && e.state === "FAILED"),
  ).toBe(true);
});

it("rejects stale source data during final review", async () => {
  const ctx = await setup();
  let run = await ctx.engine.advance("actor", ctx.id);
  const version = run.version;
  run.version++;
  run.research.sources[0].observedAt = "2025-01-01T00:00:00Z";
  await ctx.store.change("actor", version, run);
  run = await finish(ctx);
  expect(run.prospectResearch?.reviewIssues.some((s) => s.includes("stale"))).toBe(true);
  expect(run.prospectResearch?.stages.REVIEW.status).toBe("FAILED");
  expect(run.prospectResearch?.opportunity).toBeNull();
});

it("excludes a positively suppressed contact before any provider call", async () => {
  const ctx = await setup();
  const blocked = structuredClone(ctx.snapshot);
  blocked.observations.push(observation("unsubscribed", true, "OUTREACH"));
  await ctx.evidence.save("actor", [blocked]);
  expect((await ctx.engine.enqueue("actor")).records[0].issue).toBe("RESEARCH_REJECTED");
  expect((await ctx.engine.advance("actor", ctx.id)).prospectResearch?.status).toBe("STALE");
  expect(ctx.model.calls).toEqual([]);
});

it("persists terminal recovery when a third attempt is interrupted", async () => {
  const ctx = await setup();
  let run = await finish(ctx);
  const expected = run.version;
  run.version++;
  run.leaseUntil = "2026-10-15T18:00:30Z";
  run.prospectResearch!.status = "RUNNING";
  run.prospectResearch!.stages.REVIEW.status = "RUNNING";
  run.prospectResearch!.stages.REVIEW.attempts = 3;
  await ctx.store.change("actor", expected, run);
  ctx.setNow(new Date("2026-10-15T18:01:00Z"));
  await ctx.engine.advance("actor", ctx.id);
  run = (await ctx.store.get("actor", ctx.id))!;
  expect(run.prospectResearch?.status).toBe("PARTIAL");
  expect(run.leaseUntil).toBeNull();
  expect(run.prospectResearch?.stages.REVIEW.status).toBe("FAILED");
  expect(run.prospectResearch?.opportunity).toBeNull();
});

it("a centralized budget pause retains a resumable stage without consuming provider retries", async () => {
  const ctx = await setup();
  const { BudgetError } = await import("../daily/budget");
  vi.spyOn(ctx.model, "discover").mockRejectedValueOnce(new BudgetError("DAILY_BUDGET"));
  const paused = await ctx.engine.advance("actor", ctx.id);
  expect(paused.prospectResearch!.stages.COMPANY).toMatchObject({
    status: "WAITING",
    attempts: 0,
    code: "DAILY_BUDGET",
  });
  expect(paused.leaseUntil).toBeNull();
  const resumed = await ctx.engine.advance("actor", ctx.id);
  expect(resumed.prospectResearch!.stages.COMPANY.status).toBe("COMPLETE");
});
it("explicit retry retains completed sources and reruns failed stages plus factual review", async () => {
  const ctx = await setup();
  const run = await finish(ctx);
  const expected = run.version;
  run.prospectResearch!.stages.SERP.status = "FAILED";
  run.prospectResearch!.stages.SERP.attempts = 3;
  run.version++;
  await ctx.store.change("actor", expected, run);
  const retried = await ctx.engine.retryFailed("actor", ctx.id);
  expect(retried.prospectResearch!.stages.COMPANY.status).toBe("COMPLETE");
  expect(retried.prospectResearch!.stages.SERP).toMatchObject({ status: "WAITING", attempts: 0 });
  expect(retried.prospectResearch!.stages.REVIEW.status).toBe("WAITING");
  expect(retried.prospectResearch!.opportunity).toBeNull();
  expect(retried.research.facts).toEqual(run.research.facts);
});
it("an explicit retry cannot revive stale identities or evidence", async () => {
  const ctx = await setup();
  ctx.setNow(new Date(testNow.getTime() + 2 * 86400000));
  await expect(ctx.engine.retryFailed("actor", ctx.id)).rejects.toThrow("INTAKE_REFRESH_REQUIRED");
});
