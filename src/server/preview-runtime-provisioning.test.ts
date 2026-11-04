// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, it, expect, vi } from "vitest";
import { clientImage, clientVersion, connectionFiles, dockerArguments, checkedResult, runtimeRolePlan, provisionRuntimeRole } from "../../scripts/preview/provision-runtime-role.mjs";
import { runtimeAuditSql } from "../../scripts/preview/runtime-provisioning-sql.mjs";
import { branchPrefix, repository, repositoryId, ownerId, workflow } from "../../scripts/preview/github-context.mjs";
import { runtimeAccessQuery } from "../../scripts/preview/runtime-access.mjs";
import { clientDiagnostic } from "../../scripts/preview/psql-tls-session.mjs";

const ref = "txfxfrlhtvzwgluhnbpw", sha = "a".repeat(40);
const env = () => ({ CI: "true", GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: repository, GITHUB_REPOSITORY_ID: repositoryId,
  GITHUB_REPOSITORY_OWNER_ID: ownerId, GITHUB_ACTOR_ID: ownerId, GITHUB_ACTOR: "Gilsuhar", GITHUB_TRIGGERING_ACTOR: "Gilsuhar",
  GITHUB_REF: `refs/heads/${branchPrefix}${sha}`, GITHUB_REF_TYPE: "branch", GITHUB_SHA: sha, GITHUB_WORKFLOW_SHA: sha,
  GITHUB_WORKFLOW_REF: `${repository}/${workflow}@refs/heads/${branchPrefix}${sha}`, GITHUB_EVENT_NAME: "push", GITHUB_RUN_ATTEMPT: "1", GITHUB_RUN_ID: "123",
  PREVIEW_SETUP_APPROVED_PROJECT_REF: ref, PREVIEW_SETUP_PROJECT_NAME: "agent-workforce-preview",
  PREVIEW_SETUP_APPROVAL: `provision-runtime-role:${ref}`, PREVIEW_SETUP_ENVIRONMENT: "agent-workforce-preview-setup",
  PREVIEW_SETUP_APPROVED_ENDPOINT: "aws-1-us-west-2.pooler.supabase.com:5432", PREVIEW_SETUP_APPROVED_SHA: sha,
  PREVIEW_SETUP_PUSH_CREATED: "true", PREVIEW_SETUP_PUSH_DELETED: "false", PREVIEW_SETUP_PUSH_FORCED: "false", PREVIEW_SETUP_PUSH_BEFORE: "0".repeat(40),
  PREVIEW_SETUP_DATABASE_URL: `postgresql://postgres.${ref}:synthetic-only@aws-1-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require&sslaccept=strict` });
const output = (status: string, schema = "a".repeat(64)) => ({ status: 0, clientTls: "VERIFIED", stdout: JSON.stringify({ status, schema, backendTls: "REPORTED_NO_TLS" }) + "\n" });
const deps = () => ({ testing: true, authorize: vi.fn().mockResolvedValue(undefined), probe: vi.fn().mockResolvedValue(undefined),
  client: vi.fn().mockResolvedValueOnce({ status: 0, stdout: clientVersion + "\n" })
    .mockResolvedValueOnce(output("PREFLIGHT_PASSED")).mockResolvedValueOnce(output("POSTCHECK_PASSED")) });

describe("owner-authorized runtime role transport", () => {
  it("validates a plan without network or subprocesses", async () => {
    const d = deps(); expect(await provisionRuntimeRole(env(), false, d)).toMatchObject({ migrationCount: 11 });
    expect(d.authorize).not.toHaveBeenCalled(); expect(d.probe).not.toHaveBeenCalled(); expect(d.client).not.toHaveBeenCalled();
  });
  it.each([
    { GITHUB_ACTOR_ID: "1" }, { GITHUB_TRIGGERING_ACTOR: "other" }, { GITHUB_RUN_ATTEMPT: "2" },
    { PREVIEW_SETUP_PUSH_CREATED: "false" }, { PREVIEW_SETUP_PUSH_FORCED: "true" },
    { GITHUB_REF: "refs/heads/main" }, { PREVIEW_SETUP_APPROVED_SHA: "b".repeat(40) },
    { PREVIEW_SETUP_APPROVED_ENDPOINT: "production.invalid:5432" }, { PREVIEW_SETUP_APPROVED_PROJECT_REF: "ofxqdwpyqbvskrcfpdmx" },
    { PREVIEW_SETUP_APPROVED_PROJECT_REF: "mfxqiyidmdppvdzeboke" }, { PREVIEW_SETUP_APPROVAL: `initialize:${ref}` },
    { DATABASE_URL: "not-authorized" }, { PGSSLMODE: "disable" }, { PGHOSTADDR: "127.0.0.1" },
    { DOCKER_HOST: "remote.invalid" }, { OPENSSL_CONF: "untrusted" }, { NODE_TLS_REJECT_UNAUTHORIZED: "0" },
    { PREVIEW_SETUP_DATABASE_URL: env().PREVIEW_SETUP_DATABASE_URL.replace("sslaccept=strict", "sslaccept=accept_invalid_certs") },
  ])("rejects unsafe context %# before any connection", async override => {
    const d = deps(); await expect(provisionRuntimeRole({ ...env(), ...override }, true, d)).rejects.toThrow();
    expect(d.authorize).not.toHaveBeenCalled(); expect(d.client).not.toHaveBeenCalled();
  });
  it("preserves escaped passwords only in the private password file", () => {
    const value = connectionFiles(env().PREVIEW_SETUP_DATABASE_URL.replace("synthetic-only", "synthetic%3Aonly%5Cvalue"));
    expect(value.passfile).toContain("synthetic\\:only\\\\value");
    const args = dockerArguments("/private/example", "test", value.env);
    expect(args.join(" ")).not.toContain("synthetic");
    expect(args).toContain("PGSSLMODE=verify-full"); expect(args).toContain("PGSSLROOTCERT=/run/preview/ca.crt");
    expect(args).toContain("PGGSSENCMODE=disable"); expect(args).toContain("--no-password");
    expect(args).toContain("--set=ON_ERROR_STOP=1"); expect(args).toContain("--pull=never");
    expect(args).toContain("--set=VERBOSITY=verbose"); expect(args).toContain("--set=SHOW_CONTEXT=never");
    expect(args).toContain(clientImage); expect(args).toContain("/usr/lib/postgresql/17/bin/psql");
    expect(args).toContain("--read-only"); expect(args).toContain("--file=-");
  });
  it.each(["%0A", "%0D", "%00"])("rejects password-file injection %s", encoding => {
    expect(() => runtimeRolePlan({ ...env(), PREVIEW_SETUP_DATABASE_URL: env().PREVIEW_SETUP_DATABASE_URL.replace("synthetic-only", `synthetic${encoding}only`) })).toThrow();
  });
  it("runs one guarded transaction and a separate read-only postcheck", async () => {
    const d = deps(); expect(await provisionRuntimeRole(env(), true, d)).toMatchObject({ status: "ROLE_APPLIED_AND_VERIFIED", login: false, migrationCount: 11,
      clientTls: "VERIFIED", backendTlsBefore: "REPORTED_NO_TLS", backendTlsAfter: "REPORTED_NO_TLS" });
    expect(d.client.mock.calls.map(c => c[0])).toEqual(["VERSION", "APPLY", "VERIFY"]);
    const apply = d.client.mock.calls[1][1] as string, verify = d.client.mock.calls[2][1] as string;
    expect(apply.indexOf("PREVIEW_ROLE_PUBLIC_ACCESS")).toBeLessThan(apply.indexOf("CREATE ROLE"));
    expect(apply.endsWith(readFileSync("scripts/preview/runtime-role.sql", "utf8").replace(/\r\n/g, "\n"))).toBe(true);
    expect(verify).toBe(runtimeAuditSql(true)); expect(verify).not.toContain("CREATE ROLE");
    expect(d.authorize.mock.invocationCallOrder[0]).toBeLessThan(d.probe.mock.invocationCallOrder[0]);
    expect(d.probe.mock.invocationCallOrder[0]).toBeLessThan(d.client.mock.invocationCallOrder[0]);
  });
  it.each(["authorize", "probe"] as const)("stops immediately on %s failure", async stage => {
    const d = deps(); d[stage].mockRejectedValue(new Error("sanitized"));
    await expect(provisionRuntimeRole(env(), true, d)).rejects.toThrow(); expect(d.client).not.toHaveBeenCalled();
  });
  it("refuses an unpinned client", async () => {
    const d = deps(); d.client.mockReset().mockResolvedValue({ status: 0, stdout: "psql 17" });
    await expect(provisionRuntimeRole(env(), true, d)).rejects.toThrow("CLIENT_VERSION"); expect(d.client).toHaveBeenCalledTimes(1);
  });
  it.each(["IDENTITY", "HISTORY", "TABLES", "ROLE_EXISTS", "PUBLIC_ACCESS", "PASSWORD_AUDIT_AUTHORITY", "GRANT_AUTHORITY", "SCHEMA_BASELINE"])("stops without retry on %s", async condition => {
    const d = deps(); d.client.mockReset().mockResolvedValueOnce({ status: 0, stdout: clientVersion }).mockResolvedValueOnce({ status: 3, clientTls: "VERIFIED", stderr: `ERROR: P0001: PREVIEW_ROLE_${condition} sensitive-details`, stdout: "" });
    await expect(provisionRuntimeRole(env(), true, d)).rejects.toThrow(`PREVIEW_ROLE_${condition}`); expect(d.client).toHaveBeenCalledTimes(2);
  });
  it("rejects schema changes after commit without recovery or retry", async () => {
    const d = deps(); d.client.mockReset().mockResolvedValueOnce({ status: 0, stdout: clientVersion })
      .mockResolvedValueOnce(output("PREFLIGHT_PASSED")).mockResolvedValueOnce(output("POSTCHECK_PASSED", "b".repeat(64)));
    await expect(provisionRuntimeRole(env(), true, d)).rejects.toThrow("SCHEMA_CHANGED"); expect(d.client).toHaveBeenCalledTimes(3);
  });
  it.each(["ATTRIBUTES", "MEMBERSHIPS", "PROFILE_COLUMNS", "EFFECTIVE_ACCESS", "HISTORY", "RLS_API", "EMPTY_DATA"])("stops after independent postcheck %s failure without replay", async condition => {
    const d = deps(); d.client.mockReset().mockResolvedValueOnce({ status: 0, stdout: clientVersion })
      .mockResolvedValueOnce(output("PREFLIGHT_PASSED"))
      .mockResolvedValueOnce({ status: 3, clientTls: "VERIFIED", stdout: "", stderr: `ERROR: P0001: PREVIEW_ROLE_${condition}` });
    await expect(provisionRuntimeRole(env(), true, d)).rejects.toMatchObject({ message: `PREVIEW_ROLE_${condition}`, phase: "VERIFY" });
    expect(d.client.mock.calls.map(c => c[0])).toEqual(["VERSION", "APPLY", "VERIFY"]);
  });
  it.each([{ status: null, stdout: "", error: new Error("private") }, { status: 0, stdout: "private" }, { status: 0, stdout: "{}" }])("sanitizes malformed/process output %#", child => {
    try { checkedResult({ ...child, clientTls: "VERIFIED" }, "APPLY"); throw new Error("should fail"); } catch (e) { expect((e as Error).message).toMatch(/^PREVIEW_ROLE_(?:CLIENT_FAILED|OUTPUT)$/); }
  });
  it.each(["APPLY", "VERIFY"])("rejects missing actual-client evidence on %s even with otherwise valid output", phase => {
    expect(() => checkedResult({ ...output(phase === "APPLY" ? "PREFLIGHT_PASSED" : "POSTCHECK_PASSED"), clientTls: undefined }, phase)).toThrow("CLIENT_TLS_EVIDENCE");
  });
  it.each(["APPLY", "VERIFY"])("reports SQLSTATE 42809 on %s without exposing relation or error text", phase => {
    let caught;
    try { checkedResult({ status: 3, clientTls: "VERIFIED", stdout: "", stderr: 'ERROR: 42809: "private-object" is not a sequence' }, phase); }
    catch (error) { caught = error; }
    expect(caught).toMatchObject({ message: "PREVIEW_ROLE_CLIENT_FAILED" });
    expect(clientDiagnostic(caught)).toEqual({ category: "SQL_WRONG_OBJECT_TYPE", phase, sqlReleased: true });
    expect(JSON.stringify(caught)).not.toContain("private-object");
  });
  it.each(["PREVIEW_SETUP_TARGET_REJECTED", "PREVIEW_SETUP_MIGRATIONS_INCOMPLETE", "PREVIEW_RUNTIME_EFFECTIVE_PRIVILEGES_REJECTED"])
    ("recognizes the reviewed transaction guard %s", code => {
      expect(() => checkedResult({ status: 3, clientTls: "VERIFIED", stdout: "", stderr: `ERROR: P0001: ${code} private` }, "APPLY"))
        .toThrow("PREVIEW_ROLE_TRANSACTION_GUARD");
    });
  it("does not run postcheck or retry after the demonstrated SQL failure", async () => {
    const d = deps(); d.client.mockReset().mockResolvedValueOnce({ status: 0, stdout: clientVersion })
      .mockResolvedValueOnce({ status: 3, clientTls: "VERIFIED", stdout: "", stderr: 'ERROR: 42809: "private" is not a sequence' });
    await expect(provisionRuntimeRole(env(), true, d)).rejects.toMatchObject({ category: "SQL_WRONG_OBJECT_TYPE", sqlReleased: true });
    expect(d.client.mock.calls.map(c => c[0])).toEqual(["VERSION", "APPLY"]);
  });
});

describe("provisioning SQL boundaries", () => {
  it("guards sequence OIDs with CASE in both the transaction and independent audit", () => {
    for (const sql of [readFileSync("scripts/preview/runtime-role.sql", "utf8"), runtimeAuditSql(true)]) {
      expect(sql).toMatch(/WHERE CASE WHEN (?:c\.)?relkind='S'\s+THEN has_sequence_privilege\('recycler_preview_app',(?:c\.)?oid,'USAGE,SELECT,UPDATE'\) ELSE false END/);
      expect(sql).not.toMatch(/relkind='S'\s+AND has_sequence_privilege/);
      // No sequence or schema exemption: every real sequence retains all three checks.
      expect(sql.match(/has_sequence_privilege/g)).toHaveLength(1);
    }
  });
  it.each([false, true])("keeps every audit read-only with identity/TLS/history/RLS/count checks (%s)", after => {
    const sql = runtimeAuditSql(after);
    expect(sql.startsWith("BEGIN READ ONLY;")).toBe(true); expect(sql.endsWith("ROLLBACK;")).toBe(true);
    for (const condition of ["IDENTITY", "READ_ONLY", "HISTORY", "TABLES", "RLS_API", "EMPTY_DATA", "POLICIES", "SCHEMA_BASELINE"]) expect(sql).toContain(`PREVIEW_ROLE_${condition}`);
    expect(sql).not.toContain("PREVIEW_ROLE_TLS");
    expect(sql).toContain("FROM pg_stat_ssl WHERE pid=pg_backend_pid()");
    for (const state of ["REPORTED_TLS", "REPORTED_NO_TLS", "UNKNOWN"]) expect(sql).toContain(state);
    const syntax = sql.replace(/'(?:[^']|'')*'/g, "''");
    expect(syntax).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|TRUNCATE|COPY|CALL)\b/i);
    expect(sql).toContain("pg_control_system()"); expect(sql).toContain("m.checksum IS DISTINCT FROM expected.checksum");
  });
  it("rejects inaccessible password metadata before provisioning rather than requesting broader grants", () => {
    expect(runtimeAuditSql()).toContain("PREVIEW_ROLE_PASSWORD_AUDIT_AUTHORITY");
    expect(runtimeAuditSql(true)).toContain("rolpassword IS NULL");
  });
  it("recognizes only PostgreSQL's non-inherited creator ADMIN grant; outgoing memberships remain forbidden", () => {
    for (const sql of [readFileSync("scripts/preview/runtime-role.sql", "utf8"), runtimeAccessQuery, runtimeAuditSql(true)]) {
      expect(sql).toContain("grantor=10 AND admin_option AND NOT inherit_option AND NOT set_option");
      expect(sql).toContain("rolname='postgres'");
    }
    expect(readFileSync("scripts/preview/runtime-role.sql", "utf8")).toContain("SET LOCAL createrole_self_grant = ''");
    expect(runtimeAuditSql(true)).toContain("WHERE member=(SELECT oid FROM pg_roles WHERE rolname='recycler_preview_app')");
  });
  it("has no initializer, Prisma command, seed, shell or arbitrary SQL execution interface", () => {
    const runner = readFileSync("scripts/preview/provision-runtime-role.mjs", "utf8");
    expect(runner).not.toMatch(/initializePreview\(|runSchemaDiff\(|migrate.*deploy|migrate.*reset|prisma.*seed|shell: true/);
    expect(runner).toContain('"--plan", "--provision-nologin-role"');
    expect(runner).toContain('writeFileSync(join(directory, "pgpass"), connection.passfile, { mode: 0o600 })');
    expect(runner).toContain('["rm", "--force", name]');
    expect(runner).not.toContain("console.log(child"); expect(runner).not.toContain("console.error(error");
  });
});
