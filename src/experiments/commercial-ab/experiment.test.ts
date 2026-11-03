// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeSyntheticExperiment } from "@/test/synthetic-experiment-artifacts";
import { z } from "zod";
import {
  ExperimentBudget,
  CAP_NANO_USD,
  MAX_RESERVED_NANO_USD,
  MODEL,
  OUTPUT_LIMITS,
  reserveCost,
  NUTRAFOL_CAP_NANO_USD,
  NUTRAFOL_MAX_RESERVED_NANO_USD,
  CONTINUATION_MAX_RESERVED_NANO_USD,
  type Stage,
} from "./budget";
import {
  PRODUCT_INPUT,
  MODE,
  prepareComparison,
  evidenceRun,
  executeComparison,
  executeNutrafolDemonstration,
  prepareNutrafolDemonstration,
  NUTRAFOL_E1,
  HISTORICAL_RESERVATION_NANO_USD,
  experimentInstruction,
  experimentContext,
  prepareNutrafolContinuation,
  executeNutrafolContinuation,
  CONTINUATION_HISTORICAL_RESERVATION_NANO_USD,
} from "./experiment";
import { generatePersonalSequence } from "@/server/agent-workforce/creative-agents";
import { validateResearch } from "@/server/agent-workforce/evidence-validation";
import {
  loadApprovedProductKnowledge,
  NoApprovedKnowledgeError,
} from "@/server/agent-workforce/knowledge-agent";
import type { MinimalPrismaClient } from "@/lib/prisma";
import { OpenAiWorkforceModel, type WorkforceModel } from "@/server/agent-workforce/openai";
import { withBudgetContext } from "@/server/agent-workforce/daily/budget";
import { DailyStore, dailyConfig } from "@/server/agent-workforce/daily/state";
import { initialDailyState, type DailyState } from "@/features/agent-workforce/daily/contracts";
import type { WorkforceRun } from "@/features/agent-workforce/gate-a-contracts";
import { MockWorkforceModel } from "@/test/workforce-fixtures";

vi.mock(
  "./historical-bindings",
  async () => (await import("@/test/synthetic-experiment-artifacts")).syntheticExperimentBindings,
);
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T20:00:00.000Z"));
});
const dirs: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function continuationFixtureRoot() {
  return demoFixtureRoot("continuation");
}

it.each([
  ["outputs/product-demonstration/commercial-ab/nutrafol-evidence.json", "EVIDENCE_CHANGED"],
  ["src/experiments/commercial-ab/budget.ts", "REVIEWED_SOURCE_CHANGED"],
])("rejects changed bytes in the synthetic comparison: %s", (file, reason) => {
  const root = demoFixtureRoot();
  writeFileSync(join(root, file), readFileSync(join(root, file), "utf8") + " ");
  expect(() => prepareComparison(root)).toThrow(reason);
});
it("rejects changed product bytes in the synthetic continuation", () => {
  const root = continuationFixtureRoot();
  writeFileSync(join(root, "fixtures/synthetic-tech-deck.txt"), "changed synthetic product input");
  expect(() => prepareNutrafolContinuation(root)).toThrow("PRODUCT_SOURCE_CHANGED");
});

describe("Nutrafol writing/review continuation", () => {
  it("binds the saved decisions, source files and current implementation without changing history", () => {
    const root = continuationFixtureRoot();
    const prepared = prepareNutrafolContinuation(root);
    expect(prepared.checkpoint.grounding.supportedFactIds).toEqual(["E1", "E2", "E3"]);
    expect(prepared.directory).toContain("nutrafol-writing-continuation-v1");
    const run = evidenceRun(prepared.packets[0]);
    expect(run.eligibility.status).toBe("HOLD");
    expect([run.approved, run.canSend, run.canEnroll]).toEqual([false, false, false]);
    const file = join(root, "src/server/agent-workforce/commercial-brief.ts");
    writeFileSync(file, readFileSync(file, "utf8") + "\n// offline change");
    expect(prepareNutrafolContinuation(root).binding).not.toBe(prepared.binding);
  });

  it("compacts only duplicate reviewer context, preserving contradictions and exact evidence", () => {
    const prepared = prepareNutrafolContinuation(continuationFixtureRoot());
    const run = evidenceRun(prepared.packets[0]);
    const task = {
      strategy: prepared.checkpoint.strategy,
      sequence: { strategy: structuredClone(prepared.checkpoint.strategy), messages: ["fixture"] },
      research: run.research,
    };
    const compact = experimentContext(
      "QUALITY_REVIEW",
      task,
      prepared.packets[0],
      prepared.sources,
      true,
    );
    expect(compact.task).toEqual({
      strategy: task.strategy,
      sequence: { messages: ["fixture"] },
      research: run.research,
    });
    expect(compact.experiment).not.toHaveProperty("evidence");
    expect(compact.experiment).toHaveProperty(
      "screenshotObservation",
      prepared.packets[0].screenshotObservation,
    );
    task.sequence.strategy.hypothesis = "Contradictory unsupported writer strategy";
    expect(
      experimentContext("QUALITY_REVIEW", task, prepared.packets[0], prepared.sources, true).task,
    ).toEqual(task); // independent reviewer must see the discrepancy
  });

  it.each([
    "commercial-ab/aggregate-spend.jsonl",
    "nutrafol-writing-demo-v1/aggregate-spend.jsonl",
    "nutrafol-writing-demo-v1/corrected-nutrafol-evidence.json",
    "nutrafol-writing-demo-v1/internal-writing-results.json",
  ])("rejects changed historical input before network: %s", (relative) => {
    const root = continuationFixtureRoot();
    const file = join(root, "outputs/product-demonstration", relative);
    writeFileSync(file, readFileSync(file, "utf8") + "\n");
    expect(() => prepareNutrafolContinuation(root)).toThrow("CHECKPOINT_CHANGED");
  });

  it.each(["EVIDENCE_VALIDATION", "STRATEGY", "QUALITY_REVIEW"] as Stage[])(
    "rejects forbidden or premature stage %s without counting or spending",
    async (stage) => {
      const net = network();
      const b = new ExperimentBudget(location(), approval, net, "NUTRAFOL_CONTINUATION");
      try {
        expect(() => b.forSlot("harborledger:A:SEQUENCE")).toThrow("SLOT_INVALID");
        expect(() => b.forSlot("nutrafol:B:SEQUENCE")).toThrow("SLOT_INVALID");
        expect(() => b.forSlot("nutrafol:shared:EVIDENCE_VALIDATION")).toThrow("SLOT_INVALID");
        await expect(b.fetch(endpoint, request(stage))).rejects.toThrow("STAGE_ORDER");
        expect(net).not.toHaveBeenCalled();
      } finally {
        b.close();
      }
    },
  );

  it.each(["complete", "writer-interrupted", "review-interrupted", "review-oversized"])(
    "runs only writer and independent reviewer through the real guard with offline transport: %s",
    async (scenario) => {
      const root = continuationFixtureRoot();
      const prepared = prepareNutrafolContinuation(root);
      const historical = prepared.checkpoint.files.map(([file]) =>
        readFileSync(join(root, "outputs/product-demonstration", file), "utf8"),
      );
      const calls: string[] = [];
      const sizes: number[] = [];
      const mock = new MockWorkforceModel();
      const net = vi.fn<typeof fetch>(async (url, init) => {
        if (String(url).endsWith("/input_tokens"))
          return Response.json({ object: "response.input_tokens", input_tokens: 4000 });
        const body = JSON.parse(init!.body as string);
        const stage = body.text.format.name.toUpperCase();
        calls.push(stage);
        sizes.push(Buffer.byteLength(init!.body as string, "utf8") + 4096);
        const { task } = JSON.parse(body.input);
        expect(task.intake.prospectName).toBe("Generic fictional recipient");
        expect(task.strategy).toEqual(prepared.checkpoint.strategy);
        expect(task.knowledge).toEqual(PRODUCT_INPUT);
        if (
          (stage === "SEQUENCE" && scenario === "writer-interrupted") ||
          (stage === "QUALITY_REVIEW" && scenario === "review-interrupted")
        )
          throw new Error("Offline interruption; never retry");
        const output = await mock.structured(stage, z.any(), "", task, []);
        if (stage === "SEQUENCE") {
          output.strategy = task.strategy;
          if (scenario === "review-oversized")
            for (const message of output.messages) message.body = "x".repeat(6000);
        } else {
          // Deliberately reject synthetic copy. Completion never grants factual acceptance.
          output.verdict = "HOLD";
          output.checks.factualAccuracy = false;
          output.unsupportedAssertions = ["Offline synthetic copy is not evidence."];
        }
        return Response.json({
          model: MODEL,
          service_tier: "default",
          status: "completed",
          usage: { input_tokens: 4000, output_tokens: 1000 },
          output_text: JSON.stringify(output),
        });
      });
      vi.stubEnv("INTEGRATION_OPERATOR_USER_ID", "offline-only");
      vi.stubEnv("CI", "");
      vi.stubEnv("VERCEL", "");
      vi.stubEnv("NODE_ENV", "test");
      const options = {
        root,
        executionApproved: true,
        approvedBinding: prepared.binding,
        apiKey: "OFFLINE_TEST_ONLY",
        network: net,
        budgetReceipt: {
          checkedAt: new Date().toISOString(),
          dailyRemainingNanoUsd: 1e9,
          monthlyRemainingNanoUsd: 5e9,
          pendingRequests: 0,
        },
      };
      await expect(
        executeNutrafolContinuation({ ...options, executionApproved: false }),
      ).rejects.toThrow("NOT_APPROVED");
      await expect(
        executeNutrafolContinuation({ ...options, approvedBinding: "f".repeat(64) }),
      ).rejects.toThrow("BINDING_CHANGED");
      for (const change of [{ pendingRequests: 1 }, { checkedAt: "2000-01-01T00:00:00Z" }])
        await expect(
          executeNutrafolContinuation({
            ...options,
            budgetReceipt: { ...options.budgetReceipt, ...change },
          }),
        ).rejects.toThrow("PREFLIGHT_REQUIRED");
      await expect(
        executeNutrafolContinuation({
          ...options,
          budgetReceipt: {
            ...options.budgetReceipt,
            dailyRemainingNanoUsd:
              CONTINUATION_MAX_RESERVED_NANO_USD + CONTINUATION_HISTORICAL_RESERVATION_NANO_USD - 1,
          },
        }),
      ).rejects.toThrow("INSUFFICIENT");
      expect(net).not.toHaveBeenCalled();
      const execution = executeNutrafolContinuation(options);
      if (scenario === "complete") expect((await execution).completed).toBe(true);
      else await expect(execution).rejects.toThrow("NO_RETRY");
      expect(calls).toEqual(
        ["writer-interrupted", "review-oversized"].includes(scenario)
          ? ["SEQUENCE"]
          : ["SEQUENCE", "QUALITY_REVIEW"],
      );
      expect(sizes.every((size) => size <= 33000)).toBe(true);
      const journalPath = join(prepared.directory, "aggregate-spend.jsonl");
      const journal = readFileSync(journalPath, "utf8");
      expect(JSON.parse(journal.split("\n")[0]).capNanoUsd).toBe(100000000);
      expect(journal).not.toMatch(/OFFLINE_TEST_ONLY|Bearer/);
      const results = JSON.parse(
        readFileSync(join(prepared.directory, "internal-writing-results.json"), "utf8"),
      );
      expect(results.approvedForOutreach).toBe(false);
      expect(results.rows[0].execution).toBe("REUSED_VERIFIED_CHECKPOINT_NOT_A_NEW_CALL");
      expect(results.rows[0].usage).toEqual([]);
      expect(results.reservedNanoUsd).toBe(calls.length === 2 ? 94095000 : 52785000);
      const row = results.rows.find((r: { label?: string }) => r.label === "INTERNAL_ONLY");
      if (scenario === "complete") {
        expect(row.sequence.messages).toHaveLength(4);
        expect(row.independentReview.verdict).toBe("HOLD");
        expect(row.factualGatePassed).toBe(false);
      } else expect(row.independentReview).toBe("NOT_EXECUTED");
      await expect(executeNutrafolContinuation(options)).rejects.toThrow();
      expect(calls.length).toBeLessThanOrEqual(2);
      expect(
        prepared.checkpoint.files.map(([file]) =>
          readFileSync(join(root, "outputs/product-demonstration", file), "utf8"),
        ),
      ).toEqual(historical);
    },
  );

  it("permits exactly two ordered calls with retained reserves below $0.10; blocks a third", async () => {
    const net = network();
    const b = new ExperimentBudget(location(), approval, net, "NUTRAFOL_CONTINUATION");
    try {
      await b.forSlot("nutrafol:A:SEQUENCE")(endpoint, request("SEQUENCE"));
      await b.forSlot("nutrafol:A:QUALITY_REVIEW")(endpoint, request("QUALITY_REVIEW"));
      expect(b.reservedNanoUsd).toBe(94095000);
      expect(CONTINUATION_MAX_RESERVED_NANO_USD).toBe(94095000);
      await expect(b.fetch(endpoint, request("SEQUENCE", "third"))).rejects.toThrow("STAGE_LIMIT");
      expect(net).toHaveBeenCalledTimes(4); // two non-generative counts, two generations
    } finally {
      b.close();
    }
  });
});
function location() {
  const dir = mkdtempSync(join(tmpdir(), "signal-ab-test-"));
  dirs.push(dir);
  return join(dir, "spend.jsonl");
}
const approval = {
  executionApproved: true,
  binding: "a".repeat(64),
  dailyRemainingNanoUsd: 1e9,
  monthlyRemainingNanoUsd: 5e9,
};
function request(stage: Stage = "STRATEGY", input = "fictional input") {
  return {
    method: "POST",
    redirect: "error" as const,
    headers: { Authorization: "Bearer TEST_ONLY_DO_NOT_STORE" },
    body: JSON.stringify({
      model: MODEL,
      store: false,
      max_output_tokens: OUTPUT_LIMITS[stage],
      reasoning: { effort: "low" },
      instructions: "fixture instruction",
      input,
      text: {
        format: {
          type: "json_schema",
          name: stage.toLowerCase(),
          strict: true,
          schema: {
            type: "object",
            properties: { ok: { type: "boolean" } },
            required: ["ok"],
            additionalProperties: false,
          },
        },
      },
    }),
  };
}
function network(options: { failure?: string; inputTokens?: number; countedTokens?: number } = {}) {
  return vi.fn<typeof fetch>(async (url) => {
    if (String(url).endsWith("/input_tokens"))
      return Response.json({
        object: "response.input_tokens",
        input_tokens: options.countedTokens ?? 50,
      });
    if (options.failure === "throw")
      throw new Error("Bearer TEST_ONLY_DO_NOT_STORE sensitive payload");
    if (options.failure === "http")
      return new Response("Bearer TEST_ONLY_DO_NOT_STORE", { status: 500 });
    return Response.json({
      model: MODEL,
      service_tier: "default",
      status: "completed",
      output_text: '{"ok":true}',
      ...(options.failure === "usage"
        ? {}
        : { usage: { input_tokens: options.inputTokens ?? 50, output_tokens: 20 } }),
    });
  });
}
const endpoint = "https://api.openai.com/v1/responses";

describe("finite $1 experiment reservation guard", () => {
  it("reserves all 21 worst-case calls below $1, without refunding actual usage; denies call 22", async () => {
    const net = network(),
      path = location(),
      b = new ExperimentBudget(path, approval, net);
    try {
      for (const [stage, count] of Object.entries({
        EVIDENCE_VALIDATION: 3,
        STRATEGY: 6,
        SEQUENCE: 6,
        QUALITY_REVIEW: 6,
      })) {
        for (let i = 0; i < count; i++)
          await b.fetch(endpoint, request(stage as Stage, `${stage} ${i}`));
      }
      expect(MAX_RESERVED_NANO_USD).toBe(977670000);
      expect(b.reservedNanoUsd).toBe(MAX_RESERVED_NANO_USD);
      expect(b.reservedNanoUsd).toBeLessThan(CAP_NANO_USD);
      await expect(b.fetch(endpoint, request("STRATEGY", "one too many"))).rejects.toThrow(
        "STAGE_LIMIT",
      );
      expect(net.mock.calls.filter(([url]) => url === endpoint)).toHaveLength(21);
      const journal = readFileSync(path, "utf8");
      expect(journal).not.toContain("TEST_ONLY_DO_NOT_STORE");
      expect(journal).not.toContain("fictional input");
    } finally {
      b.close();
    }
  });
  it.each(["throw", "http", "usage"])(
    "retains uncertain charges and blocks retries on %s",
    async (failure) => {
      const net = network({ failure }),
        path = location(),
        b = new ExperimentBudget(path, approval, net);
      try {
        await expect(b.fetch(endpoint, request())).rejects.toThrow("EXPERIMENT_");
        expect(b.reservedNanoUsd).toBe(reserveCost("STRATEGY"));
        await expect(b.fetch(endpoint, request())).rejects.toThrow("STOPPED_OR_BUSY");
        expect(net).toHaveBeenCalledTimes(2); // one count, one generation, zero retry
        expect(readFileSync(path, "utf8")).not.toMatch(/Bearer|TEST_ONLY|sensitive payload/);
      } finally {
        b.close();
      }
      expect(() => new ExperimentBudget(path, approval, net)).toThrow(); // no reset after failure
    },
  );
  it("flushes reservation before dispatch and leaves interruption unreplayable", async () => {
    const path = location();
    const net = vi.fn<typeof fetch>(async (url) => {
      if (String(url).endsWith("/input_tokens"))
        return Response.json({ object: "response.input_tokens", input_tokens: 1 });
      expect(readFileSync(path, "utf8")).toContain('"event":"RESERVED"');
      expect(() => new ExperimentBudget(path, approval, network())).toThrow();
      throw new Error("simulated interruption");
    });
    const b = new ExperimentBudget(path, approval, net);
    await expect(b.fetch(endpoint, request())).rejects.toThrow();
    b.close();
    expect(() => new ExperimentBudget(path, approval, net)).toThrow();
    const partial = location();
    writeFileSync(partial, '{"event":');
    expect(() => new ExperimentBudget(partial, approval, net)).toThrow();
  });
  it("refuses absent approval, insufficient account balance and duplicate requests", async () => {
    expect(
      () => new ExperimentBudget(location(), { ...approval, executionApproved: false }),
    ).toThrow("NOT_APPROVED");
    expect(
      () => new ExperimentBudget(location(), { ...approval, dailyRemainingNanoUsd: 977669999 }),
    ).toThrow("INSUFFICIENT");
    const net = network(),
      b = new ExperimentBudget(location(), approval, net);
    try {
      await b.fetch(endpoint, request());
      await expect(b.fetch(endpoint, request())).rejects.toThrow("REPLAY_DENIED");
      expect(net).toHaveBeenCalledTimes(2);
    } finally {
      b.close();
    }
  });
  it.each([
    { model: "gpt-other" },
    { tools: [{ type: "web_search" }] },
    { max_output_tokens: 999999 },
    { input: [{ type: "input_image", image_url: "https://example.com" }] },
    { previous_response_id: "old" },
    { reasoning: { effort: "high" } },
    { service_tier: "priority" },
    { input: "x".repeat(33000) },
  ])(
    "rejects model, tool, context or output expansion before any network call: %j",
    async (changes) => {
      const net = network(),
        b = new ExperimentBudget(location(), approval, net);
      const req = request();
      req.body = JSON.stringify({ ...JSON.parse(req.body), ...changes });
      try {
        await expect(b.fetch(endpoint, req)).rejects.toThrow("EXPERIMENT_");
        expect(net).not.toHaveBeenCalled();
      } finally {
        b.close();
      }
    },
  );
  it("blocks uncertain token counts before generation; preserves schema in the count request", async () => {
    const net = network({ countedTokens: 30000 }),
      b = new ExperimentBudget(location(), approval, net);
    try {
      await expect(b.fetch(endpoint, request())).rejects.toThrow("INPUT_LIMIT");
      expect(net).toHaveBeenCalledTimes(1);
      const body = JSON.parse(net.mock.calls[0][1]!.body as string);
      expect(body.text.format.schema.properties).toHaveProperty("ok");
      expect(body.reasoning).toEqual({ effort: "low" });
      expect(b.reservedNanoUsd).toBe(0);
    } finally {
      b.close();
    }
  });
  it("fails closed on a provider input-bound violation and retains the reservation", async () => {
    const net = network({ inputTokens: 5000 }),
      b = new ExperimentBudget(location(), approval, net);
    try {
      await expect(b.fetch(endpoint, request())).rejects.toThrow("BOUND_VIOLATION");
      expect(b.reservedNanoUsd).toBe(reserveCost("STRATEGY"));
      await expect(b.fetch(endpoint, request("SEQUENCE"))).rejects.toThrow("STOPPED");
    } finally {
      b.close();
    }
  });
  it("permits one concurrent request only", async () => {
    let release!: (response: Response) => void;
    const net = vi.fn<typeof fetch>(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const b = new ExperimentBudget(location(), approval, net);
    const first = b.fetch(endpoint, request());
    await expect(b.fetch(endpoint, request("SEQUENCE"))).rejects.toThrow("BUSY");
    release(new Response("", { status: 503 }));
    await expect(first).rejects.toThrow("TOKEN_COUNT_FAILED");
    b.close();
  });
});

it("keeps the exact three internal statements separate from the production approval loader", async () => {
  expect(PRODUCT_INPUT.map((k) => k.text)).toEqual([
    "Signal monitors branded Google search results to identify advertiser presence.",
    "Where configured, Signal can lower bids or pause and reactivate branded ads as competitor conditions change.",
    "Signal uses blended click-through and conversion data to guide bidding decisions and monitor performance.",
  ]);
  expect(PRODUCT_INPUT.every((k) => k.restrictions.includes(MODE) && k.kind === "PRODUCT")).toBe(
    true,
  );
  const db = {
    $queryRaw: vi.fn().mockResolvedValue(PRODUCT_INPUT),
    caseStudy: { findMany: vi.fn().mockResolvedValue([]) },
  };
  await expect(
    loadApprovedProductKnowledge(db as unknown as MinimalPrismaClient),
  ).rejects.toBeInstanceOf(NoApprovedKnowledgeError);
});

it("prepares unchanged packets with explicitly reviewed offline-copy source hashes and keeps HOLD", () => {
  const prepared = prepareComparison(demoFixtureRoot());
  expect(prepared.packets.map((p) => p.id)).toEqual(["nutrafol", "lumatrail", "harborledger"]);
  expect(prepared.sources.every((s) => /^[a-f0-9]{64}$/.test(s.sha256))).toBe(true);
  for (const packet of prepared.packets) {
    const run = evidenceRun(packet);
    expect(
      validateResearch(run, new Date("2026-10-20T20:00:00Z"), { company: true, prospect: false }),
    ).toEqual([]);
    expect(run.eligibility.status).toBe("HOLD");
    expect([run.approved, run.canSend, run.canEnroll]).toEqual([false, false, false]);
  }
});
it("cannot execute without a new approval, even if other inputs are provided", async () => {
  const net = network();
  await expect(
    executeComparison({
      root: process.cwd(),
      executionApproved: false,
      approvedBinding: "",
      apiKey: "",
      budgetReceipt: {
        checkedAt: "",
        dailyRemainingNanoUsd: 0,
        monthlyRemainingNanoUsd: 0,
        pendingRequests: 0,
      },
      network: net,
    }),
  ).rejects.toThrow("EXECUTION_NOT_APPROVED");
  expect(net).not.toHaveBeenCalled();
});

it("wraps the existing OpenAI transport with zero retries and no database writes", async () => {
  class MemoryDaily extends DailyStore {
    state = initialDailyState();
    async change<T>(_actor: string, f: (state: DailyState) => T): Promise<T> {
      return f(this.state);
    }
  }
  vi.stubEnv("INTEGRATION_OPERATOR_USER_ID", "experiment-fixture");
  const net = network(),
    b = new ExperimentBudget(location(), approval, net);
  const model = new OpenAiWorkforceModel(
    {
      AI_PROVIDER: "openai",
      NODE_ENV: "test",
      OPENAI_API_KEY: "TEST_ONLY_DO_NOT_STORE",
      OPENAI_MODEL: MODEL,
      WORKFORCE_MODEL_PRICES_JSON: JSON.stringify({ [MODEL]: { input: 0.75, output: 4.5 } }),
    },
    b.fetch,
  );
  const usage: WorkforceRun["usage"] = [];
  try {
    const result = await withBudgetContext(
      {
        actor: "experiment-fixture",
        store: new MemoryDaily(),
        config: dailyConfig({
          NODE_ENV: "test",
          WORKFORCE_MAX_RETRIES: "0",
          WORKFORCE_DAILY_BUDGET_USD: "1",
          WORKFORCE_MONTHLY_BUDGET_USD: "5",
        }),
      },
      () => model.structured("STRATEGY", z.object({ ok: z.boolean() }), "fixture", {}, usage),
    );
    expect(result).toEqual({ ok: true });
    expect(usage[0].attempts).toBe(1);
    const dispatch = JSON.parse(net.mock.calls[1][1]!.body as string);
    expect(dispatch.service_tier).toBe("default");
    expect(dispatch.truncation).toBe("disabled");
  } finally {
    b.close();
  }
});

it("runs the three frozen pairs through existing components and independent review using offline transport only", async () => {
  const root = demoFixtureRoot("comparison");
  const base = "outputs/product-demonstration/commercial-ab";
  const prepared = prepareComparison(root);
  const calls: { stage: string; context: Record<string, unknown> }[] = [];
  const mock = new MockWorkforceModel();
  const net = vi.fn<typeof fetch>(async (url, init) => {
    if (String(url).endsWith("/input_tokens"))
      return Response.json({ object: "response.input_tokens", input_tokens: 3000 });
    const body = JSON.parse(init!.body as string);
    const stage = body.text.format.name.toUpperCase();
    const { task: context } = JSON.parse(body.input);
    calls.push({ stage, context });
    let output;
    if (stage === "EVIDENCE_VALIDATION") {
      output = {
        supportedFactIds: context.research.facts.map((f: { id: string }) => f.id),
        rejectedFactIds: [],
        identityMatches: true,
        concerns: [],
      };
    } else {
      output = await mock.structured(stage, z.any(), "", context, []);
      if (stage === "STRATEGY") output.supportingFactIds = [context.research.facts[0].id];
      if (stage === "QUALITY_REVIEW") {
        // Deliberately reject the stock fixture's unsupported company/product copy.
        output.verdict = "HOLD";
        output.checks.factualAccuracy = false;
        output.unsupportedAssertions = ["Offline fixture copy is not supported by these packets."];
      }
    }
    return Response.json({
      model: MODEL,
      service_tier: "default",
      status: "completed",
      usage: { input_tokens: 3000, output_tokens: 1000 },
      output_text: JSON.stringify(output),
    });
  });
  vi.stubEnv("INTEGRATION_OPERATOR_USER_ID", "offline-experiment-only");
  vi.stubEnv("CI", "");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("NODE_ENV", "test");
  const result = await executeComparison({
    root,
    executionApproved: true,
    approvedBinding: prepared.binding,
    apiKey: "FICTIONAL_TEST_KEY",
    budgetReceipt: {
      checkedAt: new Date().toISOString(),
      dailyRemainingNanoUsd: 1e9,
      monthlyRemainingNanoUsd: 5e9,
      pendingRequests: 0,
    },
    network: net,
  });
  expect(result.completed).toBe(true);
  expect(calls).toHaveLength(21);
  expect(calls.filter((c) => c.stage === "QUALITY_REVIEW")).toHaveLength(6);
  for (const c of calls.filter((c) => c.stage === "QUALITY_REVIEW")) {
    expect(c.context).not.toHaveProperty("commercialBrief");
    expect(c.context).not.toHaveProperty("label");
    expect(c.context).not.toHaveProperty("variant");
  }
  const results = JSON.parse(readFileSync(join(root, base, "internal-blind-results.json"), "utf8"));
  const pairs = results.rows.filter((r: { label?: string }) => r.label);
  expect(pairs).toHaveLength(6);
  expect(pairs.every((r: { factualGatePassed: boolean }) => !r.factualGatePassed)).toBe(true);
  expect(results.approvedForOutreach).toBe(false);
  expect(result.reservedNanoUsd).toBe(MAX_RESERVED_NANO_USD);
});

describe("Nutrafol-only four-call demonstration", () => {
  it("enforces one call per stage, a $0.20 cap and no fifth call", async () => {
    const path = location(),
      net = network();
    const b = new ExperimentBudget(path, approval, net, "NUTRAFOL_ONLY");
    try {
      for (const stage of Object.keys(OUTPUT_LIMITS) as Stage[])
        await b.forSlot(`nutrafol:${stage === "EVIDENCE_VALIDATION" ? "shared" : "A"}:${stage}`)(
          endpoint,
          request(stage),
        );
      expect(NUTRAFOL_MAX_RESERVED_NANO_USD).toBe(185895000);
      expect(b.reservedNanoUsd).toBe(NUTRAFOL_MAX_RESERVED_NANO_USD);
      expect(b.reservedNanoUsd).toBeLessThan(NUTRAFOL_CAP_NANO_USD);
      expect(JSON.parse(readFileSync(path, "utf8").split("\n")[0]).capNanoUsd).toBe(200000000);
      await expect(b.fetch(endpoint, request("STRATEGY", "fifth"))).rejects.toThrow("STAGE_LIMIT");
      expect(net.mock.calls.filter(([url]) => url === endpoint)).toHaveLength(4);
    } finally {
      b.close();
    }
  });
  it("blocks other companies, a second arm, out-of-order stages and insufficient allowance", async () => {
    const net = network(),
      b = new ExperimentBudget(location(), approval, net, "NUTRAFOL_ONLY");
    try {
      expect(() => b.forSlot("harborledger:A:STRATEGY")).toThrow("SLOT_INVALID");
      expect(() => b.forSlot("nutrafol:B:STRATEGY")).toThrow("SLOT_INVALID");
      await expect(b.fetch(endpoint, request("STRATEGY"))).rejects.toThrow("STAGE_ORDER");
      expect(net).not.toHaveBeenCalled();
    } finally {
      b.close();
    }
    expect(
      () =>
        new ExperimentBudget(
          location(),
          {
            ...approval,
            dailyRemainingNanoUsd: NUTRAFOL_MAX_RESERVED_NANO_USD - 1,
          },
          net,
          "NUTRAFOL_ONLY",
        ),
    ).toThrow("INSUFFICIENT");
  });
  it.each(["throw", "http", "usage"])(
    "retains reservation and forbids replay after %s",
    async (failure) => {
      const path = location(),
        net = network({ failure });
      const b = new ExperimentBudget(path, approval, net, "NUTRAFOL_ONLY");
      await expect(b.fetch(endpoint, request("EVIDENCE_VALIDATION"))).rejects.toThrow(
        "EXPERIMENT_",
      );
      expect(b.reservedNanoUsd).toBe(reserveCost("EVIDENCE_VALIDATION"));
      await expect(b.fetch(endpoint, request("EVIDENCE_VALIDATION"))).rejects.toThrow("STOPPED");
      b.close();
      expect(() => new ExperimentBudget(path, approval, net, "NUTRAFOL_ONLY")).toThrow();
      expect(net).toHaveBeenCalledTimes(2);
      expect(readFileSync(path, "utf8")).not.toMatch(/Bearer|TEST_ONLY|sensitive payload/);
    },
  );
  it("keeps a durably reserved interrupted call locked without retry or refund", async () => {
    const path = location();
    const net = vi.fn<typeof fetch>(async (url) => {
      if (String(url).endsWith("/input_tokens"))
        return Response.json({ object: "response.input_tokens", input_tokens: 1 });
      expect(readFileSync(path, "utf8")).toContain('"event":"RESERVED"');
      expect(() => new ExperimentBudget(path, approval, network(), "NUTRAFOL_ONLY")).toThrow();
      throw new Error("interrupted");
    });
    const b = new ExperimentBudget(path, approval, net, "NUTRAFOL_ONLY");
    await expect(b.fetch(endpoint, request("EVIDENCE_VALIDATION"))).rejects.toThrow();
    b.close();
    expect(() => new ExperimentBudget(path, approval, net, "NUTRAFOL_ONLY")).toThrow();
  });
});

function demoFixtureRoot(stage: "comparison" | "demo" | "continuation" = "demo") {
  const root = mkdtempSync(join(tmpdir(), "signal-nutrafol-demo-"));
  dirs.push(root);
  writeSyntheticExperiment(root, stage);
  return root;
}

it("revises only E1 in memory, preserving citation, period, source, HOLD and historical ledger", () => {
  const root = demoFixtureRoot(),
    previous = prepareComparison(root);
  const ledgerPath = join(previous.directory, "aggregate-spend.jsonl");
  const ledger = readFileSync(ledgerPath, "utf8");
  const demo = prepareNutrafolDemonstration(root);
  const expected = structuredClone(previous.packets[0]);
  if (typeof expected.evidence === "string") throw new Error("Expected structured Nutrafol packet");
  expected.evidence[0].statement = NUTRAFOL_E1;
  expect(demo.packets).toEqual([expected]);
  expect(demo.packets[0].evidence).not.toEqual(previous.packets[0].evidence);
  expect(demo.sources).toEqual(previous.sources);
  expect(demo.binding).not.toBe(previous.binding);
  expect(prepareComparison(root).packets).toEqual(previous.packets);
  const run = evidenceRun(demo.packets[0]);
  expect(run.knowledge).toEqual(PRODUCT_INPUT);
  expect(run.eligibility.status).toBe("HOLD");
  expect(run.intake.prospectName).toBe("Generic fictional recipient");
  expect([run.approved, run.canSend, run.canEnroll]).toEqual([false, false, false]);
  expect(readFileSync(ledgerPath, "utf8")).toBe(ledger);
  writeFileSync(ledgerPath, ledger + "\n");
  expect(() => prepareNutrafolDemonstration(root)).toThrow("HISTORICAL_LEDGER_CHANGED");
});

it.each(["complete", "grounding-rejected", "no-pitch", "review-unavailable"])(
  "executes only the existing one-company stages with offline provider: %s",
  async (scenario) => {
    const root = demoFixtureRoot();
    const prepared = prepareNutrafolDemonstration(root);
    const oldPath = join(root, "outputs/product-demonstration/commercial-ab/aggregate-spend.jsonl");
    const oldLedger = readFileSync(oldPath, "utf8");
    const calls: string[] = [];
    const mock = new MockWorkforceModel();
    const net = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).endsWith("/input_tokens"))
        return Response.json({ object: "response.input_tokens", input_tokens: 3000 });
      const body = JSON.parse(init!.body as string);
      const stage = body.text.format.name.toUpperCase();
      const { task: context, experiment } = JSON.parse(body.input);
      if (stage === "SEQUENCE") {
        expect(experiment).not.toHaveProperty("evidence");
        expect(experiment.evidenceMode).toBe("HISTORICAL_PUBLIC_EXCERPTS_NOT_FRESH_RESEARCH");
      } else expect(experiment.evidence.id).toBe("nutrafol");
      expect(context.intake.companyDomain).toBe("nutrafol.com");
      expect(context.intake.prospectName).toBe("Generic fictional recipient");
      calls.push(stage);
      let output;
      if (stage === "EVIDENCE_VALIDATION") {
        const facts = context.research.facts;
        output = {
          identityMatches: true,
          supportedFactIds: facts
            .filter((f: { id: string }) => scenario !== "grounding-rejected" || f.id !== "E1")
            .map((f: { id: string }) => f.id),
          rejectedFactIds: scenario === "grounding-rejected" ? ["E1"] : [],
          concerns:
            scenario === "grounding-rejected"
              ? [
                  {
                    severity: "BLOCKING",
                    code: "CLAIM_NOT_ENTAILED",
                    scope: "FACT",
                    reason: "Offline rejection fixture",
                    factIds: ["E1"],
                    sourceIds: facts[0].sourceIds,
                  },
                ]
              : [],
        };
      } else {
        output = await mock.structured(stage, z.any(), "", context, []);
        if (stage === "STRATEGY") {
          expect(context.commercialBrief).toBeDefined();
          output.supportingFactIds = ["E1"];
          if (scenario === "no-pitch") output.angle = "NO_PITCH";
        }
        if (stage === "QUALITY_REVIEW") {
          expect(context).not.toHaveProperty("commercialBrief");
          if (scenario === "review-unavailable") throw new Error("offline interruption");
          output.verdict = "HOLD";
          output.checks.factualAccuracy = false;
          output.unsupportedAssertions = ["Stock fictional copy is not Nutrafol evidence."];
        }
      }
      return Response.json({
        model: MODEL,
        service_tier: "default",
        status: "completed",
        usage: { input_tokens: 3000, output_tokens: 1000 },
        output_text: JSON.stringify(output),
      });
    });
    vi.stubEnv("INTEGRATION_OPERATOR_USER_ID", "offline-only");
    vi.stubEnv("CI", "");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("NODE_ENV", "test");
    const options = {
      root,
      executionApproved: true,
      approvedBinding: prepared.binding,
      apiKey: "FICTIONAL_TEST_KEY",
      network: net,
      budgetReceipt: {
        checkedAt: new Date().toISOString(),
        dailyRemainingNanoUsd: 1e9,
        monthlyRemainingNanoUsd: 5e9,
        pendingRequests: 0,
      },
    };
    await expect(
      executeNutrafolDemonstration({ ...options, executionApproved: false }),
    ).rejects.toThrow("NOT_APPROVED");
    await expect(
      executeNutrafolDemonstration({ ...options, approvedBinding: "f".repeat(64) }),
    ).rejects.toThrow("BINDING_CHANGED");
    await expect(
      executeNutrafolDemonstration({
        ...options,
        budgetReceipt: {
          ...options.budgetReceipt,
          dailyRemainingNanoUsd:
            NUTRAFOL_MAX_RESERVED_NANO_USD + HISTORICAL_RESERVATION_NANO_USD - 1,
        },
      }),
    ).rejects.toThrow("INSUFFICIENT");
    expect(net).not.toHaveBeenCalled();
    const execution = executeNutrafolDemonstration(options);
    if (scenario === "review-unavailable") await expect(execution).rejects.toThrow("NO_RETRY");
    else expect((await execution).completed).toBe(scenario === "complete");
    const expectedCalls = scenario === "grounding-rejected" ? 1 : scenario === "no-pitch" ? 2 : 4;
    expect(calls).toEqual(Object.keys(OUTPUT_LIMITS).slice(0, expectedCalls));
    const results = JSON.parse(
      readFileSync(join(prepared.directory, "internal-writing-results.json"), "utf8"),
    );
    expect(results.approvedForOutreach).toBe(false);
    expect(results.rows.filter((r: { label?: string }) => r.label).length).toBeLessThanOrEqual(1);
    if (scenario === "complete") {
      const draft = results.rows.find((r: { sequence?: unknown }) => r.sequence);
      expect(draft.sequence.messages).toHaveLength(4);
      expect(draft.factualGatePassed).toBe(false); // completion is not factual clearance
      expect(draft.independentReview.verdict).toBe("HOLD");
    }
    if (scenario === "review-unavailable") {
      expect(results.rows.find((r: { sequence?: unknown }) => r.sequence).independentReview).toBe(
        "NOT_EXECUTED",
      );
      expect(results.reservedNanoUsd).toBe(NUTRAFOL_MAX_RESERVED_NANO_USD);
    }
    await expect(executeNutrafolDemonstration(options)).rejects.toThrow(); // durable one-shot
    expect(calls).toHaveLength(expectedCalls);
    expect(readFileSync(oldPath, "utf8")).toBe(oldLedger);
  },
);

it("fits the complete saved Nutrafol strategy and writer request without dropping evidence or changing guards", async () => {
  const root = continuationFixtureRoot();
  const prepared = prepareNutrafolDemonstration(root);
  const dir = "outputs/product-demonstration/nutrafol-writing-demo-v1";
  const saved = JSON.parse(readFileSync(join(root, dir, "internal-writing-results.json"), "utf8"));
  const run = evidenceRun(prepared.packets[0]);
  run.strategy = saved.rows.find((r: { strategy?: unknown }) => r.strategy).strategy;
  const ledgerPaths = [
    "outputs/product-demonstration/commercial-ab/aggregate-spend.jsonl",
    `${dir}/aggregate-spend.jsonl`,
  ];
  const historicalBytes = ledgerPaths.map((p) => readFileSync(join(root, p), "utf8"));
  let bodyBytes = 0;
  const mock = new MockWorkforceModel();
  const net = vi.fn<typeof fetch>(async (url, init) => {
    if (String(url).endsWith("/input_tokens"))
      return Response.json({ object: "response.input_tokens", input_tokens: 4000 });
    const body = JSON.parse(init!.body as string);
    bodyBytes = Buffer.byteLength(init!.body as string, "utf8");
    const context = JSON.parse(body.input);
    expect(context.task.research).toEqual(run.research); // exact quotes AND original excerpts
    expect(context.task.knowledge).toEqual(PRODUCT_INPUT);
    expect(context.task.strategy).toEqual(run.strategy); // preserve rejected angles and uncertainties
    expect(context.task.recipientClearance.status).toBe("HOLD");
    expect(context.task).not.toHaveProperty("commercialBrief");
    expect(context.experiment).not.toHaveProperty("evidence");
    expect(context.experiment.screenshotObservation).toEqual(
      prepared.packets[0].screenshotObservation,
    );
    expect(context.experiment.productSources).toEqual(prepared.sources);
    const output = await mock.structured("SEQUENCE", z.any(), "", context.task, []);
    return Response.json({
      model: MODEL,
      service_tier: "default",
      status: "completed",
      usage: { input_tokens: 4000, output_tokens: 1000 },
      output_text: JSON.stringify(output),
    });
  });
  const b = new ExperimentBudget(location(), approval, net);
  const actual = new OpenAiWorkforceModel(
    {
      NODE_ENV: "test",
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "OFFLINE_TEST_ONLY",
      OPENAI_MODEL: MODEL,
      WORKFORCE_MODEL_PRICES_JSON: JSON.stringify({ [MODEL]: { input: 0.75, output: 4.5 } }),
    },
    b.forSlot("nutrafol:A:SEQUENCE"),
  );
  const model: WorkforceModel = {
    discover: async () => {
      throw new Error("OFFLINE_ONLY");
    },
    structured: (stage, schema, instruction, context, usage) =>
      actual.structured(
        stage,
        schema,
        instruction + experimentInstruction,
        experimentContext(stage, context, prepared.packets[0], prepared.sources),
        usage,
      ),
  };
  class MemoryStore extends DailyStore {
    private state = initialDailyState();
    async change<T>(_actor: string, mutate: (state: DailyState) => T) {
      return mutate(this.state);
    }
  }
  vi.stubEnv("INTEGRATION_OPERATOR_USER_ID", "offline-only");
  try {
    const result = await withBudgetContext(
      {
        actor: "offline-only",
        store: new MemoryStore(),
        config: dailyConfig({
          NODE_ENV: "test",
          WORKFORCE_MAX_RETRIES: "0",
          WORKFORCE_DAILY_BUDGET_USD: "1",
          WORKFORCE_MONTHLY_BUDGET_USD: "5",
        }),
      },
      () => generatePersonalSequence(run, model),
    );
    expect(result.messages).toHaveLength(4); // synthetic copy, not a live writing-quality result
    expect(bodyBytes + 4096).toBeLessThanOrEqual(33000);
    expect(net).toHaveBeenCalledTimes(2);
    await expect(b.fetch(endpoint, request("SEQUENCE", "x".repeat(33000)))).rejects.toThrow(
      "INPUT_LIMIT",
    );
    expect(net).toHaveBeenCalledTimes(2);
    expect(ledgerPaths.map((p) => readFileSync(join(root, p), "utf8"))).toEqual(historicalBytes);
  } finally {
    b.close();
  }
});
