// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertPreviewOperation,
  isPreviewRestricted,
  type PreviewOperation,
} from "./preview-policy.mjs";
import { configuredDatabaseUrl } from "./preview-isolation";
import { getSupabaseAuthConfig } from "./auth/env";
import { localDevelopmentConfig } from "./auth/local-development";
import { previewFixture } from "@/test/preview-fixture";
import { spawnSync } from "node:child_process";

afterEach(() => vi.unstubAllEnvs());
const operations: PreviewOperation[] = [
  "hubspot-write",
  "outreach-write",
  "outreach-refresh",
  "outreach-authorization",
  "email-send",
  "external-provider",
  "ai-execution",
  "worker",
  "business-action",
  "database-migration",
  "database-write",
];
describe("default-deny Preview execution policy", () => {
  it.each(operations)("denies %s even when unrelated feature flags enable it", (operation) => {
    expect(() =>
      assertPreviewOperation(operation, {
        ...previewFixture(),
        WORKFORCE_DAILY_ENABLED: "true",
        AI_PROVIDER: "openai",
      }),
    ).toThrow(`PREVIEW_OPERATION_DENIED:${operation}`);
  });
  it.each([
    { VERCEL: "1" },
    { VERCEL_ENV: "unknown" },
    { NEXT_PUBLIC_VERCEL_ENV: "preview" },
    { VERCEL_URL: "synthetic.vercel.app" },
    { VERCEL_PROJECT_ID: "prj_synthetic" },
    { VERCEL_ENV: "production", NEXT_PUBLIC_VERCEL_ENV: "preview" },
    { VERCEL_ENV: "preview", NEXT_PUBLIC_VERCEL_ENV: "production" },
  ])("fails closed for incomplete/ambiguous cloud identity %j", (env) => {
    expect(isPreviewRestricted(env)).toBe(true);
    expect(() =>
      configuredDatabaseUrl({ NODE_ENV: "test", ...env, DATABASE_URL: "production-placeholder" }),
    ).toThrow("PREVIEW_DATABASE_ISOLATION_REQUIRED");
    expect(
      getSupabaseAuthConfig({
        NODE_ENV: "test",
        ...env,
        NEXT_PUBLIC_SUPABASE_URL: "https://production.example",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic",
      }),
    ).toBeNull();
  });
  it("cannot override the real Preview runtime with injected Production config", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(() => assertPreviewOperation("external-provider", { VERCEL_ENV: "production" })).toThrow(
      "PREVIEW_OPERATION_DENIED",
    );
  });
  it.each(operations)("preserves Production and local operation policy for %s", (operation) => {
    expect(() => assertPreviewOperation(operation, { VERCEL_ENV: "production" })).not.toThrow();
    expect(() => assertPreviewOperation(operation, {})).not.toThrow();
  });
  it.each(["VERCEL", "VERCEL_ENV", "NEXT_PUBLIC_VERCEL_ENV", "VERCEL_URL", "VERCEL_PROJECT_ID"])(
    "rejects local login with cloud marker %s",
    (key) => {
      expect(
        localDevelopmentConfig({
          NODE_ENV: "development",
          LOCAL_DEV_LOGIN: "true",
          LOCAL_DEV_SESSION_TOKEN: "x".repeat(40),
          DATABASE_URL: "postgresql://localhost:5432/agent_workforce_test",
          [key]: "preview",
        }),
      ).toBeNull();
    },
  );
});

describe("dedicated database bindings", () => {
  it("accepts an approved dedicated direct connection and Auth project", () => {
    const env = previewFixture();
    expect(configuredDatabaseUrl(env)).toBe(env.PREVIEW_DATABASE_URL);
    expect(getSupabaseAuthConfig(env)?.url).toBe(env.NEXT_PUBLIC_PREVIEW_SUPABASE_URL);
  });
  it("supports a dedicated pooled role bound to the same project", () => {
    const env = previewFixture();
    env.PREVIEW_APPROVED_DATABASE_ENDPOINT = "aws-0-test.pooler.supabase.com:6543";
    env.PREVIEW_DATABASE_URL = `postgresql://recycler_preview_app.aaaaaaaaaaaaaaaaaaaa:synthetic@${env.PREVIEW_APPROVED_DATABASE_ENDPOINT}/postgres?sslmode=require&sslaccept=strict&pgbouncer=true`;
    expect(configuredDatabaseUrl(env)).toBe(env.PREVIEW_DATABASE_URL);
  });
  it.each(
    Object.keys(previewFixture()).filter(
      (key) =>
        key !== "NODE_ENV" &&
        key !== "VERCEL" &&
        key !== "NEXT_PUBLIC_VERCEL_ENV" &&
        key !== "NEXT_PUBLIC_PREVIEW_SUPABASE_PUBLISHABLE_KEY",
    ),
  )("rejects missing %s", (key) => {
    const env = previewFixture();
    delete env[key];
    expect(() => configuredDatabaseUrl(env)).toThrow("PREVIEW_DATABASE_ISOLATION_REQUIRED");
  });
  it.each([
    ["DATABASE_URL", "production-placeholder"],
    ["DIRECT_URL", "production-placeholder"],
    ["PREVIEW_APPROVED_DATABASE_ROLE", "postgres"],
    ["VERCEL_PROJECT_ID", "wrong-project"],
    ["VERCEL_GIT_COMMIT_REF", "main"],
    ["PREVIEW_APPROVED_DATABASE_ENDPOINT", "production.example:5432"],
    ["NEXT_PUBLIC_PREVIEW_SUPABASE_PROJECT_REF", "bbbbbbbbbbbbbbbbbbbb"],
  ])("rejects mismatched/inherited binding %s", (key, value) => {
    expect(() => configuredDatabaseUrl({ ...previewFixture(), [key]: value })).toThrow(
      "PREVIEW_DATABASE_ISOLATION_REQUIRED",
    );
  });
  it.each(["mfxqiyidmdppvdzeboke", "ofxqdwpyqbvskrcfpdmx"])(
    "rejects legacy project %s even if nominated",
    (ref) => {
      const env = previewFixture();
      env.PREVIEW_APPROVED_SUPABASE_PROJECT_REF = env.NEXT_PUBLIC_PREVIEW_SUPABASE_PROJECT_REF =
        ref;
      env.NEXT_PUBLIC_PREVIEW_SUPABASE_URL = `https://${ref}.supabase.co`;
      expect(() => configuredDatabaseUrl(env)).toThrow();
      expect(getSupabaseAuthConfig(env)).toBeNull();
    },
  );
  it.each([
    ["sslmode=require", "sslmode=disable"],
    ["sslaccept=strict", "sslaccept=accept_invalid_certs"],
    ["sslmode=require", "sslmode=require&sslmode=disable"],
    ["sslaccept=strict", "sslaccept=strict&host=production.example"],
    ["recycler_preview_app:", "postgres:"],
    ["/postgres?", "/other?"],
    [":5432/", ":1234/"],
    ["postgresql:", "https:"],
    ["synthetic@", "@"],
    ["sslaccept=strict", "sslaccept=strict#ignored"],
  ])("rejects unsafe URL variation %s", (from, to) => {
    const env = previewFixture();
    env.PREVIEW_DATABASE_URL = env.PREVIEW_DATABASE_URL!.replace(from, to);
    expect(() => configuredDatabaseUrl(env)).toThrow("PREVIEW_DATABASE_ISOLATION_REQUIRED");
  });
  it("does not return connection strings in errors", () => {
    const env = { ...previewFixture(), PREVIEW_DATABASE_URL: "private-invalid-string" };
    try {
      configuredDatabaseUrl(env);
      throw new Error("expected rejection");
    } catch (error) {
      expect((error as Error).message).toBe("PREVIEW_DATABASE_ISOLATION_REQUIRED");
    }
  });
});

it.each([
  "scripts/prisma-migrate.mjs",
  "prisma/seed.mjs",
  "scripts/import-signal-knowledge-pack.mjs",
  "scripts/workforce-worker.mjs",
  "scripts/company-pilot-worker.mjs",
])("stops maintenance entry point %s before execution", (script) => {
  const result = spawnSync(process.execPath, [script], {
    env: { ...process.env, VERCEL_ENV: "preview" },
    encoding: "utf8",
    timeout: 10000,
  });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("PREVIEW_OPERATION_DENIED");
});
