// @vitest-environment node
import { EventEmitter } from "node:events";
import type { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { activationPlan, runtimeCredential, activateRuntimeLogin, activationDiagnostic, credentialAttestation } from "../../scripts/preview/activate-runtime-login.mjs";
import { activationScript, activationMarkers as markers, runActivationSession } from "../../scripts/preview/activation-session.mjs";
import { activationAuditSql } from "../../scripts/preview/runtime-provisioning-sql.mjs";
import { connectionFiles, clientVersion, dockerArguments } from "../../scripts/preview/provision-runtime-role.mjs";
import { branchPrefix, repository, repositoryId, ownerId, workflow } from "../../scripts/preview/github-context.mjs";

// Deliberately sequential bytes, never a generated/live credential.
const password = Buffer.from(Array.from({ length: 32 }, (_, i) => i)).toString("base64url");
const ref = "txfxfrlhtvzwgluhnbpw", sha = "a".repeat(40);
const env = () => ({ CI: "true", GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: repository, GITHUB_REPOSITORY_ID: repositoryId,
  GITHUB_REPOSITORY_OWNER_ID: ownerId, GITHUB_ACTOR_ID: ownerId, GITHUB_ACTOR: "Gilsuhar", GITHUB_TRIGGERING_ACTOR: "Gilsuhar",
  GITHUB_REF: `refs/heads/${branchPrefix}${sha}`, GITHUB_REF_TYPE: "branch", GITHUB_SHA: sha, GITHUB_WORKFLOW_SHA: sha,
  GITHUB_WORKFLOW_REF: `${repository}/${workflow}@refs/heads/${branchPrefix}${sha}`, GITHUB_EVENT_NAME: "push", GITHUB_RUN_ATTEMPT: "1", GITHUB_RUN_ID: "123",
  PREVIEW_SETUP_APPROVED_PROJECT_REF: ref, PREVIEW_SETUP_PROJECT_NAME: "agent-workforce-preview",
  PREVIEW_SETUP_APPROVAL: "activate-runtime-login:" + ref, PREVIEW_SETUP_ENVIRONMENT: "agent-workforce-preview-setup",
  PREVIEW_SETUP_APPROVED_ENDPOINT: "aws-1-us-west-2.pooler.supabase.com:5432", PREVIEW_SETUP_APPROVED_SHA: sha,
  PREVIEW_SETUP_PUSH_CREATED: "true", PREVIEW_SETUP_PUSH_DELETED: "false", PREVIEW_SETUP_PUSH_FORCED: "false", PREVIEW_SETUP_PUSH_BEFORE: "0".repeat(40),
  PREVIEW_SETUP_DATABASE_URL: "postgresql://postgres." + ref + ":synthetic-only@aws-1-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require&sslaccept=strict",
  PREVIEW_RUNTIME_DATABASE_URL: `postgresql://recycler_preview_app.${ref}:${password}@aws-1-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require&sslaccept=strict&connection_limit=1`,
  PREVIEW_RUNTIME_CREDENTIAL_ATTESTATION: credentialAttestation });
const settings = connectionFiles(env().PREVIEW_SETUP_DATABASE_URL).env;
const report = 'You are connected to database "postgres" as user "postgres.txfxfrlhtvzwgluhnbpw" on host "aws-1-us-west-2.pooler.supabase.com" (address "192.0.2.1") at port "5432".\nSSL connection (protocol: TLSv1.3, cipher: TLS_AES_256_GCM_SHA384, compression: off, ALPN: none)';
const evidence = { schema: "a".repeat(64), privileges: "b".repeat(64), backendTls: "REPORTED_NO_TLS" };
const output = (status: string, extra = {}) => JSON.stringify({ status, ...evidence, ...extra });
const deps = () => ({ testing: true, authorize: vi.fn().mockResolvedValue(undefined), probe: vi.fn().mockResolvedValue(undefined),
  client: vi.fn().mockResolvedValueOnce({ status: 0, stdout: clientVersion })
    .mockResolvedValueOnce({ status: 0, clientTls: "VERIFIED", stdout: output("POSTCHECK_PASSED") }),
  activate: vi.fn().mockResolvedValue({ before: evidence, ready: evidence, committed: true, clientTls: "VERIFIED" }) });
function transport() {
  const child = Object.assign(new EventEmitter(), {
    stdin: Object.assign(new EventEmitter(), { write: vi.fn(), end: vi.fn(), destroy: vi.fn() }),
    stdout: new EventEmitter(), stderr: new EventEmitter(), kill: vi.fn(),
  });
  const start = vi.fn(() => child);
  const stdout = (s: string) => child.stdout.emit("data", Buffer.from(s));
  const stderr = (s: string) => child.stderr.emit("data", Buffer.from(s));
  const tls = () => stdout(report + `\n${markers.tls}\n`);
  const preflight = () => stdout(output("PREFLIGHT_PASSED") + `\n${markers.preflight}\n`);
  const prompts = () => { stderr('Enter new password for user "recycler_preview_app": '); stderr('\nEnter it again: '); stderr("\n"); };
  return { child, start: start as unknown as typeof spawn, mock: start, stdout, stderr, tls, preflight, prompts };
}
afterEach(() => vi.useRealTimers());

describe("secure activation input and one-time context", () => {
  it("accepts only the retained environment credential and produces a secret-free pure plan", async () => {
    expect(runtimeCredential(env())).toBe(password);
    const d = deps(), plan = await activateRuntimeLogin(env(), false, d);
    expect(plan).toEqual({ status: "RUNTIME_LOGIN_PLAN_VALIDATED", migrationCount: 11 });
    for (const fn of Object.values(d).filter(v => typeof v === "function")) expect(fn).not.toHaveBeenCalled();
    expect(JSON.stringify(plan)).not.toContain(password);
  });
  it.each([
    { PREVIEW_RUNTIME_DATABASE_URL: undefined }, { PREVIEW_RUNTIME_CREDENTIAL_ATTESTATION: undefined },
    { PREVIEW_RUNTIME_CREDENTIAL_ATTESTATION: "not-retained" }, { PREVIEW_SETUP_DATABASE_URL: undefined },
    { PREVIEW_SETUP_APPROVED_SHA: "b".repeat(40) }, { GITHUB_WORKFLOW_SHA: "b".repeat(40) },
    { GITHUB_ACTOR_ID: "1" }, { GITHUB_ACTOR: "other" }, { GITHUB_TRIGGERING_ACTOR: "other" },
    { GITHUB_REPOSITORY_ID: "1" }, { GITHUB_REPOSITORY_OWNER_ID: "1" }, { GITHUB_RUN_ATTEMPT: "2" },
    { PREVIEW_SETUP_PUSH_CREATED: "false" }, { PREVIEW_SETUP_PUSH_FORCED: "true" }, { PREVIEW_SETUP_PUSH_DELETED: "true" },
    { PREVIEW_SETUP_PUSH_BEFORE: "b".repeat(40) }, { GITHUB_REF: "refs/heads/main" }, { GITHUB_REF_TYPE: "tag" },
    { GITHUB_EVENT_NAME: "workflow_dispatch" }, { PREVIEW_SETUP_APPROVAL: "bind-profile:" + ref },
    { PREVIEW_SETUP_APPROVED_PROJECT_REF: "ofxqdwpyqbvskrcfpdmx" }, { PREVIEW_SETUP_APPROVED_PROJECT_REF: "mfxqiyidmdppvdzeboke" },
    { PREVIEW_SETUP_APPROVED_ENDPOINT: "production.invalid:5432" }, { DATABASE_URL: "unapproved" }, { DIRECT_URL: "unapproved" },
    { VERCEL_ENV: "production" }, { PREVIEW_DATABASE_URL: "unapproved" }, { PGSSLMODE: "disable" }, { PGHOSTADDR: "127.0.0.1" },
    { DOCKER_HOST: "remote.invalid" }, { OPENSSL_CONF: "untrusted" }, { NODE_TLS_REJECT_UNAUTHORIZED: "0" },
    { ACTIONS_STEP_DEBUG: "true" }, { ACTIONS_RUNNER_DEBUG: "true" }, { CI: undefined, GITHUB_ACTIONS: undefined },
  ])("rejects unsafe context before any process or network %#", async override => {
    const d = deps(); await expect(activateRuntimeLogin({ ...env(), ...override }, true, d)).rejects.toThrow();
    for (const fn of [d.authorize, d.probe, d.client, d.activate]) expect(fn).not.toHaveBeenCalled();
  });
  it.each([
    [password, "short"], [password, password + "="], [password, password.slice(0, -1) + "9"], [password, "%0A" + password],
    [password, "'\\password other\n"], [password, "%41" + password.slice(1)],
    ["recycler_preview_app", "postgres"], [ref, "mfxqiyidmdppvdzeboke"], [ref, "ofxqdwpyqbvskrcfpdmx"],
    ["aws-1-us-west-2.pooler.supabase.com", "production.invalid"], ["5432", "6543"],
    ["sslaccept=strict", "sslaccept=accept_invalid_certs"], ["sslmode=require", "sslmode=disable"],
    ["connection_limit=1", "connection_limit=1&connection_limit=1"], ["connection_limit=1", "connection_limit=2"],
    ["connection_limit=1", "connection_limit=1&options=unapproved"], ["/postgres?", "/other?"],
    ["postgresql:", "https:"], ["connection_limit=1", "connection_limit=1#fragment"],
  ])("rejects malformed or unsafe runtime URL %#", (from, to) => {
    expect(() => runtimeCredential({ ...env(), PREVIEW_RUNTIME_DATABASE_URL: env().PREVIEW_RUNTIME_DATABASE_URL.replace(from, to) })).toThrow("CREDENTIAL_INPUT");
  });
  it("rejects reusing the administrator password", () => {
    expect(() => runtimeCredential({ ...env(), PREVIEW_SETUP_DATABASE_URL: env().PREVIEW_SETUP_DATABASE_URL.replace("synthetic-only", password) })).toThrow("CREDENTIAL_INPUT");
  });
  it.each(["authorize", "probe", "activate"] as const)("stops without retry when %s fails", async stage => {
    const d = deps(); d[stage].mockRejectedValue(new Error("private"));
    await expect(activateRuntimeLogin(env(), true, d)).rejects.toThrow();
    expect(d.activate.mock.calls.length).toBe(stage === "activate" ? 1 : 0);
    expect(d.client.mock.calls.some(c => c[0] === "VERIFY")).toBe(false);
  });
  it("requires the exact pinned client before password input", async () => {
    const d = deps(); d.client.mockReset().mockResolvedValue({ status: 0, stdout: "unknown" });
    await expect(activateRuntimeLogin(env(), true, d)).rejects.toThrow("CLIENT_VERSION"); expect(d.activate).not.toHaveBeenCalled();
  });
  it("uses a separate TLS-gated read-only postcheck and never reactivates", async () => {
    const d = deps(), result = await activateRuntimeLogin(env(), true, d);
    expect(d.activate).toHaveBeenCalledOnce(); expect(d.activate).toHaveBeenCalledWith(password);
    expect(d.client.mock.calls.map(c => c[0])).toEqual(["VERSION", "VERIFY"]);
    expect(d.client.mock.calls[1][1]).toBe(activationAuditSql("postcheck"));
    expect(result).toMatchObject({ runtimeLogin: true, migrationCount: 11, tableCount: 50, privileges: "UNCHANGED_EXCEPT_LOGIN", clientTls: "VERIFIED" });
    expect(JSON.stringify(result)).not.toContain(password);
  });
  it.each(["schema", "privileges"])("rejects independent postcheck %s drift", async field => {
    const d = deps(); d.client.mockReset().mockResolvedValueOnce({ status: 0, stdout: clientVersion })
      .mockResolvedValueOnce({ status: 0, clientTls: "VERIFIED", stdout: output("POSTCHECK_PASSED", { [field]: "c".repeat(64) }) });
    await expect(activateRuntimeLogin(env(), true, d)).rejects.toThrow("UNEXPECTED_CHANGE"); expect(d.activate).toHaveBeenCalledOnce();
  });
  it("rejects missing independent TLS evidence", async () => {
    const d = deps(); d.client.mockReset().mockResolvedValueOnce({ status: 0, stdout: clientVersion })
      .mockResolvedValueOnce({ status: 0, stdout: output("POSTCHECK_PASSED") });
    await expect(activateRuntimeLogin(env(), true, d)).rejects.toThrow("CLIENT_TLS_EVIDENCE");
  });
  it("redacts all client output and distinguishes uncertain commit from postcheck failure", () => {
    const error = Object.assign(new Error(password), { stderr: env().PREVIEW_RUNTIME_DATABASE_URL, category: password, phase: password });
    expect(activationDiagnostic(error, false, false).status).toBe("NOT_EXECUTED");
    expect(activationDiagnostic(error, true, false).status).toBe("UNKNOWN_CHECK_BEFORE_RETRY");
    expect(activationDiagnostic(error, true, true).status).toBe("APPLIED_VERIFICATION_FAILED");
    expect(JSON.stringify(activationDiagnostic(error, true, false))).not.toContain(password);
  });
});

describe("native password input private pipe gates", () => {
  it("withholds the password until strict TLS and complete live preflight; commits only after matching checks", async () => {
    const t = transport(), pending = runActivationSession(["--file=/run/preview/activate.sql"], settings, password, t.start);
    expect(t.child.stdin.write).not.toHaveBeenCalled(); t.tls();
    expect(t.child.stdin.write.mock.calls).toEqual([["true\n"]]); t.preflight();
    expect(t.child.stdin.write.mock.calls).toEqual([["true\n"], ["true\n"]]);
    t.stderr('Enter new password for user "'); expect(t.child.stdin.write).toHaveBeenCalledTimes(2);
    t.stderr('recycler_preview_app": '); t.stderr("\nEnter it "); t.stderr("again: "); t.stderr("\n");
    expect(t.child.stdin.write.mock.calls).toEqual([["true\n"], ["true\n"], [password + "\n"], [password + "\n"]]);
    t.stdout(output("POSTCHECK_PASSED") + `\n${markers.commit}\n`);
    expect(t.child.stdin.end).toHaveBeenCalledOnce(); expect(t.child.stdin.end).toHaveBeenCalledWith("true\n");
    t.stdout(markers.done + "\n"); t.child.emit("close", 0, null);
    expect(await pending).toMatchObject({ committed: true, clientTls: "VERIFIED" });
    expect(JSON.stringify(t.mock.mock.calls)).not.toContain(password);
    expect(t.mock.mock.calls[0]).toEqual(["/usr/bin/docker", ["--file=/run/preview/activate.sql"], {
      env: { PATH: "/usr/bin:/bin" }, shell: false, stdio: ["pipe", "pipe", "pipe"],
    }]);
  });
  it.each(["", "invalid", "x".repeat(42), "x".repeat(44), password + "\n"])("rejects malformed password before process creation %#", async value => {
    const t = transport(); await expect(runActivationSession([], settings, value, t.start)).rejects.toMatchObject({ category: "CREDENTIAL_FORMAT" });
    expect(t.mock).not.toHaveBeenCalled();
  });
  it.each(["SSL error: certificate verify failed", 'server certificate for "x" does not match host name "y"', "root certificate file missing"])
    ("never releases credentials after a client trust failure %#", async text => {
      const t = transport(), pending = runActivationSession([], settings, password, t.start).catch(e => e);
      t.stderr(text); t.child.emit("close", 2, null);
      expect((await pending).passwordSent).toBe(false); expect(t.child.stdin.write).not.toHaveBeenCalled();
    });
  it.each([report.replace("5432", "6543"), report.replace("pooler.supabase.com", "wrong.invalid"), report.split("\n")[0], "private"])
    ("rejects missing/incorrect actual-client evidence %#", async value => {
      const t = transport(), pending = runActivationSession([], settings, password, t.start).catch(e => e);
      t.stdout(value + `\n${markers.tls}\n`); expect((await pending).passwordSent).toBe(false);
      expect(t.child.stdin.write).not.toHaveBeenCalled();
    });
  it.each(["IDENTITY", "HISTORY", "TABLES", "RLS_API", "AUTH_IDENTITY", "BINDING_PROFILE", "POLICIES", "ATTRIBUTES", "MEMBERSHIPS", "PROFILE_COLUMNS", "EFFECTIVE_ACCESS", "SCHEMA_BASELINE"])
    ("preflight %s failure never supplies a password", async guard => {
      const t = transport(), pending = runActivationSession([], settings, password, t.start).catch(e => e); t.tls();
      t.stderr("ERROR: P0001: PREVIEW_ROLE_" + guard); t.child.emit("close", 3, null);
      const error = await pending;
      expect(error.passwordSent).toBe(false); expect(error.condition).toBe(guard);
      expect(activationDiagnostic(error, true, false)).toMatchObject({ condition: guard, phase: "APPLY", sqlReleased: true });
      expect(t.child.stdin.write.mock.calls).toEqual([["true\n"]]);
    });
  it.each(["Enter password: ", 'Enter new password for user "postgres": ', "ERROR: 42501: private", password])
    ("rejects unexpected prompts or repeated-check failure without input %#", async value => {
      const t = transport(), pending = runActivationSession([], settings, password, t.start).catch(e => e); t.tls(); t.preflight(); t.stderr(value);
      expect((await pending).passwordSent).toBe(false); expect(t.child.stdin.write).toHaveBeenCalledTimes(2);
    });
  it.each(["schema", "privileges"])("withholds COMMIT on in-transaction %s drift", async field => {
    const t = transport(), pending = runActivationSession([], settings, password, t.start).catch(e => e); t.tls(); t.preflight(); t.prompts();
    t.stdout(output("POSTCHECK_PASSED", { [field]: "c".repeat(64) }) + `\n${markers.commit}\n`);
    expect(await pending).toMatchObject({ category: "UNEXPECTED_CHANGE", passwordSent: true, commitReleased: false });
    expect(t.child.stdin.end).not.toHaveBeenCalled(); expect(t.child.kill).toHaveBeenCalledWith("SIGKILL");
  });
  it("does not mistake SQL errors or password echoes for success, and redacts them", async () => {
    const t = transport(), pending = runActivationSession([], settings, password, t.start).catch(e => e); t.tls(); t.preflight(); t.prompts();
    t.stderr("ERROR: 42501: " + password);
    const error = await pending; expect(error.commitReleased).toBe(false); expect(JSON.stringify(error)).not.toContain(password);
  });
  it("requires the commit acknowledgement and successful process exit", async () => {
    const t = transport(), pending = runActivationSession([], settings, password, t.start).catch(e => e); t.tls(); t.preflight(); t.prompts();
    t.stdout(output("POSTCHECK_PASSED") + `\n${markers.commit}\n`); t.child.emit("close", 1, null);
    expect(await pending).toMatchObject({ commitReleased: true }); expect(t.mock).toHaveBeenCalledOnce();
  });
  it.each(["error", "eof", "duplicate-prompt"])("handles %s after password input without releasing COMMIT", async mode => {
    const t = transport(), pending = runActivationSession([], settings, password, t.start).catch(e => e); t.tls(); t.preflight(); t.prompts();
    if (mode === "error") t.child.emit("error", new Error(password));
    else if (mode === "eof") t.child.emit("close", 0, null);
    else t.stderr('Enter new password for user "recycler_preview_app": ');
    const error = await pending;
    expect(error.commitReleased).toBe(false); expect(JSON.stringify(error)).not.toContain(password);
    expect(t.child.stdin.end).not.toHaveBeenCalled(); expect(t.mock).toHaveBeenCalledOnce();
  });
  it("kills a stalled prompt without retry or disclosing the credential", async () => {
    vi.useFakeTimers(); const t = transport(), pending = runActivationSession([], settings, password, t.start).catch(e => e);
    await vi.advanceTimersByTimeAsync(180001); expect((await pending).category).toBe("PROCESS_TIMEOUT"); expect(t.mock).toHaveBeenCalledOnce();
  });
  it("rejects excessive output without disclosing it", async () => {
    const t = transport(), pending = runActivationSession([], settings, password, t.start).catch(e => e);
    t.stdout("x".repeat(2 * 1024 * 1024 + 1)); expect((await pending).category).toBe("OUTPUT_LIMIT");
  });
});

describe("fixed activation SQL and protected workflow boundaries", () => {
  it("uses native password encryption and atomic password/LOGIN changes with every guard repeated before COMMIT", () => {
    const script = activationScript();
    expect(script).not.toContain(password);
    expect(script.match(/\\password recycler_preview_app/g)).toHaveLength(1);
    expect(script.match(/ALTER ROLE recycler_preview_app LOGIN;/g)).toHaveLength(1);
    expect(script).toContain("SET LOCAL password_encryption='scram-sha-256';");
    expect(script).not.toMatch(/^(?:CREATE|DROP) (?:ROLE|POLICY|TABLE)|^INSERT INTO|^UPDATE public|^DELETE FROM|^GRANT |migrate |db push|seed/im);
    expect(script.indexOf("PREVIEW_ROLE_SCHEMA_BASELINE")).toBeLessThan(script.indexOf("\\password"));
    expect(script.indexOf(activationAuditSql("before-password"))).toBeLessThan(script.indexOf("\\password"));
    expect(script.indexOf(activationAuditSql("before-commit"))).toBeLessThan(script.indexOf("COMMIT;"));
    expect(script).toContain("\\if :commit_release\nCOMMIT;\n");
    expect(script).toContain("\\else\nROLLBACK;");
    expect(activationAuditSql("before-password")).toMatch(/^BEGIN;/);
    expect(activationAuditSql("before-commit")).not.toMatch(/\b(?:BEGIN READ ONLY|ROLLBACK|COMMIT);/);
  });
  it.each(["preflight", "before-password", "before-commit", "postcheck"] as const)("preserves all mandatory checks in %s", phase => {
    const sql = activationAuditSql(phase);
    for (const guard of ["IDENTITY", "HISTORY", "TABLES", "RLS_API", "AUTH_IDENTITY", "EMPTY_DATA", "BINDING_PROFILE", "POLICIES", "BINDING_TRIGGERS",
      "ATTRIBUTES", "MEMBERSHIPS", "PROFILE_COLUMNS", "EFFECTIVE_ACCESS", "SCHEMA_BASELINE", "ACTIVATION_AUTHORITY"]) expect(sql).toContain("PREVIEW_ROLE_" + guard);
    expect(sql).toContain("system_identifier"); expect(sql).toContain("m.checksum IS DISTINCT FROM expected.checksum");
    expect(sql).toContain("CASE WHEN relkind='S' THEN has_sequence_privilege");
    expect(sql).toContain("'^pg_(toast_)?temp_[0-9]+$'");
    if (phase !== "before-password") expect(sql).toContain("CASE WHEN r.rolname='recycler_preview_app' THEN false ELSE r.rolcanlogin END");
    if (["preflight", "before-password"].includes(phase)) expect(sql).toContain("rolpassword IS NULL");
    else expect(sql).toContain("split_part(rolpassword,'$',1)='SCRAM-SHA-256'");
    if (["preflight", "postcheck"].includes(phase)) { expect(sql).toMatch(/^BEGIN READ ONLY;/); expect(sql).toMatch(/ROLLBACK;$/); }
  });
  it("does not use a TTY, password environment, shell interpolation, password file or artifacts for the runtime secret", () => {
    const args = dockerArguments("/private", "fixed", settings);
    expect(args).toContain("--interactive"); expect(args).not.toContain("--tty"); expect(args).toContain("--no-password");
    expect(args).toContain("PGSSLMODE=verify-full"); expect(args).toContain("PGSSLROOTCERT=/run/preview/ca.crt");
    expect(args).toContain("--set=ON_ERROR_STOP=1");
    const source = readFileSync("scripts/preview/activate-runtime-login.mjs", "utf8");
    expect(source).not.toMatch(/randomBytes|randomUUID|createUser|migrate deploy|bindProfile\(/);
    expect(source.match(/writeFileSync\(join\(directory, "([^"]+)"\)/g)).toHaveLength(3);
    expect(source).toContain('writeFileSync(join(directory, "activate.sql"), activationScript()');
    expect(source).toContain('const childEnv = { PATH: "/usr/bin:/bin" }');
    const workflowText = readFileSync(workflow, "utf8");
    expect(workflowText).not.toMatch(/upload-artifact|workflow_dispatch|schedule:|continue-on-error|--bind-profile|--provision-runtime-role/);
    expect(workflowText).toContain('secrets.PREVIEW_RUNTIME_DATABASE_URL');
    expect(() => activationPlan({ ...env(), PREVIEW_RUNTIME_DATABASE_URL: "" })).toThrow();
  });
});
