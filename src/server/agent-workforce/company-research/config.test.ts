// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localDevelopmentUser } from "@/lib/auth/local-development";
import { localCompanyAiConfig, requireLocalCompanyAccess } from "./config";
import { reserveProvider, withBudgetContext, reserveInState, settleInState } from "../daily/budget";
import { MemoryDailyStore } from "../daily/test-store";
import { initialDailyState } from "@/features/agent-workforce/daily/contracts";

import { fictionalCompanyEnv } from "./test-fixtures";
beforeEach(() => {
  for (const [key, value] of Object.entries(fictionalCompanyEnv)) vi.stubEnv(key, value);
});
afterEach(() => vi.unstubAllEnvs());
describe("explicit local company opt-in", () => {
  it("isolates provider settings and never enables scheduling", () => {
    const config = localCompanyAiConfig(localDevelopmentUser.id);
    expect(config.budget).toMatchObject({
      dailyBudgetUsd: 1,
      monthlyBudgetUsd: 5,
      maxConcurrentCalls: 1,
      maxRetries: 0,
      enabled: false,
    });
    expect(config.providerEnv).not.toHaveProperty("HUBSPOT_ACCESS_TOKEN");
    expect(config.providerEnv).not.toHaveProperty("OUTREACH_API_KEY");
  });
  it.each(Object.keys(fictionalCompanyEnv).filter((key) => key.startsWith("LOCAL_COMPANY_")))(
    "fails closed when %s is missing",
    (key) => {
      vi.stubEnv(key, "");
      expect(() => localCompanyAiConfig(localDevelopmentUser.id)).toThrow();
    },
  );
  it.each([
    ["LOCAL_COMPANY_DAILY_BUDGET_USD", "6"],
    ["LOCAL_COMPANY_DAILY_BUDGET_USD", "5"],
    ["LOCAL_COMPANY_DAILY_BUDGET_USD", "NaN"],
    ["LOCAL_COMPANY_DAILY_BUDGET_USD", "0"],
    ["LOCAL_COMPANY_MONTHLY_BUDGET_USD", "101"],
    ["LOCAL_COMPANY_MONTHLY_BUDGET_USD", "100"],
    ["LOCAL_COMPANY_MAX_CONCURRENT_CALLS", "2"],
    ["LOCAL_COMPANY_MAX_RETRIES", "3"],
    ["LOCAL_COMPANY_MAX_RETRIES", "1"],
    ["LOCAL_COMPANY_MAX_RETRIES", "2"],
    ["LOCAL_COMPANY_MAX_RETRIES", "-1"],
    ["LOCAL_COMPANY_MAX_RETRIES", "1.5"],
    ["LOCAL_COMPANY_INPUT_USD_PER_MILLION", "NaN"],
    ["LOCAL_COMPANY_INPUT_USD_PER_MILLION", "0"],
    ["LOCAL_COMPANY_WEB_SEARCH_REQUEST_USD", "0"],
    ["LOCAL_COMPANY_INPUT_USD_PER_MILLION", "0.25"],
    ["LOCAL_COMPANY_OUTPUT_USD_PER_MILLION", "2"],
    ["LOCAL_COMPANY_WEB_SEARCH_REQUEST_USD", "0.005"],
    ["LOCAL_COMPANY_OPENAI_MODEL", "gpt-5.4-mini"],
    ["LOCAL_COMPANY_OPENAI_MODEL", "gpt-5-mini"],
    ["LOCAL_COMPANY_AI_ENABLED", "TRUE"],
  ])("rejects invalid %s=%s", (key, value) => {
    vi.stubEnv(key, value);
    expect(() => localCompanyAiConfig(localDevelopmentUser.id)).toThrow();
  });
  it.each([
    ["NODE_ENV", "production"],
    ["VERCEL_ENV", "preview"],
    ["VERCEL", "1"],
    ["DATABASE_URL", "postgresql://fictional@remote.example:5432/agent_workforce_test"],
    ["DATABASE_URL", "postgresql://fictional@localhost:5432/other"],
    ["WORKFORCE_DAILY_ENABLED", "true"],
  ])("rejects nonlocal/unsafe %s", (key, value) => {
    vi.stubEnv(key, value);
    expect(() => requireLocalCompanyAccess(localDevelopmentUser.id)).toThrow("LOCAL_COMPANY_ONLY");
  });
  it("rejects another actor", () => {
    expect(() => localCompanyAiConfig("other")).toThrow("LOCAL_COMPANY_ONLY");
  });
});
describe("company budget reservations", () => {
  it("serializes concurrent reservations and retains charges for uncertain attempts", async () => {
    const actor = localDevelopmentUser.id;
    const { budget: config } = localCompanyAiConfig(actor);
    const store = new MemoryDailyStore();
    await withBudgetContext({ actor, config, store }, async () => {
      const first = await reserveProvider("OPENAI", 0.2);
      await expect(reserveProvider("OPENAI", 0.2)).rejects.toThrow("PROVIDER_CONCURRENCY");
      await first.finish();
      expect(Object.values((await store.get(actor)).days)[0].estimatedUsd).toBe(0.2);
      const second = await reserveProvider("OPENAI", 0.8);
      await second.finish();
      await expect(reserveProvider("OPENAI", 0.01)).rejects.toThrow("DAILY_BUDGET");
    });
  });
  it("keeps charges after crash expiry and enforces the monthly limit across days", () => {
    const state = initialDailyState(),
      actor = localDevelopmentUser.id;
    const { budget } = localCompanyAiConfig(actor);
    const at = new Date("2026-10-18T09:00:00Z");
    state.months["2026-10"] = 4;
    const id = reserveInState(state, { actor }, budget, at, "OPENAI", 1);
    expect(() =>
      reserveInState(state, { actor }, budget, new Date(at.getTime() + 86400000), "OPENAI", 0.01),
    ).toThrow("MONTHLY_BUDGET");
    settleInState(state, id, { estimatedUsd: 0 }); // Expired reservation cannot be refunded.
    expect(state.months["2026-10"]).toBe(5);
  });
});
