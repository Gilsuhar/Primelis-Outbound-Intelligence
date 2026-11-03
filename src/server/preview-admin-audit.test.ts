// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { auditPreview, withAdministrativeAudit } from "../../scripts/preview/audit-admin.mjs";
import { reviewedFiles } from "../../scripts/preview/verification.mjs";
import { caPath } from "../../scripts/preview/tls-trust.mjs";
import { verificationReport } from "../../scripts/preview/verification-errors.mjs";
import target from "../../scripts/preview/verified-target.json";

const env = () => ({ PREVIEW_SETUP_APPROVED_PROJECT_REF: target.projectRef,
  PREVIEW_SETUP_PROJECT_NAME: target.projectName, PREVIEW_SETUP_APPROVAL: `audit-admin:${target.projectRef}`,
  PREVIEW_ADMIN_DIFF_APPROVAL: "privileged-read-only-prisma-diff",
  PREVIEW_SETUP_APPROVED_ENDPOINT: "aws-1-us-west-2.pooler.supabase.com:5432",
  PREVIEW_SETUP_DATABASE_URL: `postgresql://postgres.${target.projectRef}:synthetic@aws-1-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require&sslaccept=strict` });
const files = reviewedFiles(target.migrations, path => Buffer.from(readFileSync(path, "utf8").replace(/\r\n/g, "\n")));
function fixture() {
  const identity = { database: "postgres", operator: "postgres", effective_role: "postgres", fingerprint: target.clusterFingerprint,
    session_superuser: false, effective_superuser: false, read_only: "off", default_read_only: "off", unfiltered: false };
  const history = target.migrations.map(migration_name => ({ migration_name,
    checksum: files.hashes[`prisma/migrations/${migration_name}/migration.sql`], finished_at: new Date(), rolled_back_at: null, applied_steps_count: 1 }));
  const tables = files.tables.map(name => ({ name, rls: true, api_access: false }));
  const untouched = { auth_users: 0, runtime_roles: 0, policies: 0 };
  const counts = files.tables.slice(1).map(() => ({ count: 0 }));
  const query = vi.fn(async (sql: string) => {
    if (sql.startsWith("SELECT identity.*")) return [identity];
    if (sql.startsWith("SELECT migration_name")) return history;
    if (sql.startsWith("SELECT c.relname AS name")) return tables;
    if (sql.startsWith("SELECT (SELECT count(id)")) return [untouched];
    if (sql.startsWith("SELECT count(*)::int AS count")) return counts;
    throw new Error("UNREVIEWED_QUERY");
  });
  const execute = vi.fn(async (sql: string) => {
    if (sql === "SET TRANSACTION READ ONLY") identity.read_only = "on";
    else if (sql === "SET LOCAL default_transaction_read_only = on") identity.default_read_only = "on";
    else if (sql === "SET LOCAL row_security = off") identity.unfiltered = true;
    else throw new Error("UNREVIEWED_EXECUTION");
    return 0;
  });
  const tx = { $queryRawUnsafe: query, $executeRawUnsafe: execute };
  const db = { $transaction: vi.fn(async (work: (t: typeof tx) => Promise<unknown>) => {
    Object.assign(identity, { read_only: "off", default_read_only: "off", unfiltered: false });
    return work(tx);
  }), $disconnect: vi.fn().mockResolvedValue(undefined) };
  const deps = { connect: vi.fn().mockResolvedValue(db), authorize: vi.fn().mockResolvedValue(undefined),
    probe: vi.fn().mockResolvedValue(undefined), run: vi.fn().mockReturnValue({ status: 0 }),
    migrate: vi.fn(), reset: vi.fn(), seed: vi.fn() };
  return { identity, history, tables, untouched, counts, query, execute, db, deps };
}

describe("explicit one-time administrative schema audit", () => {
  it("plans without network and requires distinct approval, never an administrator fallback", async () => {
    const f = fixture();
    expect(await auditPreview(env(), false, f.deps)).toMatchObject({ status: "ADMINISTRATIVE_AUDIT_PLAN_VALIDATED", migrationCount: 11 });
    for (const fn of Object.values(f.deps)) expect(fn).not.toHaveBeenCalled();
  });
  it.each([
    { PREVIEW_ADMIN_DIFF_APPROVAL: undefined }, { PREVIEW_ADMIN_DIFF_APPROVAL: "true" },
    { PREVIEW_SETUP_APPROVAL: `initialize:${target.projectRef}` }, { PREVIEW_SETUP_APPROVAL: `verify-readonly:${target.projectRef}` },
    { PREVIEW_SETUP_DATABASE_URL: undefined }, { PREVIEW_VERIFY_DATABASE_URL: "present" },
    { DATABASE_URL: "production" }, { DIRECT_URL: "production" }, { VERCEL: "1" }, { NODE_TLS_REJECT_UNAUTHORIZED: "0" },
    { PREVIEW_SETUP_APPROVED_PROJECT_REF: "ofxqdwpyqbvskrcfpdmx" }, { PREVIEW_SETUP_APPROVED_PROJECT_REF: "mfxqiyidmdppvdzeboke" },
    { PREVIEW_SETUP_APPROVED_ENDPOINT: "wrong:5432" },
  ])("rejects unauthorized configuration before I/O: %j", async override => {
    const f = fixture();
    await expect(auditPreview({ ...env(), ...override }, true, f.deps)).rejects.toThrow("CONFIGURATION_REJECTED");
    expect(f.deps.connect).not.toHaveBeenCalled(); expect(f.deps.run).not.toHaveBeenCalled();
  });
  it("audits before and after one fixed diff, with no policies/grants or migration command", async () => {
    const f = fixture(); const result = await auditPreview(env(), true, f.deps);
    expect(result).toMatchObject({ status: "ADMINISTRATIVE_SCHEMA_AUDIT_PASSED", tableCount: 50,
      migrationCount: 11, schemaComparison: "MATCH", diffProtection: "REVIEWED_COMMAND_WITH_PRIVILEGED_CREDENTIAL" });
    expect(f.db.$transaction).toHaveBeenCalledTimes(2);
    expect(f.execute.mock.calls.map(c => c[0])).toEqual(Array(2).fill([
      "SET TRANSACTION READ ONLY", "SET LOCAL default_transaction_read_only = on", "SET LOCAL row_security = off",
    ]).flat());
    for (const [sql] of f.query.mock.calls) expect(sql).toMatch(/^SELECT /);
    expect(f.deps.run).toHaveBeenCalledOnce();
    const [command, args, options] = f.deps.run.mock.calls[0];
    expect(command).toBe(process.execPath);
    expect(args).toEqual([resolve("node_modules/prisma/build/index.js"), "migrate", "diff", "--from-schema-datasource",
      resolve("prisma/schema.prisma"), "--to-schema-datamodel", resolve("prisma/schema.prisma"), "--exit-code"]);
    expect(options).toMatchObject({ shell: false, timeout: 60000, stdio: ["ignore", "pipe", "pipe"] });
    expect(options.env.DATABASE_URL).toBe(options.env.DIRECT_URL);
    expect(options.env.DATABASE_URL).toBe(f.deps.connect.mock.calls[0][0]);
    expect(new URL(options.env.DATABASE_URL).searchParams.get("sslcert")).toBe(caPath);
    expect(Object.keys(options.env).sort()).toEqual(["CHECKPOINT_DISABLE", "DATABASE_URL", "DIRECT_URL"]);
    for (const fn of [f.deps.migrate, f.deps.reset, f.deps.seed]) expect(fn).not.toHaveBeenCalled();
    expect(f.db.$disconnect).toHaveBeenCalledOnce();
  });
  it.each(["database", "operator", "effective_role", "fingerprint", "session_superuser", "effective_superuser"])("rejects bad identity %s before diff", async key => {
    const f = fixture(); Object.assign(f.identity, { [key]: key.endsWith("superuser") ? true : "wrong" });
    await expect(auditPreview(env(), true, f.deps)).rejects.toThrow("TARGET_REJECTED");
    expect(f.deps.run).not.toHaveBeenCalled(); expect(f.db.$disconnect).toHaveBeenCalledOnce();
  });
  it.each(["SET TRANSACTION READ ONLY", "SET LOCAL default_transaction_read_only = on", "SET LOCAL row_security = off"])("rejects an ineffective %s", async ignored => {
    const f = fixture(); const original = f.execute.getMockImplementation()!;
    f.execute.mockImplementation(sql => sql === ignored ? Promise.resolve(0) : original(sql));
    await expect(auditPreview(env(), true, f.deps)).rejects.toThrow(/^PREVIEW_SETUP_/);
    expect(f.deps.run).not.toHaveBeenCalled();
  });
  it.each(["history", "checksum", "rls", "api", "policies", "auth", "seed"])("fails closed for %s without diff or repair", async failure => {
    const f = fixture();
    if (failure === "history") f.history.pop();
    if (failure === "checksum") f.history[0].checksum = "wrong";
    if (failure === "rls") f.tables[0].rls = false;
    if (failure === "api") f.tables[0].api_access = true;
    if (failure === "policies") f.untouched.policies = 51;
    if (failure === "auth") f.untouched.auth_users = 1;
    if (failure === "seed") f.counts[0].count = 1;
    await expect(auditPreview(env(), true, f.deps)).rejects.toThrow(/^PREVIEW_SETUP_/);
    expect(f.deps.run).not.toHaveBeenCalled();
  });
  it.each([[2, "SCHEMA_DRIFT"], [1, "COMMAND_ERROR"]])("distinguishes CLI exit %s with no retry", async (status, category) => {
    const f = fixture(); f.deps.run.mockReturnValue({ status, stderr: "private-value" });
    const error = await auditPreview(env(), true, f.deps).catch(e => e);
    expect(verificationReport(error)).toMatchObject({ stage: "SCHEMA_DIFF", category });
    expect(JSON.stringify(verificationReport(error))).not.toContain("private-value");
    expect(f.deps.run).toHaveBeenCalledOnce(); expect(f.db.$transaction).toHaveBeenCalledOnce();
  });
  it("never masks post-comparison changes with a successful diff result", async () => {
    const f = fixture(); f.deps.run.mockImplementation(() => { f.tables[0].rls = false; return { status: 0 }; });
    await expect(auditPreview(env(), true, f.deps)).rejects.toThrow("RLS_VERIFICATION_FAILED");
  });
  it("retains owner authorization before database I/O", async () => {
    const f = fixture();
    await expect(auditPreview({ ...env(), CI: "true", GITHUB_ACTIONS: "true", GITHUB_ACTOR: "other" }, true, f.deps)).rejects.toThrow("APPROVAL_REJECTED");
    expect(f.deps.probe).not.toHaveBeenCalled(); expect(f.deps.run).not.toHaveBeenCalled();
  });
  it.each(["DELETE FROM public.test", "SELECT 1; DROP TABLE test", "SET TRANSACTION READ WRITE"])("does not expose mutation access: %s", async sql => {
    const f = fixture(); await expect(withAdministrativeAudit(f.db, tx => tx.$queryRawUnsafe(sql))).rejects.toThrow("READ_ONLY_REJECTED");
  });
  it("rejects an initialization CLI argument without loading credentials or connecting", () => {
    const result = spawnSync(process.execPath, [resolve("scripts/preview/audit-admin.mjs"), "--execute-approved-initialization"], {
      encoding: "utf8", timeout: 10000, env: { NODE_ENV: "test", PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, NODE_OPTIONS: process.env.NODE_OPTIONS },
    });
    expect(result.status).toBe(1); expect(result.stderr).toContain("CONFIGURATION_REJECTED"); expect(result.stdout).toBe("");
  });
});
