// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OpenAiWorkforceModel } from "../openai";
import { withBudgetContext } from "../daily/budget";
import { MemoryDailyStore } from "../daily/test-store";
import { localCompanyAiConfig } from "./config";
import { fictionalCompanyEnv } from "./test-fixtures";
const actor = fictionalCompanyEnv.INTEGRATION_OPERATOR_USER_ID;
beforeEach(() => {
  for (const [key, value] of Object.entries(fictionalCompanyEnv)) vi.stubEnv(key, value);
});
afterEach(() => vi.unstubAllEnvs());
it("reserves before each mocked HTTP attempt and permits no retry when explicitly configured to zero", async () => {
  vi.stubEnv("LOCAL_COMPANY_MAX_RETRIES", "0");
  const config = localCompanyAiConfig(actor),
    store = new MemoryDailyStore();
  const fetcher = vi.fn(async () => {
    const pending = Object.values((await store.get(actor)).pending);
    expect(pending).toHaveLength(1);
    expect(pending[0].reservedUsd).toBeCloseTo(0.3181);
    return new Response("", { status: 429 });
  });
  const model = new OpenAiWorkforceModel(config.providerEnv, fetcher, config.modelOptions);
  await withBudgetContext({ actor, config: config.budget, store }, async () => {
    await expect(model.discover("fictional company", [])).rejects.toThrow("OpenAI request failed");
  });
  expect(fetcher).toHaveBeenCalledOnce();
  const state = await store.get(actor);
  expect(Object.keys(state.pending)).toHaveLength(0);
  expect(Object.values(state.days)[0].estimatedUsd).toBeGreaterThan(0);
});
it("blocks a mocked provider call before transport when the day's budget is exhausted", async () => {
  const config = localCompanyAiConfig(actor),
    store = new MemoryDailyStore();
  const { jerusalemParts } = await import("../daily/schedule");
  const day = jerusalemParts(new Date()).date;
  await store.change(actor, (state) => {
    state.days[day] = {
      estimatedUsd: 1,
      requests: { OPENAI: 1, VERIFICATION: 0, SERP: 0 },
      uncertainRequests: 1,
      models: {},
      researchAttempts: {},
    };
  });
  const fetcher = vi.fn();
  await withBudgetContext({ actor, config: config.budget, store }, async () => {
    await expect(
      new OpenAiWorkforceModel(config.providerEnv, fetcher, config.modelOptions).discover(
        "fictional",
        [],
      ),
    ).rejects.toThrow("DAILY_BUDGET");
  });
  expect(fetcher).not.toHaveBeenCalled();
});
it.each(["day", "month"])(
  "blocks discovery when its full search reservation would exceed the %s ceiling",
  async (period) => {
    const config = localCompanyAiConfig(actor),
      store = new MemoryDailyStore();
    const { jerusalemParts } = await import("../daily/schedule");
    const day = jerusalemParts(new Date()).date;
    await store.change(actor, (state) => {
      state.days[day] = {
        estimatedUsd: period === "day" ? 0.7 : 0,
        requests: { OPENAI: 1, VERIFICATION: 0, SERP: 0 },
        uncertainRequests: 0,
        models: {},
        researchAttempts: {},
      };
      state.months[day.slice(0, 7)] = period === "month" ? 4.7 : 0.7;
    });
    const fetcher = vi.fn();
    await withBudgetContext({ actor, config: config.budget, store }, async () => {
      await expect(
        new OpenAiWorkforceModel(config.providerEnv, fetcher, config.modelOptions).discover(
          "fictional",
          [],
        ),
      ).rejects.toThrow(period === "day" ? "DAILY_BUDGET" : "MONTHLY_BUDGET");
    });
    expect(fetcher).not.toHaveBeenCalled();
  },
);
it("settles mocked search-content token usage within the conservative reservation", async () => {
  const config = localCompanyAiConfig(actor),
    store = new MemoryDailyStore();
  const fetcher = vi.fn(async () => {
    const pending = Object.values((await store.get(actor)).pending);
    expect(pending[0].reservedUsd).toBeCloseTo(0.3181);
    return Response.json({
      status: "completed",
      usage: { input_tokens: 200000, output_tokens: 100 },
      output: [
        {
          type: "web_search_call",
          status: "completed",
          action: { sources: [{ url: "https://fictional.example/" }] },
        },
      ],
    });
  });
  await withBudgetContext({ actor, config: config.budget, store }, async () => {
    expect(
      await new OpenAiWorkforceModel(config.providerEnv, fetcher, config.modelOptions).discover(
        "fictional",
        [],
      ),
    ).toEqual(["https://fictional.example/"]);
  });
  const state = await store.get(actor);
  expect(Object.keys(state.pending)).toHaveLength(0);
  expect(Object.values(state.days)[0].estimatedUsd).toBeCloseTo(0.16045);
  expect(Object.values(state.months)[0]).toBeCloseTo(0.16045);
  expect(fetcher).toHaveBeenCalledOnce();
});
