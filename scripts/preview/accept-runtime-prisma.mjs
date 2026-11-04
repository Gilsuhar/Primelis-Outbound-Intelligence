import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { setupPlan } from "./setup.mjs";
import { verifyGitHubApproval } from "./github-context.mjs";
import { verifiedCa } from "./tls-trust.mjs";
import { probeTls } from "./tls-probe.mjs";
import { activationAuditSql } from "./runtime-provisioning-sql.mjs";
import { runTlsSession, clientDiagnostic } from "./psql-tls-session.mjs";
import { clientImage, clientVersion, connectionFiles, dockerArguments } from "./provision-runtime-role.mjs";
import { bindingResult } from "./bind-profile.mjs";
import { runtimeCredential } from "./runtime-credential.mjs";
import { applicationRuntimeBindings } from "./runtime-acceptance-client.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const fail = code => { throw new Error("PREVIEW_RUNTIME_ACCEPTANCE_" + code); };
const childKeys = ["CI", "GITHUB_ACTIONS", "GITHUB_REPOSITORY", "GITHUB_REPOSITORY_ID", "GITHUB_REPOSITORY_OWNER_ID",
  "GITHUB_ACTOR_ID", "GITHUB_ACTOR", "GITHUB_TRIGGERING_ACTOR", "GITHUB_REF", "GITHUB_REF_TYPE", "GITHUB_SHA",
  "GITHUB_WORKFLOW_SHA", "GITHUB_WORKFLOW_REF", "GITHUB_EVENT_NAME", "GITHUB_RUN_ATTEMPT", "GITHUB_RUN_ID",
  "PREVIEW_SETUP_APPROVED_SHA", "PREVIEW_SETUP_ENVIRONMENT", "PREVIEW_SETUP_PUSH_CREATED", "PREVIEW_SETUP_PUSH_DELETED",
  "PREVIEW_SETUP_PUSH_FORCED", "PREVIEW_SETUP_PUSH_BEFORE", "PREVIEW_SETUP_APPROVAL", "PREVIEW_SETUP_APPROVED_PROJECT_REF",
  "PREVIEW_SETUP_APPROVED_ENDPOINT", "PREVIEW_RUNTIME_DATABASE_URL", "PREVIEW_RUNTIME_CREDENTIAL_ATTESTATION"];
export function runtimeChildEnvironment(env) {
  return { PATH: "/usr/bin:/bin", ...Object.fromEntries(childKeys.filter(k => env[k] !== undefined).map(k => [k, env[k]])) };
}
export function acceptancePlan(env) {
  const plan = setupPlan(env, undefined, "accept-runtime-prisma");
  if (env.CI !== "true" || env.GITHUB_ACTIONS !== "true" || plan.endpoint !== "aws-1-us-west-2.pooler.supabase.com:5432" ||
      env.PREVIEW_VERIFY_DATABASE_URL || env.PREVIEW_ADMIN_DIFF_APPROVAL || env.PREVIEW_DATABASE_URL ||
      Object.keys(env).some(k => /^PG|^DOCKER_|^COMPOSE_|^OPENSSL_|^LD_|^DYLD_|^NODE_OPTIONS$|^NODE_EXTRA_CA_CERTS$|^PRISMA_/.test(k)) ||
      [".env", "prisma/.env"].some(p => existsSync(resolve(root, p)))) fail("CONFIGURATION");
  const manifest = JSON.parse(readFileSync(new URL("./runtime-role-manifest.json", import.meta.url)));
  if (manifest.clientImage !== clientImage || manifest.clientVersion !== clientVersion) fail("CLIENT_VERSION");
  connectionFiles(env.PREVIEW_SETUP_DATABASE_URL);
  runtimeCredential(env); // includes rejection of administrator password reuse
  applicationRuntimeBindings(runtimeChildEnvironment(env));
  return { status: "RUNTIME_ACCEPTANCE_PLAN_VALIDATED", migrationCount: plan.migrations.length };
}

export function runtimeResult(child) {
  if (child.error || child.signal || child.status !== 0) {
    let parsed;
    try { parsed = JSON.parse(child.stderr.trim()); } catch { /* No raw child diagnostics. */ }
    const allowed = ["SESSION", "PRIVILEGES", "PROFILE", "VISIBLE_PROFILES", "UNAUTHORIZED_PROFILE", "DENIED_READ_SUCCEEDED", "CONNECTION_OR_QUERY"];
    if (parsed?.status === "RUNTIME_ACCEPTANCE_FAILED" && allowed.some(c => parsed.code === "PREVIEW_RUNTIME_VERIFY_" + c))
      throw new Error(parsed.code);
    fail(child.signal ? "CLIENT_TIMEOUT_OR_SIGNAL" : "CLIENT_FAILED");
  }
  try {
    const row = JSON.parse(child.stdout.trim());
    if (child.stderr?.trim() || Object.keys(row).sort().join(",") !== "allowedColumns,deniedReads,readOnly,status,visibleProfiles,writePrivileges" ||
        row.status !== "RUNTIME_PRISMA_VERIFIED" || row.visibleProfiles !== 1 || row.allowedColumns !== 5 || row.deniedReads !== 4 ||
        row.writePrivileges !== "DENIED" || row.readOnly !== "VERIFIED") fail("CLIENT_EVIDENCE");
    return row;
  } catch { fail("CLIENT_EVIDENCE"); }
}

export async function acceptRuntimePrisma(env, execute, deps) {
  const plan = acceptancePlan(env);
  if (!execute) return plan;
  if (process.platform !== "linux" && !deps.testing) fail("EXECUTION_CONTEXT");
  await deps.authorize(env);
  await deps.probe(new URL(env.PREVIEW_SETUP_DATABASE_URL));
  const version = await deps.client("VERSION");
  if (version.error || version.signal || version.status !== 0 || version.stdout.trim() !== clientVersion) fail("CLIENT_VERSION");
  // This is the already-active role audit, never the initializer or activation path.
  const sql = activationAuditSql("postcheck");
  const before = bindingResult(await deps.client("BEFORE", sql), "VERIFY");
  await deps.probe(new URL(env.PREVIEW_RUNTIME_DATABASE_URL));
  const runtime = runtimeResult(await deps.runtime(runtimeChildEnvironment(env)));
  const after = bindingResult(await deps.client("AFTER", sql), "VERIFY");
  if (before.schema !== after.schema || before.privileges !== after.privileges) fail("UNEXPECTED_CHANGE");
  return { status: "RUNTIME_ACCEPTANCE_VERIFIED", runtime, migrationCount: 11, tableCount: 50, checksums: "MATCH",
    schema: "UNCHANGED", privileges: "UNCHANGED", rls: "ENABLED", apiAccess: "DENIED", administratorClientTls: "VERIFIED",
    runtimeTls: "PINNED_CA_STRICT", role: "recycler_preview_app", databaseWrites: 0 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let directory;
  try {
    if (process.argv.length !== 3 || !["--plan", "--accept-runtime-prisma"].includes(process.argv[2])) fail("ARGUMENTS");
    const result = await acceptRuntimePrisma(process.env, process.argv[2] === "--accept-runtime-prisma", {
      authorize: verifyGitHubApproval, probe: probeTls,
      runtime: env => spawnSync(process.execPath, [resolve(root, "scripts/preview/runtime-acceptance-client.mjs")], {
        cwd: root, env, shell: false, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120000, maxBuffer: 1024 * 1024,
      }),
      client: async (phase, sql) => {
        const connection = connectionFiles(process.env.PREVIEW_SETUP_DATABASE_URL);
        if (!directory) {
          directory = mkdtempSync(join(tmpdir(), "preview-acceptance-"));
          writeFileSync(join(directory, "pgpass"), connection.passfile, { mode: 0o600 });
          writeFileSync(join(directory, "ca.crt"), verifiedCa(), { mode: 0o600 });
        }
        const name = `preview-acceptance-${process.pid}-${phase.toLowerCase()}`, childEnv = { PATH: "/usr/bin:/bin" };
        try {
          const args = dockerArguments(directory, name, connection.env, phase === "VERSION");
          return phase === "VERSION" ? spawnSync("/usr/bin/docker", args, { env: childEnv, shell: false, encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"], timeout: 180000, maxBuffer: 1024 * 1024 }) : await runTlsSession(args, connection.env, sql);
        } finally { spawnSync("/usr/bin/docker", ["rm", "--force", name], { env: childEnv, stdio: "ignore", timeout: 15000 }); }
      },
    });
    console.log(JSON.stringify(result));
  } catch (error) {
    const code = /^PREVIEW_(?:ROLE|SETUP|BINDING|ACTIVATION|RUNTIME_ACCEPTANCE|RUNTIME_VERIFY)_[A-Z_]+$/.test(error?.message ?? "")
      ? error.message : "PREVIEW_RUNTIME_ACCEPTANCE_FAILED";
    console.error(JSON.stringify({ status: "RUNTIME_ACCEPTANCE_FAILED", code, ...clientDiagnostic(error) })); process.exitCode = 1;
  } finally { if (directory) rmSync(directory, { recursive: true, force: true }); }
}
