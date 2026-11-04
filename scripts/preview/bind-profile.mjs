import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { setupPlan } from "./setup.mjs";
import { verifyGitHubApproval } from "./github-context.mjs";
import { verifiedCa } from "./tls-trust.mjs";
import { probeTls } from "./tls-probe.mjs";
import { sha256 } from "./verification.mjs";
import { bindingAuditSql } from "./runtime-provisioning-sql.mjs";
import { runTlsSession, clientDiagnostic, clientGuardCode } from "./psql-tls-session.mjs";
import { clientImage, clientVersion, connectionFiles, dockerArguments, checkedResult } from "./provision-runtime-role.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const text = path => readFileSync(resolve(root, path), "utf8").replace(/\r\n/g, "\n");
const fail = code => { throw new Error("PREVIEW_BINDING_" + code); };
export const approvedAuthUserId = "8547d469-4c2e-48ad-8744-ed52fa1ed78c";
export const approvedEmail = "gil@primelis.com";
const sqlPath = "scripts/preview/bind-test-user.sql";
const manifestPath = "scripts/preview/profile-binding-manifest.json";

export function reviewedBindingSql(sql = text(sqlPath), manifest = JSON.parse(text(manifestPath))) {
  if (manifest.authUserId !== approvedAuthUserId || manifest.email !== approvedEmail ||
      manifest.sqlSha256 !== "17445a690bc054c0f9d5e8f3c6eb235062a706b48f503c9f4226de4ac7458308" ||
      sha256(sql) !== manifest.sqlSha256) fail("REVIEWED_FILES_CHANGED");
  return sql;
}

export function profileBindingPlan(env) {
  const plan = setupPlan(env, undefined, "bind-profile");
  if (plan.endpoint !== "aws-1-us-west-2.pooler.supabase.com:5432" ||
      env.PREVIEW_VERIFY_DATABASE_URL || env.PREVIEW_ADMIN_DIFF_APPROVAL ||
      Object.keys(env).some(k => /^PG|^DOCKER_|^COMPOSE_|^OPENSSL_|^LD_|^DYLD_/.test(k)) ||
      [".env", "prisma/.env"].some(p => existsSync(resolve(root, p)))) fail("CONFIGURATION");
  reviewedBindingSql();
  const manifest = JSON.parse(text("scripts/preview/runtime-role-manifest.json"));
  if (manifest.clientImage !== clientImage || manifest.clientVersion !== clientVersion) fail("CLIENT_VERSION");
  connectionFiles(env.PREVIEW_SETUP_DATABASE_URL);
  return { status: "PROFILE_BINDING_PLAN_VALIDATED", migrationCount: plan.migrations.length };
}

// psql literal parameters, never raw SQL concatenation of caller values. Identity is
// pinned above, not accepted from env, dispatch, CLI, files supplied by an operator or DB output.
// \gset suppresses the SELECT's output; session GUCs carry parameters into the unchanged SQL.
// The binding transaction's BEGIN follows the read-only preflight ROLLBACK on the same TLS session.
export function bindingParameters() {
  return "\\set binding_auth_uuid '" + approvedAuthUserId + "'\n" +
    "\\set binding_email '" + approvedEmail + "'\n" +
    "SELECT pg_catalog.set_config('preview.approved_auth_user_id', :'binding_auth_uuid', false) AS binding_uuid, " +
    "pg_catalog.set_config('preview.approved_email', :'binding_email', false) AS binding_email_value\n\\gset\n";
}

export function bindingResult(child, phase) {
  try {
    const result = checkedResult(child, phase);
    if (!/^[a-f0-9]{64}$/.test(result.privileges ?? "")) fail("OUTPUT");
    return result;
  } catch (error) {
    // Extend fixed diagnostic identifiers without ever returning raw SQL/client output.
    const raised = child.error || child.signal ? undefined : clientGuardCode(child.stderr);
    const condition = ["AUTH_IDENTITY", "BINDING_PROFILE", "BINDING_TRIGGERS", "BINDING_AUTHORITY"]
      .find(c => raised === "PREVIEW_ROLE_" + c);
    if (child.clientTls === "VERIFIED" && condition)
      throw Object.assign(new Error("PREVIEW_BINDING_" + condition), { phase, category: "SQL_GUARD_REJECTED", sqlReleased: true });
    if (child.clientTls === "VERIFIED" && ["PREVIEW_AUTH_BINDING_REJECTED", "PREVIEW_SETUP_ROLE_NOT_READY"].includes(raised))
      throw Object.assign(new Error("PREVIEW_BINDING_TRANSACTION_GUARD"), { phase, category: "SQL_GUARD_REJECTED", sqlReleased: true });
    if (error?.message === "PREVIEW_BINDING_OUTPUT")
      throw Object.assign(error, { phase, category: "SQL_OUTPUT_PARSING", sqlReleased: true });
    throw error;
  }
}

export async function bindProfile(env, execute, deps) {
  const plan = profileBindingPlan(env);
  if (!execute) return plan;
  if (env.GITHUB_ACTIONS !== "true" || process.platform !== "linux" && !deps.testing) fail("EXECUTION_CONTEXT");
  await deps.authorize(env);
  await deps.probe(new URL(env.PREVIEW_SETUP_DATABASE_URL));
  const version = await deps.client("VERSION");
  if (version.error || version.signal || version.status !== 0 || version.stdout.trim() !== clientVersion) fail("CLIENT_VERSION");
  const sql = reviewedBindingSql();
  // One APPLY session, one unchanged transaction. ON_ERROR_STOP prevents reaching
  // any INSERT/POLICY after a failing preflight; no retry or reconnect on any failure.
  const before = bindingResult(await deps.client("APPLY",
    bindingAuditSql(false) + "\n" + bindingParameters() + sql), "APPLY");
  const after = bindingResult(await deps.client("VERIFY", bindingAuditSql(true)), "VERIFY");
  if (before.schema !== after.schema || before.privileges !== after.privileges)
    throw Object.assign(new Error("PREVIEW_BINDING_UNEXPECTED_CHANGE"), { phase: "VERIFY" });
  return { status: "PROFILE_BOUND_AND_VERIFIED", applicationProfiles: 1, profilePolicies: 1,
    authUsers: 1, role: "SALES_USER", runtimeLogin: false, runtimePassword: "ABSENT",
    migrationCount: 11, tableCount: 50, checksums: "MATCH", schema: "UNCHANGED",
    privileges: "UNCHANGED", rls: "ENABLED", apiAccess: "DENIED", clientTls: "VERIFIED",
    backendTlsBefore: before.backendTls, backendTlsAfter: after.backendTls };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let directory;
  let attempted = false;
  let completed = false;
  try {
    if (process.argv.length !== 3 || !["--plan", "--bind-profile"].includes(process.argv[2])) fail("ARGUMENTS");
    const result = await bindProfile(process.env, process.argv[2] === "--bind-profile", {
      authorize: verifyGitHubApproval, probe: probeTls,
      client: async (phase, sql) => {
        const connection = connectionFiles(process.env.PREVIEW_SETUP_DATABASE_URL);
        if (!directory) {
          directory = mkdtempSync(join(tmpdir(), "preview-binding-")); // mkdtemp creates 0700 on the Linux runner
          writeFileSync(join(directory, "pgpass"), connection.passfile, { mode: 0o600 });
          writeFileSync(join(directory, "ca.crt"), verifiedCa(), { mode: 0o600 });
        }
        const name = `preview-binding-${process.pid}-${phase.toLowerCase()}`;
        const childEnv = { PATH: "/usr/bin:/bin" }; // no Docker context, DB/service overrides or GitHub token
        if (phase === "APPLY") attempted = true;
        let child;
        try {
          const args = dockerArguments(directory, name, connection.env, phase === "VERSION");
          child = phase === "VERSION" ? spawnSync("/usr/bin/docker", args, {
            env: childEnv, shell: false, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 180000, maxBuffer: 2 * 1024 * 1024,
          }) : await runTlsSession(args, connection.env, sql);
          if (phase === "APPLY" && !child.error && child.status === 0) completed = true;
          return child;
        } catch (error) {
          // Attach only the fixed execution phase; never retain/log raw child errors.
          if (["APPLY", "VERIFY"].includes(phase) && error instanceof Error) error.phase = phase;
          throw error;
        } finally {
          // A timed-out docker CLI must not leave a credentialed SQL container running.
          // This is cleanup, not a retry. A lost COMMIT acknowledgement remains UNKNOWN.
          spawnSync("/usr/bin/docker", ["rm", "--force", name], { env: childEnv, stdio: "ignore", timeout: 15000 });
        }
      },
    });
    console.log(JSON.stringify(result));
  } catch (error) {
    const code = /^PREVIEW_(?:ROLE|SETUP|BINDING)_[A-Z_]+$/.test(error?.message ?? "") ? error.message : "PREVIEW_BINDING_FAILED";
    console.error(JSON.stringify({ status: completed ? "APPLIED_VERIFICATION_FAILED" : attempted ? "UNKNOWN_CHECK_BEFORE_RETRY" : "NOT_EXECUTED",
      code, ...clientDiagnostic(error) }));
    process.exitCode = 1;
  } finally { if (directory) rmSync(directory, { recursive: true, force: true }); }
}
