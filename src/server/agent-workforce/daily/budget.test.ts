import { describe, expect, it, vi, afterEach } from "vitest";
import { initialDailyState } from "@/features/agent-workforce/daily/contracts";
import {
  reserveInState,
  settleInState,
  reserveProvider,
  withBudgetContext,
  unitCost,
  openAiPricing,
  webSearchCost,
} from "./budget";
import { dailyConfig } from "./state";
import { MemoryDailyStore } from "./test-store";
import { OpenAiWorkforceModel } from "../openai";
import { observeBrandSerp } from "../prospect-research/serp";
import { workforceIntake } from "@/test/workforce-fixtures";
import { z } from "zod";
const config = dailyConfig({ NODE_ENV: "test" }),
  now = new Date("2026-10-19T07:00:00Z");
afterEach(() => vi.unstubAllEnvs());
describe("atomic estimated API budgets", () => {
  it("reserves before calls and blocks daily and monthly overspend", () => {
    const state = initialDailyState();
    reserveInState(state, { actor: "a" }, config, now, "OPENAI", 4, "model");
    expect(() => reserveInState(state, { actor: "a" }, config, now, "SERP", 2)).toThrow(
      "PROVIDER_CONCURRENCY",
    );
    settleInState(state, Object.keys(state.pending)[0]);
    expect(() => reserveInState(state, { actor: "a" }, config, now, "SERP", 2)).toThrow(
      "DAILY_BUDGET",
    );
    state.months["2026-10"] = 100;
    expect(() => reserveInState(state, { actor: "a" }, config, now, "SERP", 0.1)).toThrow(
      "MONTHLY_BUDGET",
    );
  });
  it("settles observed model usage once and attributes model tokens", () => {
    const state = initialDailyState();
    const id = reserveInState(state, { actor: "a" }, config, now, "OPENAI", 2, "specific-model");
    const result = { estimatedUsd: 0.3, inputTokens: 123, outputTokens: 45 };
    settleInState(state, id, result);
    settleInState(state, id, result);
    expect(state.days["2026-10-19"]).toMatchObject({
      uncertainRequests: 0,
      models: { "specific-model": { requests: 1, inputTokens: 123, outputTokens: 45 } },
    });
    expect(state.months["2026-10"]).toBeCloseTo(0.3);
    expect(state.days["2026-10-19"].estimatedUsd).toBeCloseTo(0.3);
  });
  it("retains uncertain charges after failures and worker crashes", () => {
    const state = initialDailyState(),
      id = reserveInState(state, { actor: "a" }, config, now, "SERP", 1);
    settleInState(state, id);
    expect(state.days["2026-10-19"].estimatedUsd).toBe(1);
    expect(state.days["2026-10-19"].uncertainRequests).toBe(1);
    reserveInState(state, { actor: "a" }, config, now, "VERIFICATION", 1);
    reserveInState(
      state,
      { actor: "a" },
      config,
      new Date(now.getTime() + 180000),
      "VERIFICATION",
      1,
    );
    expect(state.days["2026-10-19"].estimatedUsd).toBe(3);
  });
  it("uses local dates and carries monthly consumption across daily resets", () => {
    const state = initialDailyState();
    const id = reserveInState(
      state,
      { actor: "a" },
      config,
      new Date("2026-10-18T22:00:00Z"),
      "SERP",
      1,
    );
    settleInState(state, id);
    reserveInState(state, { actor: "a" }, config, new Date("2026-10-19T22:00:00Z"), "SERP", 1);
    expect(Object.keys(state.days)).toEqual(["2026-10-19", "2026-10-20"]);
    expect(state.months["2026-10"]).toBe(2);
  });
  it("isolates operators and serializes competing reservations", async () => {
    vi.stubEnv("INTEGRATION_OPERATOR_USER_ID", "actor");
    const store = new MemoryDailyStore();
    const results = await withBudgetContext({ actor: "actor", store, config, now: () => now }, () =>
      Promise.allSettled([reserveProvider("SERP", 1), reserveProvider("SERP", 1)]),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await store.get("unrelated")).days).toEqual({});
  });
  it("requires explicit pricing per configured model and provider", () => {
    expect(() => unitCost("SERP", {})).toThrow("PRICING_REQUIRED");
    expect(() => webSearchCost({})).toThrow("PRICING_REQUIRED");
    expect(() =>
      openAiPricing("expensive-override", {
        OPENAI_MODEL: "base",
        OPENAI_INPUT_USD_PER_MILLION: "1",
        OPENAI_OUTPUT_USD_PER_MILLION: "2",
      }),
    ).toThrow("PRICING_REQUIRED");
    expect(
      openAiPricing("override", {
        WORKFORCE_MODEL_PRICES_JSON: '{"override":{"input":2,"output":8}}',
      }),
    ).toEqual({ input: 2, output: 8 });
  });
  it("blocks further paid calls after cancellation", () =>
    expect(() =>
      reserveInState(
        initialDailyState(),
        { actor: "a", runId: "cancelled" },
        config,
        now,
        "OPENAI",
        1,
      ),
    ).toThrow("CANCELLED"));
  it("bounds ledger request count independently of very cheap calls", () => {
    const state = initialDailyState();
    const id = reserveInState(state, { actor: "a" }, config, now, "SERP", 0.001);
    settleInState(state, id);
    state.days["2026-10-19"].requests.SERP = 2000;
    expect(() => reserveInState(state, { actor: "a" }, config, now, "SERP", 0.001)).toThrow(
      "REQUEST_LIMIT",
    );
  });
});
describe("real provider transport boundaries with mocked HTTP only", () => {
  const env = {
    NODE_ENV: "test" as const,
    AI_PROVIDER: "openai",
    OPENAI_API_KEY: "fictional-not-a-secret",
    OPENAI_MODEL: "gpt-4.1-mini",
    OPENAI_INPUT_USD_PER_MILLION: "1",
    OPENAI_OUTPUT_USD_PER_MILLION: "2",
  };
  it("makes no OpenAI HTTP call when reservation exceeds budget", async () => {
    vi.stubEnv("INTEGRATION_OPERATOR_USER_ID", "actor");
    const store = new MemoryDailyStore(),
      fetcher = vi.fn();
    const model = new OpenAiWorkforceModel(env, fetcher);
    await expect(
      withBudgetContext(
        { actor: "actor", store, config: { ...config, dailyBudgetUsd: 0.000001 }, now: () => now },
        () => model.structured("STRATEGY", z.object({ ok: z.boolean() }), "write", {}, []),
      ),
    ).rejects.toThrow("DAILY_BUDGET");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("counts retries individually and persists observed tokens", async () => {
    vi.stubEnv("INTEGRATION_OPERATOR_USER_ID", "actor");
    const store = new MemoryDailyStore();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429, headers: { "retry-after": "0" } }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "completed",
            output_text: '{"ok":true}',
            usage: { input_tokens: 100, output_tokens: 10 },
          }),
        ),
      );
    await withBudgetContext({ actor: "actor", store, config, now: () => now }, () =>
      new OpenAiWorkforceModel(env, fetcher).structured(
        "STRATEGY",
        z.object({ ok: z.boolean() }),
        "write",
        {},
        [],
      ),
    );
    const usage = (await store.get("actor")).days["2026-10-19"];
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(usage.requests.OPENAI).toBe(2);
    expect(usage.uncertainRequests).toBe(1);
    expect(usage.models["gpt-4.1-mini"]).toMatchObject({
      requests: 2,
      inputTokens: 100,
      outputTokens: 10,
    });
  });
  it("defers a long Retry-After rather than hot-looping requests", async () => {
    vi.stubEnv("INTEGRATION_OPERATOR_USER_ID", "actor");
    const store = new MemoryDailyStore();
    const fetcher = vi.fn(
      async () => new Response("", { status: 429, headers: { "retry-after": "600" } }),
    );
    await expect(
      withBudgetContext({ actor: "actor", store, config, now: () => now }, () =>
        new OpenAiWorkforceModel(env, fetcher).structured(
          "STRATEGY",
          z.object({ ok: z.boolean() }),
          "write",
          {},
          [],
        ),
      ),
    ).rejects.toThrow("rate limited");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("blocks SERP HTTP calls without approved request pricing", async () => {
    vi.stubEnv("INTEGRATION_OPERATOR_USER_ID", "actor");
    const fetcher = vi.fn(),
      store = new MemoryDailyStore();
    await expect(
      withBudgetContext({ actor: "actor", store, config, now: () => now }, () =>
        observeBrandSerp(
          workforceIntake,
          now,
          {
            SERPAPI_API_KEY: "fictional",
            RESEARCH_SERP_LOCATION: "London",
            RESEARCH_SERP_GL: "gb",
          },
          fetcher,
        ),
      ),
    ).rejects.toThrow("PRICING_REQUIRED");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
it("does not silently price blank base-model input rates as zero", () => {
  expect(() =>
    openAiPricing("gpt-4.1-mini", {
      OPENAI_MODEL: "gpt-4.1-mini",
      OPENAI_INPUT_USD_PER_MILLION: "",
      OPENAI_OUTPUT_USD_PER_MILLION: "2",
    }),
  ).toThrow("PRICING_REQUIRED");
});
it("uses the same configured model override estimate in the run and central ledger", async () => {
  vi.stubEnv("INTEGRATION_OPERATOR_USER_ID", "actor");
  const store = new MemoryDailyStore(),
    usage: Parameters<OpenAiWorkforceModel["discover"]>[1] = [];
  const fetcher = vi.fn(async () =>
    Response.json({
      status: "completed",
      output_text: '{"ok":true}',
      usage: { input_tokens: 100, output_tokens: 10 },
    }),
  );
  const env = {
    NODE_ENV: "test" as const,
    AI_PROVIDER: "openai",
    OPENAI_API_KEY: "fictional",
    OPENAI_MODEL: "gpt-4.1-mini",
    OPENAI_WRITING_MODEL: "approved-override",
    WORKFORCE_MODEL_PRICES_JSON: '{"approved-override":{"input":4,"output":8}}',
  };
  await withBudgetContext({ actor: "actor", store, config, now: () => now }, () =>
    new OpenAiWorkforceModel(env, fetcher).structured(
      "SEQUENCE",
      z.object({ ok: z.boolean() }),
      "write",
      {},
      usage,
    ),
  );
  expect(usage[0].estimatedCostUsd).toBeCloseTo(0.00048);
  expect((await store.get("actor")).days["2026-10-19"].estimatedUsd).toBeCloseTo(
    usage[0].estimatedCostUsd!,
  );
});
