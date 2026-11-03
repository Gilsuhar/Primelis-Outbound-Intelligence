// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { assertVerificationIdentity, assertVerificationPrivileges, privilegeFields, privilegeQuery,
  verificationRole, verificationUrl, withReadOnlyContext, type Reader } from "../../scripts/preview/read-only-context.mjs";
import { identityQuery } from "../../scripts/preview/identity.mjs";
import { prismaTlsUrl } from "../../scripts/preview/tls-trust.mjs";
import { runSchemaDiff } from "../../scripts/preview/schema-diff.mjs";
import { setupPlan } from "../../scripts/preview/setup.mjs";
import { verificationRoleProposal } from "../../scripts/preview/verification-role-proposal.mjs";
import target from "../../scripts/preview/verified-target.json";

const url = () => prismaTlsUrl(`postgresql://${verificationRole}.${target.projectRef}:synthetic@aws-1-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require&sslaccept=strict`);
const identity = () => ({ database: "postgres", operator: verificationRole, effective_role: verificationRole,
  fingerprint: target.clusterFingerprint, read_only: "on", default_read_only: "on", session_superuser: false, effective_superuser: false });
const privileges = () => Object.fromEntries(privilegeFields.map(key => [key, true]));
function client(row = identity(), grants = privileges()) {
  const tx = { $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    $queryRawUnsafe: vi.fn().mockResolvedValueOnce([row]).mockResolvedValueOnce([grants]).mockResolvedValue([]) };
  const db = { $transaction: vi.fn(async (work: (value: Reader & { $executeRawUnsafe(sql: string): Promise<unknown> }) => Promise<unknown>, options?: unknown) => { void options; return work(tx); }),
    $disconnect: vi.fn().mockResolvedValue(undefined) };
  return { db, tx };
}

describe("server-backed read-only verification", () => {
  it("pins one transaction, sets READ ONLY before SELECT and checks identity/defaults/ACLs before work", async () => {
    const f = client(), work = vi.fn().mockResolvedValue("done");
    expect(await withReadOnlyContext(f.db, work)).toBe("done");
    expect(f.db.$transaction).toHaveBeenCalledOnce();
    expect(f.db.$transaction.mock.calls[0][1]).toEqual({ maxWait: 10000, timeout: 120000, isolationLevel: "RepeatableRead" });
    expect(f.tx.$executeRawUnsafe.mock.calls).toEqual([["SET TRANSACTION READ ONLY"]]);
    expect(f.tx.$executeRawUnsafe.mock.invocationCallOrder[0]).toBeLessThan(f.tx.$queryRawUnsafe.mock.invocationCallOrder[0]);
    expect(f.tx.$queryRawUnsafe.mock.calls).toEqual([[identityQuery], [privilegeQuery]]);
    expect(f.tx.$queryRawUnsafe.mock.invocationCallOrder[1]).toBeLessThan(work.mock.invocationCallOrder[0]);
    expect(Object.keys(work.mock.calls[0][0])).toEqual(["$queryRawUnsafe"]);
  });
  it.each(["read_only", "default_read_only"])("rejects %s off even after a successful SET", async field => {
    const f = client({ ...identity(), [field]: "off" }), work = vi.fn();
    await expect(withReadOnlyContext(f.db, work)).rejects.toThrow("READ_ONLY_REJECTED");
    expect(work).not.toHaveBeenCalled(); expect(f.tx.$queryRawUnsafe).toHaveBeenCalledOnce();
  });
  it("does not hide missing server defaults by setting the session default locally", async () => {
    const f = client({ ...identity(), default_read_only: "off" });
    await expect(withReadOnlyContext(f.db, vi.fn())).rejects.toThrow();
    expect(f.tx.$executeRawUnsafe.mock.calls).toEqual([["SET TRANSACTION READ ONLY"]]);
  });
  it("supports pooler connections without relying on startup options", () => {
    expect(new URL(verificationUrl(url())).searchParams.has("options")).toBe(false);
    expect(() => assertVerificationIdentity([identity()])).not.toThrow();
  });
  it.each(privilegeFields)("rejects absent or unsafe effective privilege %s", key => {
    for (const value of [false, undefined, "true"]) expect(() => assertVerificationPrivileges([{ ...privileges(), [key]: value }])).toThrow("READ_ONLY_REJECTED");
  });
  it.each([null, [], [{}, {}], [{}]])("rejects missing or ambiguous privilege results", rows => {
    expect(() => assertVerificationPrivileges(rows)).toThrow();
  });
  it.each([
    { database: "other" }, { operator: "postgres" }, { effective_role: "postgres" },
    { fingerprint: "wrong" }, { session_superuser: true }, { effective_superuser: true },
  ])("preserves exact identity and privilege checks", override => {
    expect(() => assertVerificationIdentity([{ ...identity(), ...override }])).toThrow();
  });
  it("stops on SET failure without an identity or application query", async () => {
    const f = client(), work = vi.fn(); f.tx.$executeRawUnsafe.mockRejectedValue(new Error("private-value"));
    const error = await withReadOnlyContext(f.db, work).catch(e => e);
    expect(String(error)).not.toContain("private-value"); expect(f.tx.$queryRawUnsafe).not.toHaveBeenCalled(); expect(work).not.toHaveBeenCalled();
  });
  it.each(["INSERT INTO x VALUES (1)", "UPDATE x SET a=1", "DELETE FROM x", "CREATE TABLE x(a int)", "DROP TABLE x",
    "TRUNCATE x", "SELECT 1; DELETE FROM x", "SELECT 1 INTO x", "SET TRANSACTION READ WRITE", "CALL x()"])("rejects write command %s before forwarding", async sql => {
    const f = client();
    await expect(withReadOnlyContext(f.db, db => db.$queryRawUnsafe(sql))).rejects.toThrow();
    expect(f.tx.$queryRawUnsafe.mock.calls).toEqual([[identityQuery], [privilegeQuery]]);
  });
});

describe("independent schema engine protection", () => {
  it.each(["administrator", "writable", "missing-default", "grants", "fingerprint"])("cannot launch diff with %s configuration", async failure => {
    const f = client({ ...identity(), ...(failure === "writable" ? { read_only: "off" } : {}),
      ...(failure === "fingerprint" ? { fingerprint: "wrong" } : {}) },
    { ...privileges(), ...(failure === "missing-default" ? { login_defaults: false } : {}), ...(failure === "grants" ? { no_table_writes: false } : {}) });
    const connect = vi.fn().mockResolvedValue(f.db), run = vi.fn();
    await expect(runSchemaDiff(failure === "administrator" ? url().replace(verificationRole, "postgres") : url(), run, {}, connect)).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
    if (failure === "administrator") expect(connect).not.toHaveBeenCalled();
    else expect(f.db.$disconnect).toHaveBeenCalledOnce();
  });
  it("freshly audits each invocation instead of reusing proof from another connection", async () => {
    const first = client(), second = client({ ...identity(), default_read_only: "off" });
    const connect = vi.fn().mockResolvedValueOnce(first.db).mockResolvedValueOnce(second.db);
    const run = vi.fn().mockReturnValue({ status: 0 });
    await runSchemaDiff(url(), run, {}, connect);
    await expect(runSchemaDiff(url(), run, {}, connect)).rejects.toThrow("READ_ONLY_REJECTED");
    expect(connect).toHaveBeenCalledTimes(2); expect(run).toHaveBeenCalledOnce();
    expect(first.tx.$queryRawUnsafe).toHaveBeenCalledTimes(2); expect(second.tx.$queryRawUnsafe).toHaveBeenCalledOnce();
  });
  it.each(["&options=-c%20default_transaction_read_only=off", "&sslaccept=accept_invalid_certs", "&host=production"])("rejects client overrides %s", suffix => {
    expect(() => verificationUrl(url() + suffix)).toThrow();
  });
  it("requires a separate verification credential and explicit approval; no admin fallback", () => {
    const input = { PREVIEW_SETUP_APPROVED_PROJECT_REF: target.projectRef, PREVIEW_SETUP_PROJECT_NAME: target.projectName,
      PREVIEW_SETUP_APPROVAL: `verify-readonly:${target.projectRef}`, PREVIEW_SETUP_APPROVED_ENDPOINT: "aws-1-us-west-2.pooler.supabase.com:5432",
      PREVIEW_VERIFY_DATABASE_URL: new URL(url()).toString().replace(/&sslcert=[^&]+/, "") };
    expect(setupPlan(input, undefined, "verify-readonly").migrations).toHaveLength(11);
    for (const override of [{ PREVIEW_VERIFY_DATABASE_URL: undefined }, { PREVIEW_SETUP_DATABASE_URL: "private-value" },
      { PREVIEW_SETUP_APPROVAL: `verify:${target.projectRef}` }, { PREVIEW_VERIFY_DATABASE_URL: input.PREVIEW_VERIFY_DATABASE_URL.replace(verificationRole, "postgres") }])
      expect(() => setupPlan({ ...input, ...override }, undefined, "verify-readonly")).toThrow("CONFIGURATION_REJECTED");
  });
});

describe("unexecuted restricted-role SQL proposal", () => {
  it("matches deterministic reviewed SQL with target/checksum guards and NOLOGIN", () => {
    const sql = verificationRoleProposal();
    expect(readFileSync("scripts/preview/verification-role.sql", "utf8").replace(/\r\n/g, "\n")).toBe(sql);
    expect(sql).toContain(target.clusterFingerprint);
    expect(sql).toContain("NOLOGIN PASSWORD NULL NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT NOBYPASSRLS");
    for (const migration of target.migrations) expect(sql).toContain(migration);
    expect(sql).toContain("ROLE_ALREADY_EXISTS"); expect(sql).toContain("PRIVILEGES_REJECTED");
    expect(sql).not.toMatch(/ALTER ROLE postgres|ALTER DATABASE|\bBYPASSRLS;|GRANT (INSERT|UPDATE|DELETE|ALL)|ALTER TABLE|SET ROLE postgres/);
    expect((sql.match(/CREATE POLICY recycler_preview_verify_select/g) ?? [])).toHaveLength(51);
    expect((sql.match(/AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING \(true\)/g) ?? [])).toHaveLength(51);
  });
  it("limits the local administrative audit workflow to explicit verification without provisioning", () => {
    const workflow = readFileSync(".github/workflows/preview-database-setup.yml", "utf8");
    expect(workflow).toContain("node scripts/preview/audit-admin.mjs --plan");
    expect(workflow).toContain("node scripts/preview/audit-admin.mjs --audit-with-prisma-diff");
    expect(workflow).toContain("PREVIEW_ADMIN_DIFF_APPROVAL: privileged-read-only-prisma-diff");
    expect(workflow).not.toMatch(/verify-only\.mjs|verification-role|migrate deploy|migrate reset|db push|psql/);
  });
});
