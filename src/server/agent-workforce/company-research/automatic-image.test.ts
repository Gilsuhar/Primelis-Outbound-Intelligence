// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { OpenAiWorkforceModel } from "../openai";
import { withBudgetContext } from "../daily/budget";
import { dailyConfig } from "../daily/state";
import { MemoryDailyStore } from "../daily/test-store";
import type { WorkforceRun } from "@/features/agent-workforce/gate-a-contracts";

const env: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  AI_PROVIDER: "openai",
  OPENAI_API_KEY: "FICTIONAL_TEST_KEY",
  OPENAI_MODEL: "gpt-5.4-mini-2026-03-17",
  OPENAI_INPUT_USD_PER_MILLION: "0.75",
  OPENAI_OUTPUT_USD_PER_MILLION: "4.50",
};
beforeEach(() => {
  vi.stubEnv("INTEGRATION_OPERATOR_USER_ID", "fixture");
  vi.stubEnv("VERCEL_ENV", "");
});
afterEach(() => vi.unstubAllEnvs());
it("uses the existing TLS provider transport and budget reservation for an inline raster, with zero retries", async () => {
  const store = new MemoryDailyStore();
  const usage: WorkforceRun["usage"] = [];
  const net = vi.fn<typeof fetch>(async (url, init) => {
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(init?.redirect).toBe("error");
    const body = JSON.parse(init!.body as string);
    expect(body.store).toBe(false);
    expect(body.input[0].content[1]).toEqual({
      type: "input_image",
      image_url: "data:image/png;base64,AAAA",
      detail: "high",
    });
    expect(body.tools).toBeUndefined();
    const state = await store.get("fixture");
    expect(Object.values(state.pending)[0].reservedUsd).toBeGreaterThanOrEqual(0.3);
    return Response.json({
      status: "completed",
      output_text: '{"ok":true}',
      usage: { input_tokens: 1000, output_tokens: 20 },
    });
  });
  const result = await withBudgetContext(
    {
      actor: "fixture",
      store,
      config: dailyConfig({
        NODE_ENV: "test",
        WORKFORCE_DAILY_BUDGET_USD: "1",
        WORKFORCE_MONTHLY_BUDGET_USD: "5",
        WORKFORCE_MAX_RETRIES: "0",
        WORKFORCE_MAX_CONCURRENT_CALLS: "1",
      }),
    },
    () =>
      new OpenAiWorkforceModel(env, net).imageStructured(
        "SCREENSHOT_ANALYSIS",
        z.object({ ok: z.boolean() }),
        "Fictional offline test",
        {},
        { mime: "image/png", base64: "AAAA" },
        usage,
      ),
  );
  expect(result.ok).toBe(true);
  expect(net).toHaveBeenCalledTimes(1);
  expect(usage[0].attempts).toBe(1);
  expect(JSON.stringify(await store.get("fixture"))).not.toContain("FICTIONAL_TEST_KEY");
});
it("rejects unknown model, invalid image and insufficient budget before provider dispatch", async () => {
  const net = vi.fn<typeof fetch>();
  const invoke = (modelEnv: typeof env, base64: string) =>
    new OpenAiWorkforceModel(modelEnv, net).imageStructured(
      "SCREENSHOT_ANALYSIS",
      z.object({ ok: z.boolean() }),
      "fixture",
      {},
      { mime: "image/png", base64 },
      [],
    );
  await expect(invoke({ ...env, OPENAI_MODEL: "unknown-model" }, "AAAA")).rejects.toThrow();
  await expect(invoke(env, "not_base64!")).rejects.toThrow();
  await expect(
    withBudgetContext(
      {
        actor: "fixture",
        store: new MemoryDailyStore(),
        config: dailyConfig({
          NODE_ENV: "test",
          WORKFORCE_DAILY_BUDGET_USD: "0.1",
          WORKFORCE_MONTHLY_BUDGET_USD: "5",
          WORKFORCE_MAX_RETRIES: "0",
        }),
      },
      () => invoke(env, "AAAA"),
    ),
  ).rejects.toThrow("DAILY_BUDGET");
  expect(net).not.toHaveBeenCalled();
});
