import { describe, expect, it, vi } from "vitest";
import { DraftStudioEngine } from "./engine";
import { WorkforceOrchestrator } from "../orchestrator";
import { WorkforceError } from "../openai";
import { newResearch, researchIdentity } from "../prospect-research/engine";
import {
  MemoryWorkforceStore,
  MockWorkforceModel,
  workforceIntake,
  testKnowledge,
  testNow,
  testReader,
} from "@/test/workforce-fixtures";
import {
  MemoryEvidenceStore,
  collectedContact,
  verifiedObservations,
} from "@/test/sales-agent-collection-fixtures";
import type { EvidenceSnapshot } from "@/server/sales-agent/evidence-store";
import { validateSequence } from "../evidence-validation";
async function setup() {
  const store = new MemoryWorkforceStore(),
    evidence = new MemoryEvidenceStore(),
    model = new MockWorkforceModel();
  let now = new Date(testNow);
  let knowledge = structuredClone(testKnowledge);
  const eligibility = vi.fn(async () => ({
    status: "READY" as "READY" | "HOLD" | "REJECTED",
    reasons: [] as string[],
    blockDrafting: false,
  }));
  const snapshot: EvidenceSnapshot = {
    version: 1,
    contact: {
      ...structuredClone(collectedContact),
      fullName: workforceIntake.prospectName,
      companyName: workforceIntake.companyName,
      observedAt: testNow.toISOString(),
    },
    observations: structuredClone(verifiedObservations),
    providers: [
      {
        provider: "HUBSPOT",
        status: "CONNECTED",
        message: "Fictional isolated test synchronization",
      },
    ],
    integrationReceipts: { HUBSPOT: { jobId: "fictional-import", operation: "IMPORTED" } },
    blockers: [],
    collectedAt: testNow.toISOString(),
    provenanceAtCollection: [],
  };
  await evidence.save("actor", [snapshot]);
  const input = { ...workforceIntake, hubspotRecordId: "42" };
  const research = new WorkforceOrchestrator({
    store,
    model,
    eligibility,
    knowledge: async () => knowledge,
    reader: testReader(),
    now: () => now,
  });
  let source = await research.start("actor", {
    idempotencyKey: "research-fixture-0001",
    intake: input,
  });
  for (let i = 0; i < 4; i++) source = await research.advance("actor", source.id);
  const expected = source.version;
  source.version++;
  source.prospectResearch = newResearch(researchIdentity(snapshot), now);
  source.prospectResearch.status = "PARTIAL";
  for (const stage of ["COMPANY", "CONTACT", "REVIEW"] as const)
    source.prospectResearch.stages[stage].status = "COMPLETE";
  for (const stage of ["SIMILARWEB", "SERP", "ASSESSMENT"] as const)
    source.prospectResearch.stages[stage].status = "DATA_UNAVAILABLE";
  source.status = "RESEARCH_INCOMPLETE";
  await store.change("actor", expected, source);
  model.calls = [];
  const deps = {
    store,
    evidence,
    model: () => model,
    eligibility,
    knowledge: async () => knowledge,
    now: () => now,
  };
  const engine = new DraftStudioEngine(deps);
  return {
    store,
    evidence,
    model,
    snapshot,
    source,
    engine,
    deps,
    eligibility,
    setNow: (d: Date) => {
      now = d;
    },
    setKnowledge: (k: typeof testKnowledge) => {
      knowledge = k;
    },
  };
}
async function finish(ctx: Awaited<ReturnType<typeof setup>>) {
  let run = await ctx.engine.prepare("actor", ctx.source.id);
  for (let i = 0; i < 8 && run.status === "RUNNING"; i++)
    run = await ctx.engine.advance("actor", run.id);
  return run;
}
describe("review-first personalized Draft Studio using isolated fictional evidence and model calls", () => {
  it("reuses completed research and generates four original drafts without sending or approval", async () => {
    const ctx = await setup();
    const run = await finish(ctx);
    expect(run.status).toBe("READY_FOR_REVIEW");
    expect(run.draftStudio?.qualityDecision).toBe("PASS");
    expect(run.sequence?.messages.map((m) => m.step)).toEqual([1, 2, 3, 4]);
    expect(ctx.model.calls).toEqual(["STRATEGY", "SEQUENCE", "QUALITY_REVIEW"]);
    expect(run.draftStudio?.reviewStatus).toBe("PENDING");
    expect(run.draftStudio?.approval).toBeNull();
    expect(run.approved).toBe(false);
    expect(run.canSend).toBe(false);
    expect(run.canEnroll).toBe(false);
    expect(run.draftStudio?.versions).toHaveLength(1);
    expect(run.research.sources).toEqual(ctx.source.research.sources);
  });
  it.each(["REJECTED"] as const)(
    "never generates operational drafts for %s contacts",
    async (status) => {
      const ctx = await setup();
      ctx.eligibility.mockResolvedValue({
        status,
        reasons: ["Fictional blocked gate"],
        blockDrafting: status === "REJECTED",
      });
      await expect(ctx.engine.prepare("actor", ctx.source.id)).rejects.toThrow(
        "DRAFT_ELIGIBILITY_HOLD",
      );
      expect(ctx.model.calls).toEqual([]);
      expect((await ctx.store.list("actor")).filter((r) => r.draftStudio)).toEqual([]);
    },
  );
  it("treats absent Similarweb and SERP as missing optional evidence, never fictional findings", async () => {
    const ctx = await setup();
    const run = await finish(ctx);
    expect(run.draftStudio?.context.serp).toEqual([]);
    expect(run.draftStudio?.context.missingInformation.join(" ")).toContain("Similarweb");
    expect(run.sequence?.messages.every((m) => m.supportingObservationIds.length === 0)).toBe(true);
  });
  it("deduplicates preparation requests and never regenerates an unchanged draft", async () => {
    const ctx = await setup();
    const [a, b] = await Promise.all([
      ctx.engine.prepare("actor", ctx.source.id),
      ctx.engine.prepare("actor", ctx.source.id),
    ]);
    expect(a.id).toBe(b.id);
    expect((await ctx.store.list("actor")).filter((r) => r.draftStudio)).toHaveLength(1);
    const done = await finish(ctx);
    const calls = ctx.model.calls.length;
    expect((await ctx.engine.prepare("actor", ctx.source.id)).id).toBe(done.id);
    expect(ctx.model.calls).toHaveLength(calls);
  });
  it("records exact-version content approval without granting outbound permissions", async () => {
    const ctx = await setup();
    let run = await finish(ctx);
    const input = {
      action: "APPROVE",
      expectedVersion: run.version,
      requestKey: "approval-fixture-01",
    };
    run = await ctx.engine.mutate("actor", run.id, input);
    expect(run.draftStudio?.reviewStatus).toBe("CONTENT_APPROVED");
    expect(run.draftStudio?.approval).toMatchObject({
      actor: "actor",
      scope: "CONTENT_REVIEW_ONLY",
      dependencyHash: run.draftStudio!.dependencyHash,
    });
    expect(run.approved).toBe(false);
    expect(run.canSend).toBe(false);
    expect(run.canEnroll).toBe(false);
    expect((await ctx.engine.mutate("actor", run.id, input)).version).toBe(run.version);
    await expect(
      ctx.engine.mutate("actor", run.id, { ...input, action: "REJECT" }),
    ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  });
  it.each(["email", "employment", "history", "research", "knowledge"])(
    "invalidates approved drafts after %s evidence changes",
    async (field) => {
      const ctx = await setup();
      let run = await finish(ctx);
      run = await ctx.engine.mutate("actor", run.id, {
        action: "APPROVE",
        expectedVersion: run.version,
        requestKey: "approval-fixture-02",
      });
      if (field === "knowledge")
        ctx.setKnowledge([{ ...testKnowledge[0], text: "Changed approved wording" }]);
      else if (field === "research") {
        const source = (await ctx.store.get("actor", ctx.source.id))!;
        const version = source.version;
        source.version++;
        source.research.facts[0].statement += " Changed evidence.";
        await ctx.store.change("actor", version, source);
      } else {
        const changed = structuredClone(ctx.snapshot);
        if (field === "email") changed.contact.email = "different@example.com";
        if (field === "employment")
          changed.observations.find((o) => o.field === "currentEmploymentVerified")!.value = false;
        if (field === "history")
          changed.observations.find((o) => o.field === "lastOutboundAt")!.value =
            testNow.toISOString();
        await ctx.evidence.save("actor", [changed]);
      }
      const read = await ctx.engine.read("actor", run.id);
      expect(read.draftStudio?.reviewStatus).toBe("INVALIDATED");
      expect(read.draftStudio?.approval).toBeNull();
      expect(read.sequence).toBeNull();
      expect(read.draftStudio?.versions.every((v) => v.messages === null)).toBe(true);
    },
  );
  it("fails closed when current eligibility checks become unavailable", async () => {
    const ctx = await setup();
    const run = await finish(ctx);
    ctx.eligibility.mockRejectedValue(new Error("secret fixture"));
    const read = await ctx.engine.read("actor", run.id);
    expect(read.sequence).toBeNull();
    expect(read.issues.join(" ")).not.toContain("secret fixture");
  });
  it("falls back to INSIGHT_LED without using conflicting company evidence", async () => {
    const ctx = await setup();
    const source = (await ctx.store.get("actor", ctx.source.id))!;
    const version = source.version;
    source.version++;
    source.prospectResearch!.reviewIssues = ["Conflicting sources"];
    await ctx.store.change("actor", version, source);
    const draft = await ctx.engine.prepare("actor", source.id);
    expect(draft.writingMode).toBe("INSIGHT_LED");
    expect(draft.research.facts).toEqual([]);
    expect(ctx.model.calls).toEqual([]);
  });
  it("rejects unsupported percentages and fabricated SERP references independently of a passing model critic", async () => {
    const ctx = await setup();
    const run = await finish(ctx);
    const sequence = structuredClone(run.sequence!);
    sequence.messages[0].body += " We will save you 87%.";
    sequence.messages[0].supportingObservationIds = ["fictional-unknown-observation"];
    expect(validateSequence(run, sequence).join(" ")).toContain("unsupported number");
    expect(validateSequence(run, sequence).join(" ")).toContain("unknown SERP observation");
  });
  it("atomically saves edits, invalidates content approval and preserves immutable earlier content", async () => {
    const ctx = await setup();
    let run = await finish(ctx);
    const original = structuredClone(run.sequence!.messages);
    run = await ctx.engine.mutate("actor", run.id, {
      action: "APPROVE",
      expectedVersion: run.version,
      requestKey: "approval-before-edit",
    });
    const messages = structuredClone(original);
    messages[3].body += " Thank you for considering it.";
    run = await ctx.engine.mutate("actor", run.id, {
      action: "EDIT",
      expectedVersion: run.version,
      messages,
      requestKey: "edit-fixture-0001",
    });
    expect(run.status).toBe("RUNNING");
    expect(run.draftStudio?.approval).toBeNull();
    expect(run.draftStudio?.reviewStatus).toBe("PENDING");
    expect(run.draftStudio?.versions[0].messages).toEqual(original);
    expect(run.draftStudio?.versions[1].origin).toBe("HUMAN");
    await expect(
      ctx.engine.mutate("actor", run.id, {
        action: "APPROVE",
        expectedVersion: run.version,
        requestKey: "approve-too-early",
      }),
    ).rejects.toThrow("VERSION_CONFLICT");
    run = await ctx.engine.advance("actor", run.id);
    expect(run.draftStudio?.qualityDecision).toBe("PASS");
    expect(run.draftStudio?.approval).toBeNull();
  });
  it("blocks quality-review rejection after one bounded rewrite", async () => {
    const ctx = await setup();
    ctx.model.revise = true;
    const run = await finish(ctx);
    expect(run.status).toBe("GENERATION_FAILED");
    expect(run.draftStudio?.qualityDecision).toBe("BLOCKED");
    expect(ctx.model.calls.filter((c) => c === "SEQUENCE")).toHaveLength(2);
    await expect(
      ctx.engine.mutate("actor", run.id, {
        action: "APPROVE",
        expectedVersion: run.version,
        requestKey: "approve-blocked-01",
      }),
    ).rejects.toThrow("QUALITY_REVIEW_REQUIRED");
  });
  it("retries transient provider failures with bounded persistent backoff", async () => {
    const ctx = await setup();
    vi.spyOn(ctx.model, "structured").mockRejectedValue(
      new WorkforceError("MODEL_FAILED", "Fictional API outage"),
    );
    let run = await ctx.engine.prepare("actor", ctx.source.id);
    run = await ctx.engine.advance("actor", run.id);
    expect(run.draftStudio?.nextRetryAt).toBe("2026-10-15T18:01:00.000Z");
    expect((await ctx.engine.advance("actor", run.id)).draftStudio?.failures).toBe(1);
    for (const at of ["18:02:00", "18:05:00"]) {
      ctx.setNow(new Date(`2026-10-15T${at}Z`));
      run = await ctx.engine.advance("actor", run.id);
    }
    expect(run.status).toBe("GENERATION_FAILED");
    expect(run.draftStudio?.failures).toBe(3);
  });
  it("resumes an interrupted batch stage without repeating research or losing versions", async () => {
    const ctx = await setup();
    let run = await ctx.engine.prepare("actor", ctx.source.id);
    const expected = run.version;
    run.version++;
    run.leaseUntil = "2026-10-15T18:00:30Z";
    await ctx.store.change("actor", expected, run);
    ctx.setNow(new Date("2026-10-15T18:01:00Z"));
    run = await ctx.engine.advance("actor", run.id);
    expect(run.stage).toBe("SEQUENCE");
    expect(run.draftStudio?.failures).toBe(1);
    expect(ctx.model.calls).toEqual(["STRATEGY"]);
  });
  it("does not leak contacts across actors or permit legacy routes to bypass dependency checks", async () => {
    const ctx = await setup();
    const run = await ctx.engine.prepare("actor", ctx.source.id);
    await expect(ctx.engine.read("other", run.id)).rejects.toThrow("NOT_FOUND");
    await expect(ctx.engine.prepare("other", ctx.source.id)).rejects.toThrow("RESEARCH_REQUIRED");
    const bypass = new WorkforceOrchestrator({
      store: ctx.store,
      model: ctx.model,
      eligibility: ctx.eligibility,
    });
    expect((await bypass.advance("actor", run.id)).stage).toBe("STRATEGY");
    expect(ctx.model.calls).toEqual([]);
  });
});

it("never accepts unsupported numerical claims even when a mocked critic returns PASS", async () => {
  const ctx = await setup();
  const original = ctx.model.structured.bind(ctx.model);
  vi.spyOn(ctx.model, "structured").mockImplementation(
    async (stage, schema, instruction, context, usage) => {
      const value = await original(stage, schema, instruction, context, usage);
      if (stage === "SEQUENCE") {
        const sequence = value as { messages: { body: string }[] };
        sequence.messages[0].body += " Signal will save you 87%.";
      }
      return value;
    },
  );
  const run = await finish(ctx);
  expect(run.status).toBe("GENERATION_FAILED");
  expect(run.draftStudio?.qualityDecision).toBe("BLOCKED");
  expect(run.issues.join(" ")).toContain("unsupported number");
});

it("reuses a restrained role-relevant approach when the opportunity assessment has no strong hook", async () => {
  const ctx = await setup();
  const source = (await ctx.store.get("actor", ctx.source.id))!;
  const version = source.version;
  source.version++;
  source.prospectResearch!.opportunity = {
    hypothesis: "No measured account problem",
    supportingFactIds: ["prospect:position"],
    supportingObservationIds: [],
    confidence: "LOW",
    limitations: ["No unique commercial finding"],
    missingInformation: ["Account measurements"],
    recommendedAngle: "NO_PITCH",
    followUp: [],
  };
  await ctx.store.change("actor", version, source);
  const run = await ctx.engine.prepare("actor", source.id);
  expect(run.draftStudio?.context.personalizationMode).toBe("EVIDENCE_LED");
  expect(run.status).toBe("RUNNING");
  expect(run.approved).toBe(false);
});

it("invalidates an approval when a newer reviewed research run replaces the source", async () => {
  const ctx = await setup();
  let run = await finish(ctx);
  run = await ctx.engine.mutate("actor", run.id, {
    action: "APPROVE",
    expectedVersion: run.version,
    requestKey: "approve-old-research",
  });
  const replacement = structuredClone(ctx.source);
  replacement.id = "new-fictional-reviewed-research";
  replacement.createdAt = "2026-10-15T18:01:00Z";
  replacement.research.prospectId = replacement.id;
  ctx.store.records.set(`actor:${replacement.id}`, replacement);
  expect((await ctx.engine.read("actor", run.id)).draftStudio?.reviewStatus).toBe("INVALIDATED");
});

it("never trusts browser-supplied approvals, sending flags or tokens", async () => {
  const ctx = await setup();
  const run = await finish(ctx);
  for (const extra of [
    { approved: true },
    { canSend: true },
    { token: "fixture" },
    { sourceRunId: "other" },
  ])
    await expect(
      ctx.engine.mutate("actor", run.id, {
        action: "APPROVE",
        expectedVersion: run.version,
        requestKey: "invalid-action-01",
        ...extra,
      }),
    ).rejects.toThrow();
  expect((await ctx.engine.read("actor", run.id)).draftStudio?.approval).toBeNull();
});

it("bounds approved knowledge context without truncating wording or performing research again", async () => {
  const ctx = await setup();
  const records = [
    ...testKnowledge,
    ...Array.from({ length: 14 }, (_, i) => ({
      ...testKnowledge[0],
      id: `zz-approved-${i}`,
      text: "Fictional approved knowledge ".repeat(100),
    })),
  ];
  ctx.setKnowledge(records);
  const run = await ctx.engine.prepare("actor", ctx.source.id);
  expect(run.knowledge.length).toBeLessThanOrEqual(12);
  expect(run.knowledge.reduce((n, k) => n + JSON.stringify(k).length, 0)).toBeLessThanOrEqual(
    32000,
  );
  expect(
    run.knowledge.every((k) =>
      records.some((original) => original.id === k.id && original.text === k.text),
    ),
  ).toBe(true);
  expect(ctx.model.calls).toEqual([]);
});

it("passes exact retrieved quotations rather than whole fetched pages into the writer", async () => {
  const ctx = await setup();
  const spy = vi.spyOn(ctx.model, "structured");
  await finish(ctx);
  const call = spy.mock.calls.find(([stage]) => stage === "SEQUENCE")!;
  const context = call[3] as {
    research: {
      sources: {
        id: string;
        excerpt?: string;
        quotedExcerpts: { factId: string; text: string }[];
      }[];
    };
  };
  expect(context.research.sources.every((source) => source.excerpt === undefined)).toBe(true);
  for (const source of context.research.sources)
    for (const quote of source.quotedExcerpts)
      expect(ctx.source.research.sources.find((s) => s.id === source.id)?.excerpt).toContain(
        quote.text,
      );
});

it("resumes personalization after provider configuration becomes available instead of skipping to a writer without strategy", async () => {
  const ctx = await setup();
  vi.spyOn(ctx.model, "structured").mockRejectedValueOnce(
    new WorkforceError("NOT_CONFIGURED", "Fictional missing provider"),
  );
  let run = await ctx.engine.prepare("actor", ctx.source.id);
  run = await ctx.engine.advance("actor", run.id);
  expect(run.status).toBe("RESEARCH_INCOMPLETE");
  expect(run.strategy).toBeNull();
  run = await ctx.engine.mutate("actor", run.id, {
    action: "REGENERATE",
    expectedVersion: run.version,
    requestKey: "provider-now-available",
  });
  expect(run.stage).toBe("STRATEGY");
  for (let i = 0; i < 5 && run.status === "RUNNING"; i++)
    run = await ctx.engine.advance("actor", run.id);
  expect(run.status).toBe("READY_FOR_REVIEW");
  expect(run.draftStudio?.approval).toBeNull();
  expect(run.canSend).toBe(false);
});

it("retains OIQ per version and requires a new assessment after human edits", async () => {
  const ctx = await setup();
  let run = await finish(ctx);
  const first = structuredClone(run.critic!.oiq!);
  expect(first.score).toBe(93);
  expect(run.draftStudio!.versions[0].oiq).toEqual(first);
  run = await ctx.engine.mutate("actor", run.id, {
    action: "APPROVE",
    expectedVersion: run.version,
    requestKey: "oiq-first-approval",
  });
  const messages = structuredClone(run.sequence!.messages);
  messages[3].body += " Happy to leave the timing with you.";
  run = await ctx.engine.mutate("actor", run.id, {
    action: "EDIT",
    expectedVersion: run.version,
    requestKey: "oiq-human-edit",
    messages,
  });
  expect(run.critic).toBeNull();
  expect(run.draftStudio!.approval).toBeNull();
  expect(run.draftStudio!.versions[0].oiq).toEqual(first);
  expect(run.draftStudio!.versions[1].oiq).toBeUndefined();
  run = await ctx.engine.advance("actor", run.id);
  expect(run.critic!.oiq!.contentHash).not.toBe(first.contentHash);
  expect(run.draftStudio!.versions[1].oiq).toEqual(run.critic!.oiq);
  expect(run.canSend || run.canEnroll).toBe(false);
});
it("revises company-name substitution once and blocks it after retry exhaustion", async () => {
  const ctx = await setup(),
    original = ctx.model.structured.bind(ctx.model);
  ctx.model.structured = async (stage, schema, instruction, context, usage) => {
    const value = await original(stage, schema, instruction, context, usage);
    if (stage === "QUALITY_REVIEW")
      (
        value as { oiq: { companySwapTest: { equallyRelevant: boolean } } }
      ).oiq.companySwapTest.equallyRelevant = true;
    return value;
  };
  const run = await finish(ctx);
  expect(run.critic!.oiq!.decision).toBe("REVISE");
  expect(run.status).toBe("GENERATION_FAILED");
  expect(ctx.model.calls.filter((s) => s === "SEQUENCE")).toHaveLength(2);
  await expect(
    ctx.engine.mutate("actor", run.id, {
      action: "APPROVE",
      expectedVersion: run.version,
      requestKey: "oiq-denied-approval",
    }),
  ).rejects.toThrow("QUALITY_REVIEW_REQUIRED");
});
it("blocks missing core evidence without spending a rewrite trying to invent it", async () => {
  const ctx = await setup(),
    original = ctx.model.structured.bind(ctx.model);
  ctx.model.structured = async (stage, schema, instruction, context, usage) => {
    const value = await original(stage, schema, instruction, context, usage);
    if (stage === "QUALITY_REVIEW")
      (value as { oiq: { missingCoreEvidence: string[] } }).oiq.missingCoreEvidence = [
        "No evidence supports the core commercial observation",
      ];
    return value;
  };
  const run = await finish(ctx);
  expect(run.critic!.oiq!.decision).toBe("BLOCKED");
  expect(run.draftStudio!.qualityDecision).toBe("BLOCKED");
  expect(ctx.model.calls.filter((s) => s === "SEQUENCE")).toHaveLength(1);
});
it("requires OIQ for legacy unscored drafts and invalidates an old approval rather than grandfathering it", async () => {
  const ctx = await setup();
  let run = await finish(ctx);
  run = await ctx.engine.mutate("actor", run.id, {
    action: "APPROVE",
    expectedVersion: run.version,
    requestKey: "legacy-approval",
  });
  delete run.critic!.oiq;
  const expected = run.version;
  run.version++;
  await ctx.store.change("actor", expected, run);
  const read = await ctx.engine.read("actor", run.id);
  expect(read.draftStudio!.reviewStatus).toBe("INVALIDATED");
  expect(read.draftStudio!.approval).toBeNull();
  expect(read.sequence).toBeNull();
});

it("preserves historical OIQ when an identical regeneration is waiting for a new review", async () => {
  const ctx = await setup();
  let run = await finish(ctx);
  const original = structuredClone(run.critic!.oiq);
  run = await ctx.engine.mutate("actor", run.id, {
    action: "REGENERATE",
    expectedVersion: run.version,
    requestKey: "same-content-regeneration",
  });
  run = await ctx.engine.advance("actor", run.id);
  expect(run.stage).toBe("QUALITY_REVIEW");
  expect(run.critic).toBeNull();
  expect(run.draftStudio!.qualityDecision).toBeNull();
  expect(run.draftStudio!.versions[0].oiq).toEqual(original);
  await expect(
    ctx.engine.mutate("actor", run.id, {
      action: "APPROVE",
      expectedVersion: run.version,
      requestKey: "cannot-approve-old-oiq",
    }),
  ).rejects.toThrow("VERSION_CONFLICT");
});

describe("draft access remains separate from sending — real policies, synthetic records", () => {
  it.each(["EVIDENCE_LED", "INSIGHT_LED"] as const)(
    "completes %s for HOLD with content-only approval",
    async (mode) => {
      const ctx = await setup();
      const { checkWorkforceEligibility } = await import("../safety");
      const { AuditIntegrationStore } = await import("@/test/audit-integration-store");
      const eligibility = (actor: string, input: typeof workforceIntake, now: Date) =>
        checkWorkforceEligibility(actor, input, now, {
          evidence: ctx.evidence,
          integrations: new AuditIntegrationStore(),
        });
      expect((await eligibility("actor", ctx.source.intake, testNow)).status).toBe("HOLD");
      if (mode === "INSIGHT_LED") {
        const source = (await ctx.store.get("actor", ctx.source.id))!;
        const version = source.version++;
        source.prospectResearch!.stages.CONTACT.status = "DATA_UNAVAILABLE";
        source.prospectResearch!.reviewIssues = [
          "No authorized public biography; no role assertions may be made",
        ];
        await ctx.store.change("actor", version, source);
      }
      const engine = new DraftStudioEngine({ ...ctx.deps, eligibility });
      let run = await engine.prepare("actor", ctx.source.id);
      for (let n = 0; n < 6 && run.status === "RUNNING"; n++)
        run = await engine.advance("actor", run.id);
      expect(run.status, run.issues.join("; ")).toBe("READY_FOR_REVIEW");
      expect(run.writingMode).toBe(mode);
      expect(run.eligibility.status).toBe("HOLD");
      expect(run.draftAccess?.status).toBe("DRAFT_ALLOWED");
      expect(run.sequence?.messages).toHaveLength(4);
      expect(run.critic?.oiq?.mode).toBe(mode);
      if (mode === "INSIGHT_LED") {
        expect(run.research.facts).toEqual([]);
        expect(run.critic?.oiq?.references.every((r) => r.kind === "KNOWLEDGE")).toBe(true);
      }
      run = await engine.mutate("actor", run.id, {
        action: "APPROVE",
        expectedVersion: run.version,
        requestKey: "hold-review-only-01",
      });
      expect(run.draftStudio?.approval?.scope).toBe("CONTENT_REVIEW_ONLY");
      expect(run).toMatchObject({ canSend: false, canEnroll: false, approved: false });
      expect((await eligibility("actor", run.intake, testNow)).status).toBe("HOLD");
    },
  );
  it("prepares an insight-led draft directly from synchronized intake with no research provider calls", async () => {
    const ctx = await setup();
    ctx.store.records.clear();
    const run = await ctx.engine.prepareContact("actor", "42");
    expect(run.writingMode).toBe("INSIGHT_LED");
    expect(run.research.sources).toEqual([]);
    expect(ctx.model.calls).toEqual([]);
  });
  it("temporary infrastructure failure hides content but preserves valid versions and approval for recovery", async () => {
    const ctx = await setup();
    let run = await finish(ctx);
    run = await ctx.engine.mutate("actor", run.id, {
      action: "APPROVE",
      expectedVersion: run.version,
      requestKey: "recovery-approval-01",
    });
    const saved = await ctx.store.get("actor", run.id);
    ctx.eligibility.mockRejectedValueOnce(new Error("private database connection failure"));
    const unavailable = await ctx.engine.read("actor", run.id);
    expect(unavailable.sequence).toBeNull();
    expect(unavailable.issues).toEqual(["DRAFT_CONTEXT_UNAVAILABLE"]);
    expect(await ctx.store.get("actor", run.id)).toEqual(saved);
    const recovered = await ctx.engine.read("actor", run.id);
    expect(recovered.sequence).not.toBeNull();
    expect(recovered.draftStudio?.approval).toEqual(saved!.draftStudio!.approval);
  });
});
it("authoritatively missing approved product knowledge invalidates approval, unlike a transient outage", async () => {
  const ctx = await setup();
  const run = await finish(ctx);
  const { NoApprovedKnowledgeError } = await import("../knowledge-agent");
  const engine = new DraftStudioEngine({
    ...ctx.deps,
    knowledge: async () => {
      throw new NoApprovedKnowledgeError();
    },
  });
  const result = await engine.read("actor", run.id);
  expect(result.sequence).toBeNull();
  expect(result.draftStudio?.reviewStatus).toBe("INVALIDATED");
  expect(result.issues).toContain("APPROVED_KNOWLEDGE_REQUIRED");
});
it("uses reviewed company evidence without requiring a public-page title match or asserting verified employment", async () => {
  const ctx = await setup();
  const source = (await ctx.store.get("actor", ctx.source.id))!;
  const version = source.version++;
  source.research.facts = source.research.facts.filter((f) => f.subject === "ACCOUNT");
  source.prospectResearch!.stages.CONTACT.status = "DATA_UNAVAILABLE";
  source.research.gaps.push("Employment is unverified; no person-specific claims");
  await ctx.store.change("actor", version, source);
  const run = await ctx.engine.prepare("actor", source.id);
  expect(run.writingMode).toBe("EVIDENCE_LED");
  expect(run.research.facts.every((f) => f.subject === "ACCOUNT")).toBe(true);
  expect(run.draftStudio?.context.missingInformation.join(" ")).toContain(
    "Employment is unverified",
  );
});
