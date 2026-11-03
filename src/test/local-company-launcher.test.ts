// @vitest-environment node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { expect, it } from "vitest";
import { localCompanyAiConfig } from "@/server/agent-workforce/company-research/config";
import { fictionalCompanyEnv } from "@/server/agent-workforce/company-research/test-fixtures";

const profile: Record<string, string> = {
  LOCAL_COMPANY_DAILY_BUDGET_USD: "1",
  LOCAL_COMPANY_MONTHLY_BUDGET_USD: "5",
  LOCAL_COMPANY_MAX_CONCURRENT_CALLS: "1",
  LOCAL_COMPANY_MAX_RETRIES: "0",
  LOCAL_COMPANY_OPENAI_MODEL: "gpt-5.4-mini-2026-03-17",
  LOCAL_COMPANY_INPUT_USD_PER_MILLION: "0.75",
  LOCAL_COMPANY_OUTPUT_USD_PER_MILLION: "4.50",
  LOCAL_COMPANY_WEB_SEARCH_REQUEST_USD: "0.01",
  WORKFORCE_DAILY_ENABLED: "false",
};
function run(overrides: Record<string, string | undefined> = {}) {
  // Deliberately pass no database URL, API key, or inherited provider credentials.
  const runtime = Object.fromEntries(
    ["SystemRoot", "WINDIR", "TEMP", "TMP", "PATH"].flatMap((key) =>
      process.env[key] ? [[key, process.env[key]!]] : [],
    ),
  );
  const result = spawnSync(
    process.execPath,
    [path.resolve("scripts/company-research-preflight.mjs"), "--profile-only"],
    {
      env: { ...runtime, ...profile, ...overrides, NODE_ENV: "test" },
      encoding: "utf8",
      timeout: 15000,
    },
  );
  return { status: result.status, output: JSON.parse(result.stdout.trim()) };
}
it("validates the approved launcher profile without credentials, a database, or provider access", () => {
  expect(run()).toMatchObject({
    status: 0,
    output: {
      ok: true,
      profile: "PASS",
      paidRequestsMade: 0,
      credentialAndModelAccess: "NOT_CHECKED",
    },
  });
  expect(
    localCompanyAiConfig(fictionalCompanyEnv.INTEGRATION_OPERATOR_USER_ID, {
      ...fictionalCompanyEnv,
      ...profile,
      NODE_ENV: "development",
    }).budget,
  ).toMatchObject({ dailyBudgetUsd: 1, monthlyBudgetUsd: 5, maxConcurrentCalls: 1, maxRetries: 0 });
});
it.each([
  { LOCAL_COMPANY_DAILY_BUDGET_USD: "5" },
  { LOCAL_COMPANY_MONTHLY_BUDGET_USD: "100" },
  { LOCAL_COMPANY_MAX_CONCURRENT_CALLS: "2" },
  { LOCAL_COMPANY_MAX_RETRIES: "1" },
  { LOCAL_COMPANY_OPENAI_MODEL: "gpt-5.4-mini" },
  { LOCAL_COMPANY_WEB_SEARCH_REQUEST_USD: "0" },
  { LOCAL_COMPANY_INPUT_USD_PER_MILLION: "" },
  { LOCAL_COMPANY_OUTPUT_USD_PER_MILLION: "2" },
])("refuses an unapproved/incomplete startup profile: %j", (override) => {
  expect(run(override)).toMatchObject({
    status: 1,
    output: { ok: false, code: "APPROVED_PROFILE_REQUIRED" },
  });
});
it.each([{ VERCEL_ENV: "production" }, { HTTPS_PROXY: "http://proxy.invalid" }])(
  "fails closed for unsafe runtime configuration: %j",
  (override) => {
    expect(run(override).status).toBe(1);
  },
);
