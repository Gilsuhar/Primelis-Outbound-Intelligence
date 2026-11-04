// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { X509Certificate } from "node:crypto";
import { runtimeDatabaseUrl } from "./preview-runtime-tls";
import { previewFixture } from "@/test/preview-fixture";

afterEach(() => vi.useRealTimers());
describe("Preview runtime database trust", () => {
  it("pins the reviewed CA and preserves strict validation on the session pooler", () => {
    const env = previewFixture();
    env.PREVIEW_APPROVED_DATABASE_ENDPOINT = "aws-1-us-west-2.pooler.supabase.com:5432";
    env.PREVIEW_DATABASE_URL = "postgresql://recycler_preview_app.aaaaaaaaaaaaaaaaaaaa:synthetic@aws-1-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require&sslaccept=strict&connection_limit=1";
    const url = new URL(runtimeDatabaseUrl(env)!);
    expect(url.host).toBe(env.PREVIEW_APPROVED_DATABASE_ENDPOINT);
    expect(url.searchParams.get("sslaccept")).toBe("strict");
    expect(url.searchParams.get("sslmode")).toBe("require");
    expect(url.searchParams.get("connection_limit")).toBe("1");
    const cert = new X509Certificate(readFileSync(url.searchParams.get("sslcert")!));
    expect(readFileSync("scripts/preview/tls-trust.mjs", "utf8")).toContain(cert.fingerprint256);
    expect(readFileSync("next.config.ts", "utf8")).toContain('"./scripts/preview/supabase-prod-ca-2021.crt"');
  });
  it.each(["postgres", "recycler_preview_verify"])("rejects %s credentials", role => {
    const env = previewFixture();
    env.PREVIEW_DATABASE_URL = env.PREVIEW_DATABASE_URL!.replace("recycler_preview_app", role);
    expect(() => runtimeDatabaseUrl(env)).toThrow("ISOLATION_REQUIRED");
  });
  it.each(["&sslcert=/untrusted.pem", "&sslaccept=accept_invalid_certs"])("rejects trust overrides %s", suffix => {
    const env = previewFixture(); env.PREVIEW_DATABASE_URL += suffix;
    expect(() => runtimeDatabaseUrl(env)).toThrow("ISOLATION_REQUIRED");
  });
  it("rejects global TLS bypass and expired CA without networking", () => {
    expect(() => runtimeDatabaseUrl({ ...previewFixture(), NODE_TLS_REJECT_UNAUTHORIZED: "0" })).toThrow("TLS_REQUIRED");
    vi.useFakeTimers(); vi.setSystemTime(new Date("2100-01-01"));
    expect(() => runtimeDatabaseUrl(previewFixture())).toThrow("TLS_REQUIRED");
  });
  it("does not change Production connection selection", () => {
    expect(runtimeDatabaseUrl({ NODE_ENV: "production", VERCEL_ENV: "production", DATABASE_URL: "synthetic-production" })).toBe("synthetic-production");
  });
});
