// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { approvedAuthUserId, approvedEmail, reviewedBindingSql, bindingParameters, bindingResult, bindProfile } from "../../scripts/preview/bind-profile.mjs";
import { bindingAuditSql, runtimeAuditSql } from "../../scripts/preview/runtime-provisioning-sql.mjs";
import { clientVersion } from "../../scripts/preview/provision-runtime-role.mjs";
import { branchPrefix, repository, repositoryId, ownerId, workflow } from "../../scripts/preview/github-context.mjs";
import { sha256 } from "../../scripts/preview/verification.mjs";
import { clientDiagnostic } from "../../scripts/preview/psql-tls-session.mjs";

const ref = "txfxfrlhtvzwgluhnbpw", sha = "a".repeat(40);
const env = () => ({ CI: "true", GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: repository, GITHUB_REPOSITORY_ID: repositoryId,
  GITHUB_REPOSITORY_OWNER_ID: ownerId, GITHUB_ACTOR_ID: ownerId, GITHUB_ACTOR: "Gilsuhar", GITHUB_TRIGGERING_ACTOR: "Gilsuhar",
  GITHUB_REF: `refs/heads/${branchPrefix}${sha}`, GITHUB_REF_TYPE: "branch", GITHUB_SHA: sha, GITHUB_WORKFLOW_SHA: sha,
  GITHUB_WORKFLOW_REF: `${repository}/${workflow}@refs/heads/${branchPrefix}${sha}`, GITHUB_EVENT_NAME: "push", GITHUB_RUN_ATTEMPT: "1", GITHUB_RUN_ID: "123",
  PREVIEW_SETUP_APPROVED_PROJECT_REF: ref, PREVIEW_SETUP_PROJECT_NAME: "agent-workforce-preview",
  PREVIEW_SETUP_APPROVAL: "bind-profile:" + ref, PREVIEW_SETUP_ENVIRONMENT: "agent-workforce-preview-setup",
  PREVIEW_SETUP_APPROVED_ENDPOINT: "aws-1-us-west-2.pooler.supabase.com:5432", PREVIEW_SETUP_APPROVED_SHA: sha,
  PREVIEW_SETUP_PUSH_CREATED: "true", PREVIEW_SETUP_PUSH_DELETED: "false", PREVIEW_SETUP_PUSH_FORCED: "false", PREVIEW_SETUP_PUSH_BEFORE: "0".repeat(40),
  PREVIEW_SETUP_DATABASE_URL: "postgresql://postgres." + ref + ":synthetic-only@aws-1-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require&sslaccept=strict" });
const output = (status: string, schema = "a".repeat(64), privileges = "b".repeat(64)) => ({
  status: 0, clientTls: "VERIFIED", stdout: JSON.stringify({ status, schema, privileges, backendTls: "REPORTED_TLS" }) + "\n",
});
const deps = () => ({ testing: true, authorize: vi.fn().mockResolvedValue(undefined), probe: vi.fn().mockResolvedValue(undefined),
  client: vi.fn().mockResolvedValueOnce({ status: 0, stdout: clientVersion })
    .mockResolvedValueOnce(output("PREFLIGHT_PASSED")).mockResolvedValueOnce(output("POSTCHECK_PASSED")) });

describe("binding-only owner authorization and transport", () => {
  it("plans without GitHub, database, process or TLS calls", async () => {
    const d = deps();
    expect(await bindProfile(env(), false, d)).toEqual({ status: "PROFILE_BINDING_PLAN_VALIDATED", migrationCount: 11 });
    for (const fn of [d.authorize, d.probe, d.client]) expect(fn).not.toHaveBeenCalled();
  });
  it.each([
    { GITHUB_ACTOR_ID: "1" }, { GITHUB_ACTOR: "other" }, { GITHUB_TRIGGERING_ACTOR: "other" },
    { GITHUB_REPOSITORY_ID: "1" }, { GITHUB_REPOSITORY_OWNER_ID: "1" }, { GITHUB_RUN_ATTEMPT: "2" },
    { PREVIEW_SETUP_PUSH_CREATED: "false" }, { PREVIEW_SETUP_PUSH_FORCED: "true" },
    { PREVIEW_SETUP_PUSH_DELETED: "true" }, { PREVIEW_SETUP_PUSH_BEFORE: "b".repeat(40) },
    { GITHUB_REF: "refs/heads/main" }, { GITHUB_REF_TYPE: "tag" }, { GITHUB_EVENT_NAME: "workflow_dispatch" },
    { PREVIEW_SETUP_APPROVED_SHA: "b".repeat(40) }, { GITHUB_WORKFLOW_SHA: "b".repeat(40) },
    { PREVIEW_SETUP_APPROVED_ENDPOINT: "production.invalid:5432" },
    { PREVIEW_SETUP_APPROVED_PROJECT_REF: "ofxqdwpyqbvskrcfpdmx" }, { PREVIEW_SETUP_APPROVED_PROJECT_REF: "mfxqiyidmdppvdzeboke" },
    { PREVIEW_SETUP_APPROVAL: "provision-runtime-role:" + ref }, { PREVIEW_SETUP_APPROVAL: "initialize:" + ref },
    { PREVIEW_SETUP_DATABASE_URL: undefined }, { PREVIEW_SETUP_APPROVED_SHA: undefined },
    { DATABASE_URL: "unapproved" }, { DIRECT_URL: "unapproved" }, { VERCEL_ENV: "production" },
    { PGSSLMODE: "disable" }, { PGHOSTADDR: "127.0.0.1" }, { DOCKER_HOST: "remote.invalid" },
    { OPENSSL_CONF: "untrusted" }, { NODE_TLS_REJECT_UNAUTHORIZED: "0" }, { ACTIONS_STEP_DEBUG: "true" },
    { PREVIEW_SETUP_DATABASE_URL: env().PREVIEW_SETUP_DATABASE_URL.replace("sslaccept=strict", "sslaccept=accept_invalid_certs") },
  ])("rejects unsafe or missing context %# before any connection", async override => {
    const d = deps();
    await expect(bindProfile({ ...env(), ...override }, true, d)).rejects.toThrow();
    for (const fn of [d.authorize, d.probe, d.client]) expect(fn).not.toHaveBeenCalled();
  });
  it.each(["authorize", "probe"] as const)("stops on %s failure before the SQL client", async stage => {
    const d = deps(); d[stage].mockRejectedValue(new Error("private failure"));
    await expect(bindProfile(env(), true, d)).rejects.toThrow();
    expect(d.client).not.toHaveBeenCalled();
  });
  it("requires the pinned client before APPLY", async () => {
    const d = deps(); d.client.mockReset().mockResolvedValue({ status: 0, stdout: "psql unknown" });
    await expect(bindProfile(env(), true, d)).rejects.toThrow("CLIENT_VERSION");
    expect(d.client).toHaveBeenCalledTimes(1);
  });
  it("runs the unchanged transaction once, followed by an independent read-only connection", async () => {
    const d = deps();
    expect(await bindProfile(env(), true, d)).toMatchObject({ status: "PROFILE_BOUND_AND_VERIFIED", applicationProfiles: 1,
      profilePolicies: 1, authUsers: 1, runtimeLogin: false, runtimePassword: "ABSENT", migrationCount: 11, clientTls: "VERIFIED" });
    expect(d.client.mock.calls.map(c => c[0])).toEqual(["VERSION", "APPLY", "VERIFY"]);
    const apply = d.client.mock.calls[1][1] as string;
    expect(apply).toBe(bindingAuditSql(false) + "\n" + bindingParameters() + reviewedBindingSql());
    expect(apply.match(/INSERT INTO public\."User"/g)).toHaveLength(1);
    expect(apply.match(/CREATE POLICY/g)).toHaveLength(1);
    expect(apply.indexOf("PREVIEW_ROLE_BINDING_AUTHORITY")).toBeLessThan(apply.indexOf('INSERT INTO public."User"'));
    expect(apply.indexOf("PREVIEW_ROLE_SCHEMA_BASELINE")).toBeLessThan(apply.indexOf('INSERT INTO public."User"'));
    expect(d.client.mock.calls[2][1]).toBe(bindingAuditSql(true));
    expect(d.authorize.mock.invocationCallOrder[0]).toBeLessThan(d.probe.mock.invocationCallOrder[0]);
    expect(d.probe.mock.invocationCallOrder[0]).toBeLessThan(d.client.mock.invocationCallOrder[0]);
  });
  it.each(["IDENTITY", "HISTORY", "RLS_API", "ATTRIBUTES", "MEMBERSHIPS", "PROFILE_COLUMNS", "EFFECTIVE_ACCESS",
    "AUTH_IDENTITY", "BINDING_PROFILE", "BINDING_TRIGGERS", "BINDING_AUTHORITY", "POLICIES", "EMPTY_DATA", "SCHEMA_BASELINE"])
    ("stops after a preflight %s rejection without retry or postcheck", async condition => {
      const d = deps();
      d.client.mockReset().mockResolvedValueOnce({ status: 0, stdout: clientVersion })
        .mockResolvedValueOnce({ status: 3, clientTls: "VERIFIED", stdout: "", stderr: "ERROR: P0001: PREVIEW_ROLE_" + condition + " private" });
      await expect(bindProfile(env(), true, d)).rejects.toThrow(condition);
      expect(d.client.mock.calls.map(c => c[0])).toEqual(["VERSION", "APPLY"]);
    });
  it.each(["TLS_CERTIFICATE", "TLS_HOSTNAME", "TLS_EVIDENCE_MISSING"])("never retries client TLS failure %s", async category => {
    const d = deps();
    d.client.mockReset().mockResolvedValueOnce({ status: 0, stdout: clientVersion })
      .mockRejectedValueOnce(Object.assign(new Error("PREVIEW_ROLE_CLIENT_TLS_EVIDENCE"), { category, sqlReleased: false }));
    await expect(bindProfile(env(), true, d)).rejects.toMatchObject({ category, sqlReleased: false });
    expect(d.client).toHaveBeenCalledTimes(2);
  });
  it.each(["APPLY", "VERIFY"])("requires actual client TLS evidence independently for %s", phase => {
    expect(() => bindingResult({ ...output(phase === "APPLY" ? "PREFLIGHT_PASSED" : "POSTCHECK_PASSED"), clientTls: undefined }, phase))
      .toThrow("CLIENT_TLS_EVIDENCE");
  });
  it.each(["schema", "privileges"])("rejects unexpected post-commit %s changes without replay", async field => {
    const d = deps();
    d.client.mockReset().mockResolvedValueOnce({ status: 0, stdout: clientVersion })
      .mockResolvedValueOnce(output("PREFLIGHT_PASSED"))
      .mockResolvedValueOnce(output("POSTCHECK_PASSED", field === "schema" ? "c".repeat(64) : "a".repeat(64),
        field === "privileges" ? "c".repeat(64) : "b".repeat(64)));
    await expect(bindProfile(env(), true, d)).rejects.toMatchObject({ message: "PREVIEW_BINDING_UNEXPECTED_CHANGE", phase: "VERIFY" });
    expect(d.client).toHaveBeenCalledTimes(3);
  });
  it.each(["AUTH_IDENTITY", "BINDING_PROFILE", "POLICIES", "ATTRIBUTES", "HISTORY", "RLS_API"])
    ("reports postcheck %s failure without reapplying the transaction", async condition => {
      const d = deps();
      d.client.mockReset().mockResolvedValueOnce({ status: 0, stdout: clientVersion })
        .mockResolvedValueOnce(output("PREFLIGHT_PASSED"))
        .mockResolvedValueOnce({ status: 3, clientTls: "VERIFIED", stdout: "", stderr: "ERROR: P0001: PREVIEW_ROLE_" + condition });
      await expect(bindProfile(env(), true, d)).rejects.toMatchObject({ phase: "VERIFY" });
      expect(d.client).toHaveBeenCalledTimes(3);
    });
  it("rejects missing privilege evidence and sanitizes diagnostics", () => {
    let caught;
    try { bindingResult({ status: 0, clientTls: "VERIFIED", stdout: JSON.stringify({
      status: "POSTCHECK_PASSED", schema: "a".repeat(64), backendTls: "REPORTED_TLS", private: "must-not-leak",
    }) }, "VERIFY"); } catch (e) { caught = e; }
    expect(caught).toMatchObject({ message: "PREVIEW_BINDING_OUTPUT" });
    expect(JSON.stringify(clientDiagnostic(caught))).not.toContain("must-not-leak");
  });
  it.each(["PREVIEW_AUTH_BINDING_REJECTED", "PREVIEW_SETUP_ROLE_NOT_READY"])("sanitizes unchanged transaction guard %s", code => {
    expect(() => bindingResult({ status: 3, clientTls: "VERIFIED", stdout: "", stderr: code + " private" }, "APPLY"))
      .toThrow("PREVIEW_BINDING_TRANSACTION_GUARD");
  });
});

describe("reviewed binding SQL and exact expected database delta", () => {
  const manifest = JSON.parse(readFileSync("scripts/preview/profile-binding-manifest.json", "utf8"));
  it("pins the exact approved identity and original reviewed transaction checksum", () => {
    expect(approvedAuthUserId).toBe("8547d469-4c2e-48ad-8744-ed52fa1ed78c");
    expect(approvedEmail).toBe("gil@primelis.com");
    expect(sha256(reviewedBindingSql())).toBe("17445a690bc054c0f9d5e8f3c6eb235062a706b48f503c9f4226de4ac7458308");
    expect(reviewedBindingSql()).toBe(readFileSync("scripts/preview/bind-test-user.sql", "utf8").replace(/\r\n/g, "\n"));
  });
  it.each([
    { authUserId: "other" }, { email: "unapproved@example.invalid" }, { email: "'; DROP TABLE example;--" },
    { sqlSha256: "c".repeat(64) },
  ])("rejects altered identity/manifest %#", override => {
    expect(() => reviewedBindingSql(reviewedBindingSql(), { ...manifest, ...override })).toThrow("REVIEWED_FILES_CHANGED");
  });
  it("rejects even a small change to the approved SQL", () => {
    expect(() => reviewedBindingSql(reviewedBindingSql() + "\n", manifest)).toThrow("REVIEWED_FILES_CHANGED");
  });
  it("uses quoted psql parameters and set_config without exposing a dynamic SQL interface", () => {
    const params = bindingParameters();
    expect(params).toContain(":'binding_auth_uuid'");
    expect(params).toContain(":'binding_email'");
    expect(params).toContain("\\gset");
    expect(reviewedBindingSql()).toContain("current_setting('preview.approved_auth_user_id')::uuid");
    expect(reviewedBindingSql()).toContain("current_setting('preview.approved_email')");
    expect(reviewedBindingSql()).toContain("email = %L AND role = ''SALES_USER''");
  });
  it.each([false, true])("retains all independent security checks in read-only audit (%s)", after => {
    const sql = bindingAuditSql(after);
    expect(sql.startsWith("BEGIN READ ONLY;")).toBe(true); expect(sql.endsWith("ROLLBACK;")).toBe(true);
    for (const check of ["IDENTITY", "READ_ONLY", "HISTORY", "TABLES", "RLS_API", "EMPTY_DATA", "POLICIES", "ATTRIBUTES",
      "MEMBERSHIPS", "PROFILE_COLUMNS", "EFFECTIVE_ACCESS", "SCHEMA_BASELINE", "AUTH_IDENTITY", "BINDING_PROFILE", "BINDING_TRIGGERS"])
      expect(sql).toContain("PREVIEW_ROLE_" + check);
    expect(sql).toContain("pg_control_system()");
    expect(sql).toContain("m.checksum IS DISTINCT FROM expected.checksum");
    expect(sql).toContain("is_anonymous IS FALSE");
    expect(sql).toContain("email_confirmed_at IS NOT NULL");
    expect(sql).toContain("rolpassword IS NULL");
    expect(sql).toContain("default_transaction_read_only=on");
    const syntax = sql.replace(/'(?:[^']|'')*'/g, "''");
    expect(syntax).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|TRUNCATE|COPY|CALL)\b/i);
    expect(sql).toContain("pg_default_acl"); expect(sql).toContain("pg_db_role_setting");
  });
  it("requires zero profiles/policies before binding and no automatic Auth/profile triggers", () => {
    const sql = bindingAuditSql(false);
    expect(sql).toContain('NOT EXISTS(SELECT 1 FROM public."User")');
    expect(sql).toContain("NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public')");
    expect(sql).toContain("AND NOT tgisinternal");
    expect(sql).toContain("PREVIEW_ROLE_BINDING_AUTHORITY");
  });
  it("postcheck requires exact row, policy name, role OID, expression and SELECT-only command", () => {
    const sql = bindingAuditSql(true);
    expect(sql).toContain('(SELECT count(*) FROM public."User")=1');
    expect(sql).toContain("(SELECT count(*) FROM auth.users)=1");
    expect(sql).toContain("(SELECT count(*) FROM pg_policies WHERE schemaname='public')=1");
    expect(sql).toContain("polcmd='r' AND polpermissive AND polroles=ARRAY[");
    expect(sql).toContain("polwithcheck IS NULL AND pg_get_expr(polqual,polrelid)=");
    expect(sql).toContain("preview_8547d4694c2e48ad8744ed52fa1ed78c");
    expect(sql).toContain("role = ''SALES_USER''::public.\"UserRole\"");
    expect(sql).toContain('public."UserRole"');
    expect(sql).toContain("preview-8547d469-4c2e-48ad-8744-ed52fa1ed78c");
  });
  it("filters only numeric PostgreSQL temporary namespace metadata, preserving the old baseline", () => {
    expect(bindingAuditSql(false)).toContain("n.nspname !~ '^pg_(toast_)?temp_[0-9]+$'");
    expect(runtimeAuditSql(true)).not.toContain("n.nspname !~");
    const baseline = JSON.parse(readFileSync("scripts/preview/runtime-role-manifest.json", "utf8")).schemaBaselineSha256;
    expect(bindingAuditSql(false)).toContain(baseline);
    expect(bindingAuditSql(true)).toContain(baseline);
  });
  it("runner has no initializer/role provisioning, migration, seed, arbitrary SQL or shell path", () => {
    const runner = readFileSync("scripts/preview/bind-profile.mjs", "utf8");
    expect(runner).not.toMatch(/initializePreview\(|provisionRuntimeRole\(|runSchemaDiff\(|migrate.*deploy|migrate.*reset|prisma.*seed|shell: true/);
    expect(runner).toContain('["--plan", "--bind-profile"]');
    expect(runner).toContain("runTlsSession(args, connection.env, sql)");
    expect(runner).toContain('writeFileSync(join(directory, "pgpass"), connection.passfile, { mode: 0o600 })');
    expect(runner).toContain('["rm", "--force", name]');
    expect(runner).not.toContain("console.error(error");
    expect(runner).not.toContain("console.log(child");
  });
  it("the only approved transaction writes are one profile INSERT and one SELECT policy", () => {
    const sql = reviewedBindingSql();
    expect(sql.match(/INSERT INTO/g)).toHaveLength(1);
    expect(sql.match(/CREATE POLICY/g)).toHaveLength(1);
    expect(sql).not.toMatch(/ON CONFLICT|UPDATE public|UPDATE auth|INSERT INTO auth|ALTER ROLE|GRANT |DROP |DELETE |TRUNCATE /);
    expect(sql).toContain("FOR SELECT TO recycler_preview_app");
  });
});
