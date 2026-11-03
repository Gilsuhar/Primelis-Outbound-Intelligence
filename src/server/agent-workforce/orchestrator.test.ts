import { describe, expect, it, vi } from "vitest";
import { WorkforceOrchestrator } from "./orchestrator";
import {
  validateResearch,
  validateSequence,
  duplicatesAnotherProspect,
} from "./evidence-validation";
import { WorkforceError } from "./openai";
import {
  testKnowledge,
  testNow,
  testReader,
  workforceIntake,
  MemoryWorkforceStore,
  MockWorkforceModel,
} from "@/test/workforce-fixtures";
async function setup() {
  const store = new MemoryWorkforceStore();
  const model = new MockWorkforceModel();
  const eligibility = vi.fn(async () => ({
    status: "READY" as "READY" | "HOLD" | "REJECTED",
    reasons: ["Verified eligibility in isolated fixture"],
    blockDrafting: false,
  }));
  const deps = {
    store,
    model,
    knowledge: async () => structuredClone(testKnowledge),
    reader: testReader(),
    eligibility,
    now: () => testNow,
  };
  const engine = new WorkforceOrchestrator(deps);
  const run = await engine.start("actor-a", {
    idempotencyKey: "request-key-00001",
    intake: workforceIntake,
  });
  return { engine, deps, store, model, run };
}
async function finish(ctx: Awaited<ReturnType<typeof setup>>) {
  let run = ctx.run;
  for (let i = 0; i < 12 && run.status === "RUNNING"; i++)
    run = await ctx.engine.advance("actor-a", run.id);
  return run;
}
describe("real agent orchestration with isolated provider responses", () => {
  it("rejects edits to an old draft after eligibility becomes HOLD", async () => {
    const ctx = await setup();
    const run = await finish(ctx);
    ctx.deps.eligibility.mockResolvedValue({
      status: "HOLD",
      reasons: ["Email verification expired"],
      blockDrafting: false,
    });
    await expect(
      ctx.engine.edit("actor-a", run.id, {
        action: "EDIT",
        expectedVersion: run.version,
        messages: run.sequence!.messages,
      }),
    ).rejects.toThrow("DRAFT_ELIGIBILITY_HOLD");
    expect((await ctx.store.get("actor-a", run.id))?.version).toBe(run.version);
  });

  it("permits review-only orchestration on HOLD when the independent intake policy allows drafting", async () => {
    const ctx = await setup();
    ctx.deps.eligibility.mockResolvedValue({
      status: "HOLD",
      reasons: ["Unknown Outreach history"],
      blockDrafting: false,
    });
    ctx.engine = new WorkforceOrchestrator({
      ...ctx.deps,
      draftIntake: async () => ({
        draftAllowed: true,
        status: "DRAFT_ALLOWED",
        blockers: [],
        warnings: ["OUTREACH_HISTORY_INCOMPLETE"],
      }),
    });
    const run = await finish(ctx);
    expect(ctx.model.calls).toContain("STRATEGY");
    expect(ctx.model.calls).toContain("SEQUENCE");
    expect(run.status).toBe("READY_FOR_REVIEW");
    expect(run.eligibility.status).toBe("HOLD");
    expect(run.canSend || run.canEnroll || run.approved).toBe(false);
  });

  it("executes research, independent grounding, strategy, original provider generation and critic with persistent pending approval", async () => {
    const ctx = await setup();
    const run = await finish(ctx);
    expect(run.status).toBe("READY_FOR_REVIEW");
    expect(run.sequence?.messages).toHaveLength(4);
    expect(ctx.model.calls).toEqual([
      "DISCOVERY",
      "ACCOUNT_RESEARCH",
      "DISCOVERY",
      "PROSPECT_INTELLIGENCE",
      "EVIDENCE_VALIDATION",
      "STRATEGY",
      "SEQUENCE",
      "QUALITY_REVIEW",
    ]);
    expect(run.eligibility.status).toBe("READY");
    expect(run).toMatchObject({
      approved: false,
      canSend: false,
      canEnroll: false,
      brandSearch: { status: "INCOMPLETE", findings: [] },
    });
    expect(run.contentHash).toHaveLength(64);
    expect((await ctx.store.get("actor-a", run.id))?.sequence).toEqual(run.sequence);
  });
  it("deduplicates identical start requests, rejects key reuse with changed input and isolates users", async () => {
    const ctx = await setup();
    const second = await ctx.engine.start("actor-a", {
      idempotencyKey: "request-key-00001",
      intake: workforceIntake,
    });
    expect(second.id).toBe(ctx.run.id);
    expect(ctx.store.records.size).toBe(1);
    await expect(
      ctx.engine.start("actor-a", {
        idempotencyKey: "request-key-00001",
        intake: { ...workforceIntake, prospectName: "Other Person" },
      }),
    ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    expect(await ctx.store.get("actor-b", ctx.run.id)).toBeNull();
    await expect(ctx.engine.advance("actor-b", ctx.run.id)).rejects.toThrow("NOT_FOUND");
  });
  it("claims a stage atomically so concurrent advances cannot execute the model twice", async () => {
    const ctx = await setup();
    await Promise.all([
      ctx.engine.advance("actor-a", ctx.run.id),
      ctx.engine.advance("actor-a", ctx.run.id),
    ]);
    expect((await ctx.store.get("actor-a", ctx.run.id))?.stage).toBe("ACCOUNT_RESEARCH");
    expect(ctx.deps.eligibility).toHaveBeenCalledTimes(1);
  });
  it("holds when live research cannot return real sources, without substituting model knowledge", async () => {
    const ctx = await setup();
    ctx.deps.reader = async () => {
      throw new Error("unavailable");
    };
    const run = await finish(ctx);
    expect(run.status).toBe("RESEARCH_INCOMPLETE");
    expect(run.sequence).toBeNull();
    expect(ctx.model.calls).toEqual(["DISCOVERY"]);
  });
  it("blocks missing approved product knowledge before research or writing", async () => {
    const ctx = await setup();
    ctx.deps.knowledge = async () => {
      throw new WorkforceError("MISSING_KNOWLEDGE", "No approved product knowledge");
    };
    expect((await finish(ctx)).status).toBe("RESEARCH_INCOMPLETE");
    expect(ctx.model.calls).toEqual([]);
  });
  it("fails closed for malformed model responses and API failures", async () => {
    for (const failure of ["schema", "api"]) {
      const ctx = await setup();
      if (failure === "schema") ctx.model.malformed = true;
      else
        ctx.model.discover = async () => {
          throw new WorkforceError("MODEL_FAILED", "Provider failed");
        };
      const run = await finish(ctx);
      expect(run.status).toBe("GENERATION_FAILED");
      expect(run.sequence).toBeNull();
    }
  });
  it("does not pitch or write when a live suppression/recent-contact restriction blocks drafting", async () => {
    for (const status of ["REJECTED", "HOLD"] as const) {
      const ctx = await setup();
      ctx.deps.eligibility.mockResolvedValue({
        status: status as "HOLD",
        reasons: ["Suppression or recent contact restriction"],
        blockDrafting: true,
      });
      const run = await finish(ctx);
      expect(run.status).toBe("INSUFFICIENT_EVIDENCE");
      expect(ctx.model.calls).toEqual([]);
      expect(run.sequence).toBeNull();
    }
  });
  it("detects fabricated quotations, wrong employer and unsupported responsibilities", async () => {
    const ctx = await setup();
    const run = await finish(ctx);
    const wrong = structuredClone(run);
    wrong.research.facts[1].quotes[0].text =
      "Test Person is Head of Paid Search at Another Employer.";
    expect(validateResearch(wrong, testNow).join(" ")).toMatch(/Quote|association/);
    wrong.research.facts[1].category = "RESPONSIBILITY";
    expect(validateResearch(wrong, testNow).join(" ")).toContain("association");
  });
  it("rejects unknown citations, unapproved numbers, changed strategy and malformed threading", async () => {
    const ctx = await setup();
    const run = await finish(ctx);
    const sequence = structuredClone(run.sequence!);
    sequence.messages[0].body += " We guarantee you will save 90%.";
    sequence.messages[1].supportingFactIds = ["other-contact-fact"];
    sequence.messages[2].subject = "New thread";
    sequence.strategy.prospectId = "another-person";
    const issues = validateSequence(run, sequence).join(" ");
    expect(issues).toMatch(/Unknown cited fact/);
    expect(issues).toMatch(/unsupported number/);
    expect(issues).toMatch(/thread/);
    expect(issues).toMatch(/identity|prospect/);
  });
  it("respects NO_PITCH and keeps a four-email sequence from appearing complete without evidence", async () => {
    const ctx = await setup();
    const original = ctx.model.structured.bind(ctx.model);
    ctx.model.structured = async (stage, schema, instruction, context, usage) => {
      const result = await original(stage, schema, instruction, context, usage);
      if (stage === "STRATEGY") Object.assign(result as object, { angle: "NO_PITCH" });
      return result;
    };
    expect((await finish(ctx)).status).toBe("INSUFFICIENT_EVIDENCE");
    expect(ctx.model.calls).not.toContain("SEQUENCE");
  });
  it("bounds revision to one attempt and leaves unresolved copy on HOLD", async () => {
    const ctx = await setup();
    ctx.model.revise = true;
    const run = await finish(ctx);
    expect(run.status).toBe("GENERATION_FAILED");
    expect(run.revisionAttempts).toBe(1);
    expect(ctx.model.calls.filter((s) => s === "SEQUENCE")).toHaveLength(2);
    expect(run.sequence?.review.verdict).toBe("HOLD");
  });
  it("invalidates automated review and content hash on edits; rejection is terminal", async () => {
    const ctx = await setup();
    const run = await finish(ctx);
    const messages = structuredClone(run.sequence!.messages);
    messages[0].body += " Would next week be easier?";
    const edited = await ctx.engine.edit("actor-a", run.id, {
      action: "EDIT",
      expectedVersion: run.version,
      messages,
    });
    expect(edited.status).toBe("RUNNING");
    expect(edited.stage).toBe("QUALITY_REVIEW");
    expect(edited.contentHash).not.toBe(run.contentHash);
    expect(edited.approved).toBe(false);
    const checked = await ctx.engine.advance("actor-a", run.id);
    expect(checked.status).toBe("READY_FOR_REVIEW");
    const rejected = await ctx.engine.edit("actor-a", run.id, {
      action: "REJECT",
      expectedVersion: checked.version,
    });
    expect(rejected.status).toBe("REJECTED");
    expect((await ctx.engine.advance("actor-a", run.id)).status).toBe("REJECTED");
  });
  it("does not replay expired in-flight requests or grant readiness after approval revocation", async () => {
    const ctx = await setup();
    const run = await ctx.store.get("actor-a", ctx.run.id);
    run!.leaseUntil = "2026-10-15T17:00:00Z";
    run!.version++;
    await ctx.store.change("actor-a", 1, run!);
    expect((await ctx.engine.advance("actor-a", ctx.run.id)).status).toBe("GENERATION_FAILED");
    const other = await setup();
    while ((await other.store.get("actor-a", other.run.id))?.stage !== "SEQUENCE")
      await other.engine.advance("actor-a", other.run.id);
    other.deps.knowledge = async () => [];
    expect((await other.engine.advance("actor-a", other.run.id)).status).toBe(
      "RESEARCH_INCOMPLETE",
    );
  });
  it("never dispatches a CRM, Outreach, sending or enrollment operation", async () => {
    const ctx = await setup();
    const fetcher = vi.fn(() => {
      throw new Error("Unexpected external request");
    });
    vi.stubGlobal("fetch", fetcher);
    try {
      const run = await finish(ctx);
      expect(fetcher).not.toHaveBeenCalled();
      expect(run.canSend).toBe(false);
      expect(run.canEnroll).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("rejects pure prospect/company name substitutions without leaking other-contact context to the model", async () => {
    const ctx = await setup();
    const first = await finish(ctx);
    const second = structuredClone(first);
    second.inputHash = "different-input";
    second.intake.companyName = "Other Company";
    second.intake.prospectName = "Other Person";
    second.sequence!.messages = second.sequence!.messages.map((m) => ({
      ...m,
      body: m.body.replaceAll("Test Company", "Other Company"),
    }));
    expect(duplicatesAnotherProspect(second, first)).toBe(true);
    second.sequence!.messages[0].body =
      "A substantively different evidence-backed question for another buyer.";
    expect(duplicatesAnotherProspect(second, first)).toBe(false);
  });
  it("holds stale or future sources and rejects unknown fact identifiers before strategy", async () => {
    const ctx = await setup();
    const run = await finish(ctx);
    run.research.sources[0].observedAt = "2026-08-01T08:00:00Z";
    expect(validateResearch(run, testNow).join(" ")).toContain("stale");
    run.research.sources[0].observedAt = "2026-10-16T08:00:00Z";
    expect(validateResearch(run, testNow).join(" ")).toContain("invalid");
    run.research.facts[0].sourceIds = ["unknown-source"];
    expect(validateResearch(run, testNow).join(" ")).toContain("quoted source support");
  });
});
