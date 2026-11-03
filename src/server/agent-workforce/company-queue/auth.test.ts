// @vitest-environment node
import { expect, it } from "vitest";
import { companyPilotConfig, pilotPathAllowed } from "@/lib/company-pilot-isolation";
import { configuredDatabaseUrl } from "@/lib/preview-isolation";
import { requirePilotRequest } from "./auth";
import { pilotTestEnv as env } from "./test-support";
const request = (method = "GET", extra: Record<string, string> = {}) =>
  new Request(`${env.COMPANY_PILOT_ORIGIN}/api/sales-agent/company-queue`, {
    method,
    headers: { host: "fixture-pilot.vercel.app", ...extra },
  });
it("allows only the explicitly isolated fixture configuration, operator and worker", () => {
  expect(companyPilotConfig(env).mode).toBe("SIMULATED");
  // Legacy pilot validation remains covered, but cannot bypass the new Preview binding policy.
  expect(() => configuredDatabaseUrl(env)).toThrow("PREVIEW_DATABASE_ISOLATION_REQUIRED");
  expect(requirePilotRequest(request(), "fixture-operator", false, env).actor).toBe(
    "fixture-operator",
  );
  expect(
    requirePilotRequest(
      request("POST", { authorization: `Bearer ${env.COMPANY_PILOT_WORKER_SECRET}` }),
      undefined,
      true,
      env,
    ).mode,
  ).toBe("SIMULATED");
});
it.each([
  { VERCEL_ENV: "production" },
  { VERCEL_ENV: "development" },
  { COMPANY_PILOT_MODE: "LIVE" },
  { COMPANY_PILOT_ENABLED: "false" },
  { COMPANY_PILOT_AI_ENABLED: "true" },
  { WORKFORCE_DAILY_ENABLED: "true" },
  { COMPANY_PILOT_MAX_RETRIES: "1" },
  { COMPANY_PILOT_MAX_CONCURRENT_CALLS: "2" },
  { COMPANY_PILOT_DAILY_BUDGET_USD: "5" },
  { COMPANY_PILOT_MONTHLY_BUDGET_USD: "100" },
  { VERCEL_PROJECT_ID: "prj_other" },
  { NEXT_PUBLIC_PREVIEW_SUPABASE_PROJECT_REF: "differentprojectabcd" },
  { COMPANY_PILOT_SUPABASE_REF: "mfxqiyidmdppvdzeboke" },
  { COMPANY_PILOT_SUPABASE_REF: "ofxqdwpyqbvskrcfpdmx" },
  { LOCAL_DEV_LOGIN: "true" },
  { COMPANY_PILOT_OPERATOR_ID: "local-development-agent-workforce" },
  { DATABASE_URL: "inherited-private-value" },
  { OPENAI_API_KEY: "inherited-private-value" },
  { HUBSPOT_TOKEN: "inherited-private-value" },
  { INTEGRATION_WORKER_SECRET: "inherited-private-value" },
  {
    PREVIEW_DATABASE_URL:
      "postgresql://postgres@db.abcdefghijklmnopqrst.supabase.co/postgres?sslmode=require&sslaccept=strict",
  },
  {
    PREVIEW_DATABASE_URL:
      "postgresql://company_pilot_app@db.abcdefghijklmnopqrst.supabase.co/postgres?sslmode=disable",
  },
])("fails closed for unsafe or incomplete environment %j", (patch) => {
  expect(() => companyPilotConfig({ ...env, ...patch })).toThrow("PILOT_CONFIGURATION_REQUIRED");
});
it("permits only the pinned least-privilege pooler identity with strict TLS", () => {
  const url =
    "postgresql://company_pilot_app.abcdefghijklmnopqrst@aws-0-us-east-1.pooler.supabase.com/postgres?sslmode=require&sslaccept=strict";
  expect(companyPilotConfig({ ...env, PREVIEW_DATABASE_URL: url }).mode).toBe("SIMULATED");
  expect(() => configuredDatabaseUrl({ ...env, PREVIEW_DATABASE_URL: url })).toThrow("PREVIEW_DATABASE_ISOLATION_REQUIRED");
  expect(() =>
    configuredDatabaseUrl({
      ...env,
      PREVIEW_DATABASE_URL: url + "&sslaccept=accept_invalid_certs",
    }),
  ).toThrow();
  for (const bad of [
    url.replace("abcdefghijklmnopqrst@", "xxxxxxxxxxxxxxxxxxxx@"),
    url.replace("company_pilot_app.", "postgres."),
    url.replace("pooler.supabase.com", "pooler.supabase.com.evil.invalid"),
  ])
    expect(() => configuredDatabaseUrl({ ...env, PREVIEW_DATABASE_URL: bad })).toThrow();
});
it("rejects foreign origins, spoofed forwarding, unknown users and invalid worker credentials", () => {
  expect(() => requirePilotRequest(request(), "other", false, env)).toThrow();
  expect(() => requirePilotRequest(request("POST"), "fixture-operator", false, env)).toThrow();
  const spoofedHeaders: Record<string, string>[] = [
    { origin: "https://evil.invalid" },
    { "x-forwarded-host": "evil.invalid" },
    { "x-forwarded-proto": "http" },
    { "sec-fetch-site": "cross-site" },
  ];
  for (const headers of spoofedHeaders)
    expect(() =>
      requirePilotRequest(request("GET", headers), "fixture-operator", false, env),
    ).toThrow();
  expect(() =>
    requirePilotRequest(request("POST", { authorization: "Bearer invalid" }), undefined, true, env),
  ).toThrow();
});
it.each([
  "/api/sales-agent/daily/worker",
  "/api/sales-agent/integrations/worker",
  "/api/sales-agent/prospect-research/worker",
  "/api/sales-agent/research",
  "/api/sales-agent/company-research",
  "/api/send",
  "/api/enroll",
  "/local-login",
  "/create-outreach",
])("blocks non-pilot mutation %s", (path) => expect(pilotPathAllowed(path, "POST")).toBe(false));
