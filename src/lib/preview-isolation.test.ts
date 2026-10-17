import { describe, it, expect } from "vitest";
import { configuredDatabaseUrl } from "./preview-isolation";
import { getSupabaseAuthConfig } from "./auth/env";
const ref = "aaaaaaaaaaaaaaaaaaaa";
const env = {
  NODE_ENV: "test",
  VERCEL_ENV: "preview",
  NEXT_PUBLIC_PREVIEW_SUPABASE_PROJECT_REF: ref,
} as NodeJS.ProcessEnv;
describe("explicit isolated Preview bindings", () => {
  it("never falls back to shared database or Supabase production bindings", () => {
    const shared = {
      ...env,
      DATABASE_URL: "postgresql://private@production/db",
      NEXT_PUBLIC_SUPABASE_URL: "https://production.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-publishable",
    };
    expect(() => configuredDatabaseUrl(shared)).toThrow("PREVIEW_DATABASE_ISOLATION_REQUIRED");
    expect(getSupabaseAuthConfig(shared)).toBeNull();
  });
  it("requires matching explicit Preview project reference for auth and database", () => {
    expect(
      configuredDatabaseUrl({
        ...env,
        PREVIEW_DATABASE_URL: `postgresql://postgres:synthetic@db.${ref}.supabase.co:5432/postgres`,
      }),
    ).toContain(ref);
    expect(() =>
      configuredDatabaseUrl({ ...env, PREVIEW_DATABASE_URL: "postgresql://private@production/db" }),
    ).toThrow();
    expect(
      getSupabaseAuthConfig({
        ...env,
        NEXT_PUBLIC_PREVIEW_SUPABASE_URL: `https://${ref}.supabase.co`,
        NEXT_PUBLIC_PREVIEW_SUPABASE_PUBLISHABLE_KEY: "synthetic-key",
      }),
    ).not.toBeNull();
    expect(
      getSupabaseAuthConfig({
        ...env,
        NEXT_PUBLIC_PREVIEW_SUPABASE_URL: "https://other.supabase.co",
        NEXT_PUBLIC_PREVIEW_SUPABASE_PUBLISHABLE_KEY: "synthetic-key",
      }),
    ).toBeNull();
  });
  it("retains existing non-Preview configuration", () => {
    expect(configuredDatabaseUrl({ NODE_ENV: "test", DATABASE_URL: "synthetic-local" })).toBe(
      "synthetic-local",
    );
  });
});
