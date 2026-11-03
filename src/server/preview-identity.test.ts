// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { assertPreviewIdentity, failedIdentityConditions, identityQuery } from "../../scripts/preview/identity.mjs";
import { diagnoseIdentity, diagnosticConditions } from "../../scripts/preview/diagnose-identity.mjs";
import { verificationError, verificationReport } from "../../scripts/preview/verification-errors.mjs";
import { caPath } from "../../scripts/preview/tls-trust.mjs";
import target from "../../scripts/preview/verified-target.json";

const identity = () => ({ database: "postgres", operator: "postgres", effective_role: "postgres",
  fingerprint: target.clusterFingerprint, read_only: "on", default_read_only: "on",
  session_superuser: false, effective_superuser: false });
const env = () => ({ PREVIEW_SETUP_APPROVED_PROJECT_REF: target.projectRef, PREVIEW_SETUP_PROJECT_NAME: target.projectName,
  PREVIEW_SETUP_APPROVAL: `verify:${target.projectRef}`, PREVIEW_SETUP_APPROVED_ENDPOINT: "aws-1-us-west-2.pooler.supabase.com:5432",
  PREVIEW_SETUP_DATABASE_URL: `postgresql://postgres.${target.projectRef}:synthetic@aws-1-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require&sslaccept=strict` });
function fixture(rows: unknown[] = [identity()]) {
  const db = { $queryRawUnsafe: vi.fn().mockResolvedValue(rows), $disconnect: vi.fn().mockResolvedValue(undefined) };
  const deps = { connect: vi.fn().mockResolvedValue(db), authorize: vi.fn().mockResolvedValue(undefined),
    probe: vi.fn().mockResolvedValue(undefined), migrate: vi.fn(), reset: vi.fn(), seed: vi.fn(), diff: vi.fn() };
  return { db, deps };
}

describe("fixed Preview identity assertions", () => {
  it("accepts only the approved identity and both read-only indicators", () => {
    expect(failedIdentityConditions([identity()])).toEqual([]);
    expect(() => assertPreviewIdentity([identity()])).not.toThrow();
  });
  it.each([
    ["database", "other", "DATABASE_NAME"], ["operator", "other", "SESSION_USER"],
    ["fingerprint", "other", "CLUSTER_FINGERPRINT"], ["read_only", "off", "TRANSACTION_READ_ONLY"],
    ["effective_role", "other", "EFFECTIVE_ROLE"], ["default_read_only", "off", "DEFAULT_TRANSACTION_READ_ONLY"],
    ["session_superuser", true, "SESSION_ROLE_NOT_SUPERUSER"], ["effective_superuser", true, "EFFECTIVE_ROLE_NOT_SUPERUSER"],
  ] as const)("identifies %s failure without disclosing its value", (field, value, condition) => {
    const rows = [{ ...identity(), [field]: value }];
    expect(failedIdentityConditions(rows)).toEqual([condition]);
    let error; try { assertPreviewIdentity(rows); } catch (e) { error = e; }
    const report = verificationReport(verificationError(error, "IDENTITY"));
    expect(report.failedConditions).toEqual([condition]);
    expect(report.stage).toBe(condition.includes("READ_ONLY") ? "READ_ONLY" : "IDENTITY");
    expect(report.code).toBe(condition.includes("READ_ONLY") ? "PREVIEW_SETUP_READ_ONLY_REJECTED" : "PREVIEW_SETUP_TARGET_REJECTED");
    expect(JSON.stringify(report)).not.toContain(target.clusterFingerprint);
  });
  it.each([null, undefined, {}, [], [identity(), identity()]].map(rows => ({ rows })))("rejects missing/ambiguous result $rows", ({ rows }) => {
    expect(failedIdentityConditions(rows)).toEqual(["IDENTITY_RESULT_COUNT"]);
  });
  it.each([null, "private-value", []].map(row => ({ row })))("rejects malformed rows", ({ row }) => {
    expect(failedIdentityConditions([row])).toEqual(["IDENTITY_ROW_SHAPE"]);
  });
  it("does not interpret missing fields or string booleans as clearance", () => {
    expect(failedIdentityConditions([{}])).toHaveLength(8);
    expect(failedIdentityConditions([{ ...identity(), session_superuser: "false", effective_superuser: null }]))
      .toEqual(["SESSION_ROLE_NOT_SUPERUSER", "EFFECTIVE_ROLE_NOT_SUPERUSER"]);
  });
  it("does not confuse a pooler routing username with a PostgreSQL role", () => {
    expect(failedIdentityConditions([{ ...identity(), operator: `postgres.${target.projectRef}` }])).toEqual(["SESSION_USER"]);
  });
  it("rejects an unverified pooler service identity even if current_user is approved", () => {
    expect(failedIdentityConditions([{ ...identity(), operator: "supabase_admin", session_superuser: true }]))
      .toEqual(["SESSION_USER", "SESSION_ROLE_NOT_SUPERUSER"]);
  });
  it.each(["supabase_admin", "service_role", "anon", "authenticated"])("rejects effective-role substitution %s", role => {
    expect(failedIdentityConditions([{ ...identity(), effective_role: role }])).toEqual(["EFFECTIVE_ROLE"]);
  });
  it("reports simultaneous identity and session failures without hiding either", () => {
    let error; try { assertPreviewIdentity([{ ...identity(), fingerprint: "private-value", read_only: "off", default_read_only: "off" }]); } catch (e) { error = e; }
    expect(verificationReport(error)).toEqual({ code: "PREVIEW_SETUP_TARGET_REJECTED", stage: "IDENTITY", category: "CHECK_FAILED",
      failedConditions: ["CLUSTER_FINGERPRINT", "TRANSACTION_READ_ONLY", "DEFAULT_TRANSACTION_READ_ONLY"] });
  });
  it("filters forged diagnostics and never returns arbitrary values", () => {
    expect(diagnosticConditions({ message: "private-value", failedConditions: ["private-value", "SESSION_USER", "SESSION_USER", target.clusterFingerprint] }))
      .toEqual(["SESSION_USER"]);
    expect(diagnosticConditions(new Error("private-value"))).toEqual(["IDENTITY_QUERY_QUERY_ERROR"]);
  });
});

describe("identity-only secure diagnostic", () => {
  it("uses one fixed SELECT and the same strict CA/read-only configuration", async () => {
    const f = fixture(); expect(await diagnoseIdentity(env(), f.deps)).toEqual([]);
    expect(f.db.$queryRawUnsafe.mock.calls).toEqual([[identityQuery]]);
    expect(identityQuery).toMatch(/^SELECT /);
    expect(identityQuery).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|SET)\b|set_config|;/i);
    for (const expression of ["current_database()", "session_user", "current_user", "pg_control_system()", "pg_catalog.pg_roles",
      "transaction_read_only", "default_transaction_read_only"]) expect(identityQuery).toContain(expression);
    const url = new URL(f.deps.connect.mock.calls[0][0]);
    expect(url.searchParams.get("sslmode")).toBe("require"); expect(url.searchParams.get("sslaccept")).toBe("strict");
    expect(url.searchParams.get("sslcert")).toBe(caPath);
    expect(url.searchParams.get("options")).toBe("-c default_transaction_read_only=on");
    for (const fn of [f.deps.migrate, f.deps.reset, f.deps.seed, f.deps.diff]) expect(fn).not.toHaveBeenCalled();
    expect(f.db.$disconnect).toHaveBeenCalledOnce();
  });
  it("stops after a writable-session diagnostic, without repair or additional queries", async () => {
    const f = fixture([{ ...identity(), read_only: "off", default_read_only: "off" }]);
    const error = await diagnoseIdentity(env(), f.deps).catch(e => e);
    expect(diagnosticConditions(error)).toEqual(["TRANSACTION_READ_ONLY", "DEFAULT_TRANSACTION_READ_ONLY"]);
    expect(f.db.$queryRawUnsafe).toHaveBeenCalledOnce(); expect(f.db.$disconnect).toHaveBeenCalledOnce();
    for (const fn of [f.deps.migrate, f.deps.reset, f.deps.seed, f.deps.diff]) expect(fn).not.toHaveBeenCalled();
  });
  it.each(["CERT_CHAIN_UNTRUSTED", "HOSTNAME_MISMATCH", "CERT_EXPIRED"])("stops before DB connection for %s", async category => {
    const f = fixture(); f.deps.probe.mockRejectedValue(Object.assign(new Error("PREVIEW_SETUP_TLS_CONNECTIVITY_FAILED"), { category }));
    const error = await diagnoseIdentity(env(), f.deps).catch(e => e);
    expect(diagnosticConditions(error)).toEqual([`TLS_${category}`]);
    expect(f.deps.connect).not.toHaveBeenCalled(); expect(f.db.$queryRawUnsafe).not.toHaveBeenCalled();
  });
  it.each(["ofxqdwpyqbvskrcfpdmx", "mfxqiyidmdppvdzeboke", "production"])("rejects target %s before I/O", async ref => {
    const f = fixture(); await expect(diagnoseIdentity({ ...env(), PREVIEW_SETUP_APPROVED_PROJECT_REF: ref }, f.deps)).rejects.toThrow("CONFIGURATION_REJECTED");
    for (const fn of Object.values(f.deps)) expect(fn).not.toHaveBeenCalled();
  });
  it.each([
    { PREVIEW_SETUP_APPROVED_ENDPOINT: "unapproved:5432" }, { DATABASE_URL: "production" },
    { DIRECT_URL: "production" }, { NODE_TLS_REJECT_UNAUTHORIZED: "0" },
    { PREVIEW_SETUP_APPROVAL: `initialize:${target.projectRef}` }, { PREVIEW_SETUP_DATABASE_URL: undefined },
  ])("rejects incomplete or unsafe configuration before I/O", async override => {
    const f = fixture(); await expect(diagnoseIdentity({ ...env(), ...override }, f.deps)).rejects.toThrow("CONFIGURATION_REJECTED");
    for (const fn of Object.values(f.deps)) expect(fn).not.toHaveBeenCalled();
  });
  it("retains owner/context guards and does not authorize a cloud probe implicitly", async () => {
    const f = fixture(); await expect(diagnoseIdentity({ ...env(), CI: "true", GITHUB_ACTIONS: "true", GITHUB_ACTOR: "other" }, f.deps)).rejects.toThrow("APPROVAL_REJECTED");
    expect(f.deps.probe).not.toHaveBeenCalled(); expect(f.deps.connect).not.toHaveBeenCalled();
  });
  it.each(["P1011", "P1010", "P1000"])("sanitizes query/connection errors %s", async code => {
    const f = fixture(); f.db.$queryRawUnsafe.mockRejectedValue(Object.assign(new Error("private-value"), { code }));
    const error = await diagnoseIdentity(env(), f.deps).catch(e => e);
    expect(diagnosticConditions(error)).toEqual([`IDENTITY_QUERY_${{ P1011: "TLS", P1010: "PERMISSION", P1000: "AUTHENTICATION" }[code]}`]);
    expect(JSON.stringify(error)).not.toContain("private-value"); expect(f.db.$disconnect).toHaveBeenCalledOnce();
  });
  it("does not mask a failed identity check with a raw disconnect exception", async () => {
    const f = fixture([{ ...identity(), read_only: "off" }]);
    f.db.$disconnect.mockRejectedValue(new Error("private-value"));
    const error = await diagnoseIdentity(env(), f.deps).catch(e => e);
    expect(diagnosticConditions(error)).toEqual(["TRANSACTION_READ_ONLY"]);
    expect(JSON.stringify(error)).not.toContain("private-value");
  });
  it("sanitizes cleanup failure even after a successful SELECT", async () => {
    const f = fixture(); f.db.$disconnect.mockRejectedValue(new Error("private-value"));
    const error = await diagnoseIdentity(env(), f.deps).catch(e => e);
    expect(diagnosticConditions(error)).toEqual(["PREVIEW_SETUP_DIAGNOSTIC_DISCONNECT_FAILED"]);
  });
  it.each([["--verify-only"], ["--execute-approved-initialization"], ["--diagnose-identity", "--seed"]].map(args => ({ args })))("rejects unrelated CLI flags $args", ({ args }) => {
    const result = spawnSync(process.execPath, [resolve("scripts/preview/diagnose-identity.mjs"), ...args], {
      encoding: "utf8", timeout: 10000, env: { NODE_ENV: "test", PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, NODE_OPTIONS: process.env.NODE_OPTIONS },
    });
    expect(result.status).toBe(1); expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr.trim())).toEqual(["PREVIEW_SETUP_CONFIGURATION_REJECTED"]);
  });
});
