// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { verifyPreview } from "../../scripts/preview/verify-only.mjs";
import { classifyDiff, readOnlyUrl, runSchemaDiff } from "../../scripts/preview/schema-diff.mjs";
import { verificationReport } from "../../scripts/preview/verification-errors.mjs";
import { initializePreview } from "../../scripts/preview/setup.mjs";
import { caPath, prismaTlsUrl } from "../../scripts/preview/tls-trust.mjs";
import { reviewedFiles } from "../../scripts/preview/verification.mjs";
import target from "../../scripts/preview/verified-target.json";

const env = () => ({ PREVIEW_SETUP_APPROVED_PROJECT_REF: target.projectRef, PREVIEW_SETUP_PROJECT_NAME: target.projectName,
  PREVIEW_SETUP_APPROVAL: `verify:${target.projectRef}`, PREVIEW_SETUP_APPROVED_ENDPOINT: "aws-1-us-west-2.pooler.supabase.com:5432",
  PREVIEW_SETUP_DATABASE_URL: `postgresql://postgres.${target.projectRef}:synthetic@aws-1-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require&sslaccept=strict` });
const files = reviewedFiles(target.migrations, path => Buffer.from(readFileSync(path, "utf8").replace(/\r\n/g, "\n")));
function fixture() {
  const identity = [{ database: "postgres", operator: "postgres", fingerprint: target.clusterFingerprint, read_only: "on" }];
  const history = target.migrations.map(migration_name => ({ migration_name, checksum: files.hashes[`prisma/migrations/${migration_name}/migration.sql`],
    finished_at: new Date(), rolled_back_at: null, applied_steps_count: 1 }));
  const tables = files.tables.map(name => ({ name, rls: true, api_access: false }));
  const untouched = [{ auth_users: 0, runtime_roles: 0, policies: 0 }];
  const counts = files.tables.filter(name => name !== "_prisma_migrations").map(() => ({ count: 0 }));
  const db = { $queryRawUnsafe: vi.fn().mockResolvedValueOnce(identity).mockResolvedValueOnce(history)
    .mockResolvedValueOnce(tables).mockResolvedValueOnce(untouched).mockResolvedValueOnce(counts), $disconnect: vi.fn() };
  const deps = { connect: vi.fn().mockResolvedValue(db), authorize: vi.fn().mockResolvedValue(undefined),
    probe: vi.fn().mockResolvedValue(undefined), diff: vi.fn().mockResolvedValue(undefined), migrate: vi.fn(), reset: vi.fn(), seed: vi.fn() };
  return { identity, history, tables, untouched, counts, db, deps };
}

describe("initialized Preview verification without writes", () => {
  it("plans without I/O and requires verification-specific approval", async () => {
    const f = fixture();
    expect(await verifyPreview(env(), false, f.deps)).toMatchObject({ status: "VERIFICATION_PLAN_VALIDATED", migrationCount: 11 });
    for (const fn of Object.values(f.deps)) expect(fn).not.toHaveBeenCalled();
    await expect(verifyPreview({ ...env(), PREVIEW_SETUP_APPROVAL: `initialize:${target.projectRef}` }, true, f.deps)).rejects.toThrow("CONFIGURATION_REJECTED");
  });
  it("checks existing history, RLS, zero rows and diff using the same pinned CA in read-only mode", async () => {
    const f = fixture();
    expect(await verifyPreview(env(), true, f.deps)).toMatchObject({ status: "EXISTING_SCHEMA_VERIFIED", migrationCount: 11, tableCount: 50 });
    for (const sql of f.db.$queryRawUnsafe.mock.calls.map(c => c[0] as string)) expect(sql).toMatch(/^SELECT /);
    const url = new URL(f.deps.connect.mock.calls[0][0]);
    expect(url.searchParams.get("options")).toBe("-c default_transaction_read_only=on");
    expect(url.searchParams.get("sslcert")).toBe(caPath);
    expect(new URL(f.deps.diff.mock.calls[0][0]).searchParams.get("sslcert")).toBe(caPath);
    for (const fn of [f.deps.migrate, f.deps.reset, f.deps.seed]) expect(fn).not.toHaveBeenCalled();
    expect(f.db.$disconnect).toHaveBeenCalledOnce();
  });
  it.each(["missing-history", "checksum", "unfinished", "rls", "api-privileges", "auth-users", "runtime-role", "seed", "read-only", "fingerprint"])("fails closed for %s without writes", async failure => {
    const f = fixture();
    if (failure === "missing-history") f.history.length = 0;
    if (failure === "checksum") f.history[0].checksum = "incorrect";
    if (failure === "unfinished") Object.assign(f.history[0], { finished_at: null });
    if (failure === "rls") f.tables[0].rls = false;
    if (failure === "api-privileges") f.tables[0].api_access = true;
    if (failure === "auth-users") f.untouched[0].auth_users = 1;
    if (failure === "runtime-role") f.untouched[0].runtime_roles = 1;
    if (failure === "seed") f.counts[0].count = 1;
    if (failure === "read-only") f.identity[0].read_only = "off";
    if (failure === "fingerprint") f.identity[0].fingerprint = "wrong";
    await expect(verifyPreview(env(), true, f.deps)).rejects.toThrow(/^PREVIEW_SETUP_/);
    for (const fn of [f.deps.migrate, f.deps.reset, f.deps.seed, f.deps.diff]) expect(fn).not.toHaveBeenCalled();
    expect(f.db.$disconnect).toHaveBeenCalledOnce();
  });
  it("classifies an absent history relation without exposing query errors", async () => {
    const f = fixture();
    f.db.$queryRawUnsafe.mockReset().mockResolvedValueOnce(f.identity)
      .mockRejectedValueOnce(Object.assign(new Error("private-value"), { code: "P2010", meta: { code: "42P01" } }));
    const error = await verifyPreview(env(), true, f.deps).catch(e => e);
    expect(verificationReport(error)).toEqual({ code: "PREVIEW_SETUP_HISTORY_MISSING", stage: "HISTORY", category: "MISSING_HISTORY" });
    expect(JSON.stringify(error)).not.toContain("private-value");
  });
  it("retains the failing query stage and permission category", async () => {
    const f = fixture();
    f.db.$queryRawUnsafe.mockReset().mockResolvedValueOnce(f.identity).mockResolvedValueOnce(f.history)
      .mockRejectedValueOnce(Object.assign(new Error("private-value"), { code: "P2010", meta: { code: "42501" } }));
    const error = await verifyPreview(env(), true, f.deps).catch(e => e);
    expect(verificationReport(error)).toEqual({ code: "PREVIEW_SETUP_VERIFICATION_QUERY_FAILED", stage: "TABLE_RLS", category: "PERMISSION" });
    expect(f.deps.diff).not.toHaveBeenCalled(); expect(f.deps.migrate).not.toHaveBeenCalled();
    expect(f.db.$disconnect).toHaveBeenCalledOnce();
  });
  it.each([["--execute-approved-initialization"], ["--reset"], ["--verify-only", "--seed"]].map(args => ({ args })))("rejects unsafe verification CLI arguments $args before I/O", ({ args }) => {
    const result = spawnSync(process.execPath, [resolve("scripts/preview/verify-only.mjs"), ...args], {
      encoding: "utf8", timeout: 10000,
      env: { NODE_ENV: "test", PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, NODE_OPTIONS: process.env.NODE_OPTIONS },
    });
    expect(result.status).toBe(1); expect(result.stderr).toContain("PREVIEW_SETUP_CONFIGURATION_REJECTED");
    expect(result.stdout).toBe("");
  });
  it.each(["P1011", "P1010", "P1000"])("classifies identity connection error %s", async code => {
    const f = fixture(); f.deps.connect.mockRejectedValue(Object.assign(new Error("private-value"), { code }));
    const error = await verifyPreview(env(), true, f.deps).catch(e => e);
    expect(verificationReport(error)).toMatchObject({ stage: "IDENTITY", category: { P1011: "TLS", P1010: "PERMISSION", P1000: "AUTHENTICATION" }[code] });
    expect(f.deps.diff).not.toHaveBeenCalled(); expect(f.deps.migrate).not.toHaveBeenCalled();
  });
  it("never initializes an existing database, even with initialization approval", async () => {
    const f = fixture();
    f.db.$queryRawUnsafe.mockReset().mockResolvedValueOnce(f.identity).mockResolvedValueOnce([{ name: "_prisma_migrations" }]);
    await expect(initializePreview({ ...env(), PREVIEW_SETUP_APPROVAL: `initialize:${target.projectRef}` }, true, f.deps)).rejects.toThrow("DATABASE_NOT_EMPTY");
    expect(f.deps.migrate).not.toHaveBeenCalled();
  });
  it("refuses a reused verification approval as initialization approval", async () => {
    const f = fixture(); await expect(initializePreview(env(), true, f.deps)).rejects.toThrow("CONFIGURATION_REJECTED");
    expect(f.deps.connect).not.toHaveBeenCalled();
  });
  it("keeps cloud owner/context validation in the verification path", async () => {
    const f = fixture(); await expect(verifyPreview({ ...env(), CI: "true", GITHUB_ACTIONS: "true", GITHUB_ACTOR: "other" }, true, f.deps)).rejects.toThrow("APPROVAL_REJECTED");
    expect(f.deps.connect).not.toHaveBeenCalled();
  });
  it("propagates genuine drift without migrations or retry", async () => {
    const f = fixture(); f.deps.diff.mockImplementation(async () => classifyDiff({ status: 2 }));
    const error = await verifyPreview(env(), true, f.deps).catch(e => e);
    expect(verificationReport(error)).toEqual({ code: "PREVIEW_SETUP_SCHEMA_DRIFT", stage: "SCHEMA_DIFF", category: "SCHEMA_DRIFT" });
    expect(f.deps.diff).toHaveBeenCalledOnce(); expect(f.deps.migrate).not.toHaveBeenCalled();
    expect(f.db.$disconnect).toHaveBeenCalledOnce();
  });
});

describe("Prisma diff exit-code and subprocess safety", () => {
  it("accepts only empty-diff exit zero", () => expect(() => classifyDiff({ status: 0 })).not.toThrow());
  it.each([
    [{ status: 2 }, "SCHEMA_DRIFT", "SCHEMA_DRIFT"],
    [{ status: 1, stderr: "Error: P1011\nprivate-value" }, "DIFF_COMMAND_FAILED", "TLS"],
    [{ status: 1, stderr: "Error: P1000\nprivate-value" }, "DIFF_COMMAND_FAILED", "AUTHENTICATION"],
    [{ status: 1, stderr: "Error: P1001\nprivate-value" }, "DIFF_COMMAND_FAILED", "CONNECTIVITY"],
    [{ status: 1, stderr: "Error: P1010\nprivate-value" }, "DIFF_COMMAND_FAILED", "PERMISSION"],
    [{ status: 1, stderr: "Error: P1012\nprivate-value" }, "DIFF_COMMAND_FAILED", "CONFIGURATION"],
    [{ status: 1, stderr: "unknown option private-value" }, "DIFF_COMMAND_FAILED", "COMMAND_ERROR"],
    [{ status: null, error: { code: "ETIMEDOUT" } }, "DIFF_TIMEOUT", "TIMEOUT"],
    [{ status: 2, signal: "SIGTERM" }, "DIFF_PROCESS_FAILED", "PROCESS_ERROR"],
    [{ status: 0, error: { code: "ENOENT" } }, "DIFF_PROCESS_FAILED", "PROCESS_ERROR"],
  ] as const)("classifies %j without treating command failure as drift", (result, code, category) => {
    let error; try { classifyDiff(result); } catch (e) { error = e; }
    expect(verificationReport(error)).toEqual({ code: `PREVIEW_SETUP_${code}`, stage: "SCHEMA_DIFF", category });
    expect(JSON.stringify(error)).not.toContain("private-value");
  });
  it("invokes only read-only diff, with no URL arguments, script, shadow DB or inherited credentials", async () => {
    const run = vi.fn().mockReturnValue({ status: 0 });
    const url = prismaTlsUrl(env().PREVIEW_SETUP_DATABASE_URL);
    await runSchemaDiff(url, run, { PATH: "safe", HOME: "excluded", OPENAI_API_KEY: "private-value", DATABASE_URL: "production" });
    expect(run).toHaveBeenCalledOnce();
    const [, args, options] = run.mock.calls[0];
    expect(args.slice(1)).toEqual(["migrate", "diff", "--from-schema-datasource", resolve("prisma/schema.prisma"), "--to-schema-datamodel", resolve("prisma/schema.prisma"), "--exit-code"]);
    expect(args.join(" ")).not.toMatch(/synthetic|deploy|reset|seed|--script|--shadow/);
    expect(options).toMatchObject({ shell: false, timeout: 60000, stdio: ["ignore", "pipe", "pipe"] });
    expect(Object.keys(options.env).sort()).toEqual(["CHECKPOINT_DISABLE", "DATABASE_URL", "DIRECT_URL", "PATH"]);
    expect(options.env.DATABASE_URL).toBe(options.env.DIRECT_URL);
    expect(new URL(options.env.DATABASE_URL).searchParams.get("options")).toBe("-c default_transaction_read_only=on");
  });
  it("sanitizes synchronous process errors", async () => {
    await expect(runSchemaDiff(prismaTlsUrl(env().PREVIEW_SETUP_DATABASE_URL), () => { throw new Error("private-value"); })).rejects.toThrow(/^PREVIEW_SETUP_DIFF_PROCESS_FAILED$/);
  });
  it("rejects user-supplied startup options or trust-file substitution", () => {
    const url = prismaTlsUrl(env().PREVIEW_SETUP_DATABASE_URL);
    expect(() => readOnlyUrl(`${url}&options=unsafe`)).toThrow("CONFIGURATION_REJECTED");
    const altered = new URL(url); altered.searchParams.set("sslcert", "unapproved");
    expect(() => readOnlyUrl(altered.toString())).toThrow("CONFIGURATION_REJECTED");
  });
  it("confirms real pinned Prisma 5.22 CLI exit codes offline", () => {
    const base = [resolve("node_modules/prisma/build/index.js"), "migrate", "diff"];
    const cliEnv: NodeJS.ProcessEnv = { NODE_ENV: "test", PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, CHECKPOINT_DISABLE: "1",
      NODE_OPTIONS: process.env.NODE_OPTIONS, PRISMA_SCHEMA_ENGINE_BINARY: process.env.PRISMA_SCHEMA_ENGINE_BINARY };
    const run = (args: string[]) => spawnSync(process.execPath, [...base, ...args], { env: cliEnv, encoding: "utf8", timeout: 30000 });
    const same = run(["--from-schema-datamodel", resolve("prisma/schema.prisma"), "--to-schema-datamodel", resolve("prisma/schema.prisma"), "--exit-code"]);
    const drift = run(["--from-empty", "--to-schema-datamodel", resolve("prisma/schema.prisma"), "--exit-code"]);
    const invalid = run(["--unrecognized-option"]);
    expect(same.status).toBe(0); expect(drift.status).toBe(2); expect(invalid.status).toBe(1);
    expect(() => classifyDiff(drift)).toThrow("SCHEMA_DRIFT");
    expect(() => classifyDiff(invalid)).toThrow("DIFF_COMMAND_FAILED");
  }, 60000);
});
