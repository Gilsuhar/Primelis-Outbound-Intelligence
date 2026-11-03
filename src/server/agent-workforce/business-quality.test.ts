import { afterEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import type { WorkforceRun } from "@/features/agent-workforce/gate-a-contracts";
import { creativeSequenceSchema } from "@/features/agent-workforce/gate-a-contracts";
import { qualityCases, qualityFixture } from "@/test/workforce-quality-fixtures";
import { MemoryEvidenceStore } from "@/test/sales-agent-collection-fixtures";
import {
  syntheticOiqJudgment,
  MemoryWorkforceStore,
  MockWorkforceModel,
  testNow,
  testKnowledge,
  testReader,
  workforceIntake,
} from "@/test/workforce-fixtures";
import { validateResearch, validateSequence } from "./evidence-validation";
import {
  chooseSalesStrategy,
  generatePersonalSequence,
  reviewSequenceWithAi,
} from "./creative-agents";
import { strategyGroundingConcerns } from "./commercial-quality";
import { opportunityPriority, compareOpportunityPriority } from "./opportunity-priority";
import { WorkforceOrchestrator } from "./orchestrator";
import { DraftStudioEngine } from "./draft-studio/engine";
import type { WorkforceModel } from "./openai";

afterEach(() => vi.unstubAllGlobals());
describe("synthetic commercial goldens — editorial targets, not live model evaluation", () => {
  it.each(qualityCases)("preserves actual qualification and grounded summaries for %s", (kind) => {
    const f = qualityFixture(kind);
    expect(validateResearch(f.run, testNow)).toEqual([]);
    expect(f.decision.status).toBe(
      kind === "PAID_SOCIAL" ? "REJECTED" : kind === "HISTORY_HOLD" ? "HOLD" : "READY",
    );
    if (kind === "PAID_SOCIAL" || kind === "HISTORY_HOLD") expect(f.run.sequence).toBeNull();
    else {
      expect(validateSequence(f.run, creativeSequenceSchema.parse(f.sequence))).toEqual([]);
      expect(f.run.strategy?.angle).toBe(f.expected.angle);
      expect(f.run.strategy?.companyRationale).toBe(f.expected.companyWhy);
      expect(f.run.strategy?.prospectRationale).toBe(f.expected.personWhy);
      expect(f.sequence.messages.every((m) => m.body.split(/\s+/).length < 120)).toBe(true);
    }
    expect(f.run.research.gaps).toContain(
      "No first-party Google Ads measurement; no Similarweb metrics",
    );
    expect(f.sequence.approved || f.sequence.canSend || f.sequence.canEnroll).toBe(false);
  });
  it.each(["ECOMMERCE", "SAAS", "FINANCIAL"] as const)(
    "passes distinct, source-linked %s context and decision rubric through the actual agents, using scripted outputs only",
    async (kind) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(() => {
          throw new Error("LIVE_PROVIDER_FORBIDDEN");
        }),
      );
      const f = qualityFixture(kind),
        prompts: string[] = [];
      const model: WorkforceModel = {
        discover: async () => {
          throw new Error("LIVE_DISCOVERY_FORBIDDEN");
        },
        structured: async <T>(
          stage: string,
          schema: z.ZodType<T>,
          instruction: string,
          context: unknown,
        ) => {
          prompts.push(instruction);
          expect(instruction).toContain("why replying would be useful");
          expect(JSON.stringify(context)).toContain(f.expected.business);
          expect(JSON.stringify(context)).toContain(f.expected.remit);
          expect(JSON.stringify(context)).not.toContain(
            kind === "SAAS" ? "Maya Chen" : "Elliot Reed",
          );
          return schema.parse(
            stage === "STRATEGY"
              ? f.run.strategy
              : stage === "SEQUENCE"
                ? f.sequence
                : {
                    oiq: syntheticOiqJudgment(["account:business", "prospect:remit"]),
                    verdict: "PASS",
                    checks: {
                      factualAccuracy: true,
                      sourceGrounding: true,
                      prospectRelevance: true,
                      nonRepetitive: true,
                      naturalLanguage: true,
                      commercialUsefulness: true,
                      approvedClaimsOnly: true,
                      originality: true,
                      strategicFit: true,
                    },
                    checkedSteps: [1, 2, 3, 4],
                    unsupportedAssertions: [],
                    concerns: [],
                  },
          );
        },
      };
      f.run.strategy = await chooseSalesStrategy(f.run, model);
      f.run.sequence = await generatePersonalSequence(f.run, model);
      expect((await reviewSequenceWithAi(f.run, model, testNow)).verdict).toBe("PASS");
      expect(prompts[1]).toContain("do not stack a meeting");
      expect(prompts[2]).toContain("question is not a license");
      expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    },
  );
  it("rejects title-only strategies without inventing an account problem", () => {
    const { run } = qualityFixture("SAAS");
    run.strategy!.supportingFactIds = ["prospect:position"];
    expect(strategyGroundingConcerns(run, run.strategy!)).toEqual([
      expect.stringContaining("title alone"),
    ]);
  });
  it.each([
    [
      "unsupported savings",
      "We will reduce your branded search cost by 42%.",
      /unsupported number/,
    ],
    [
      "invented advertiser",
      "We observed competitor ads on your brand searches.",
      /without cited SERP evidence/,
    ],
    ["generic compliment", "I am impressed by your growth and success.", /non-generic/],
    ["empty follow-up", "Just checking in on this.", /non-generic/],
    [
      "persistent pattern",
      "Competitors consistently bid on your branded searches.",
      /single SERP snapshot/,
    ],
    ["universal absence", "No competitors bid on your brand.", /single SERP snapshot/],
  ])("withholds %s even when the assertion ledger omits it", (_label, body, issue) => {
    const { run, sequence } = qualityFixture("SAAS");
    sequence.messages[1].body = body as string;
    expect(validateSequence(run, sequence).join(" ")).toMatch(issue as RegExp);
  });
  it("rejects repeated commercial arguments, while allowing short shared salutations and an unpressured closing", () => {
    const { run, sequence } = qualityFixture("FINANCIAL");
    const repeat =
      "Would a short exchange about the decision criteria and measurement tradeoffs be useful for your team?";
    sequence.messages[0].body += " " + repeat;
    sequence.messages[1].body += " " + repeat;
    expect(validateSequence(run, sequence).join(" ")).toContain("repeat a substantive sentence");
    const original = qualityFixture("FINANCIAL");
    original.sequence.messages.forEach((m) => {
      m.body = "Hi Nadia,\n\n" + m.body + "\n\nGil";
    });
    expect(validateSequence(original.run, original.sequence)).toEqual([]);
  });
  it("requests a bounded revision for repetitive writing even if the mocked critic incorrectly says PASS", async () => {
    const model = new MockWorkforceModel(),
      original = model.structured.bind(model);
    let sequences = 0;
    model.structured = async (stage, schema, instruction, context, usage) => {
      const result = await original(stage, schema, instruction, context, usage);
      if (stage === "SEQUENCE" && sequences++ === 0) {
        const s = result as unknown as WorkforceRun["sequence"];
        for (const i of [0, 1])
          s!.messages[i].body +=
            " Would a short discussion of the decision criteria and measurement tradeoffs be useful for your team?";
      }
      return result;
    };
    const engine = new WorkforceOrchestrator({
      store: new MemoryWorkforceStore(),
      model,
      knowledge: async () => testKnowledge,
      reader: testReader(),
      eligibility: async () => ({ status: "READY", reasons: [], blockDrafting: false }),
      now: () => testNow,
    });
    let run = await engine.start("synthetic-operator", {
      idempotencyKey: "synthetic-repetition-0001",
      intake: workforceIntake,
    });
    for (let i = 0; i < 12 && run.status === "RUNNING"; i++)
      run = await engine.advance("synthetic-operator", run.id);
    expect(run.status).toBe("READY_FOR_REVIEW");
    expect(run.revisionAttempts).toBe(1);
    expect(sequences).toBe(2);
    expect(run.approved || run.canSend || run.canEnroll).toBe(false);
  });
  it.each(["PAID_SOCIAL"] as const)(
    "never drafts %s regardless of commercial opportunity strength",
    async (kind) => {
      const f = qualityFixture(kind),
        evidence = new MemoryEvidenceStore(),
        store = new MemoryWorkforceStore(),
        model = new MockWorkforceModel();
      await evidence.save("synthetic-operator", [f.snapshot]);
      store.records.set(`synthetic-operator:${f.run.id}`, structuredClone(f.run));
      const studio = new DraftStudioEngine({
        evidence,
        store,
        model: () => model,
        knowledge: async () => testKnowledge,
        eligibility: async () => f.run.eligibility,
        now: () => testNow,
      });
      await expect(studio.prepare("synthetic-operator", f.run.id)).rejects.toThrow(
        "DRAFT_ELIGIBILITY_HOLD",
      );
      expect(model.calls).toEqual([]);
      expect(f.run.sequence).toBeNull();
    },
  );
});

describe("opportunity priority never grants eligibility", () => {
  it("ranks an observed HOLD opportunity above an unobserved eligible hypothesis without changing either decision", () => {
    const hold = qualityFixture("HISTORY_HOLD"),
      eligible = qualityFixture("SAAS");
    const high = opportunityPriority(hold.run, testNow),
      medium = opportunityPriority(eligible.run, testNow);
    expect(high.level).toBe("OBSERVED_SIGNAL");
    expect(medium.level).toBe("GROUNDED_HYPOTHESIS");
    expect(compareOpportunityPriority(high, medium)).toBeLessThan(0);
    expect(hold.decision.status).toBe("HOLD");
    expect(hold.run.eligibility.blockDrafting).toBe(true);
    expect(high).not.toHaveProperty("score");
    expect(high).not.toHaveProperty("meetingProbability");
  });
  it.each(["stale", "unreviewed", "bad-citation", "title-only", "low-confidence", "stale-serp"])(
    "does not promote %s opportunity evidence",
    (condition) => {
      const { run } = qualityFixture("ECOMMERCE");
      if (condition === "stale") run.prospectResearch!.expiresAt = "2026-10-14T00:00:00Z";
      if (condition === "unreviewed") run.prospectResearch!.stages.REVIEW.status = "WAITING";
      if (condition === "bad-citation")
        run.prospectResearch!.opportunity!.supportingFactIds.push("other-contact:fact");
      if (condition === "title-only")
        run.prospectResearch!.opportunity!.supportingFactIds = ["prospect:position"];
      if (condition === "low-confidence") run.prospectResearch!.opportunity!.confidence = "LOW";
      if (condition === "stale-serp")
        run.prospectResearch!.serp[0].observedAt = "2026-10-13T00:00:00Z";
      expect(opportunityPriority(run, testNow).level).toBe("RESEARCH_REQUIRED");
    },
  );
});

it("stops title-only strategy in the real orchestrator before any writing call", async () => {
  const model = new MockWorkforceModel(),
    original = model.structured.bind(model);
  model.structured = async (stage, schema, instruction, context, usage) => {
    const result = await original(stage, schema, instruction, context, usage);
    if (stage === "STRATEGY")
      (result as NonNullable<WorkforceRun["strategy"]>).supportingFactIds = ["prospect:position"];
    return result;
  };
  const engine = new WorkforceOrchestrator({
    store: new MemoryWorkforceStore(),
    model,
    knowledge: async () => testKnowledge,
    reader: testReader(),
    eligibility: async () => ({ status: "READY", reasons: [], blockDrafting: false }),
    now: () => testNow,
  });
  let run = await engine.start("synthetic-operator", {
    idempotencyKey: "synthetic-title-only-0001",
    intake: workforceIntake,
  });
  for (let i = 0; i < 10 && run.status === "RUNNING"; i++)
    run = await engine.advance("synthetic-operator", run.id);
  expect(run.status).toBe("INSUFFICIENT_EVIDENCE");
  expect(run.issues.join(" ")).toContain("title alone");
  expect(model.calls).not.toContain("SEQUENCE");
});
