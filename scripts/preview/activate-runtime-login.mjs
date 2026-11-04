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
import { activationScript, runActivationSession, activationConditions } from "./activation-session.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const fail = code => { throw new Error("PREVIEW_ACTIVATION_" + code); };
export { credentialAttestation, runtimeCredential } from "./runtime-credential.mjs";
import { runtimeCredential } from "./runtime-credential.mjs";

export function activationPlan(env) {
  const plan = setupPlan(env, undefined, "activate-runtime-login");
  // Require protected GitHub context even for plan mode: no local secret fallback.
  if (env.GITHUB_ACTIONS !== "true" || env.CI !== "true" || plan.endpoint !== "aws-1-us-west-2.pooler.supabase.com:5432" ||
      env.PREVIEW_VERIFY_DATABASE_URL || env.PREVIEW_ADMIN_DIFF_APPROVAL || env.PREVIEW_DATABASE_URL ||
      Object.keys(env).some(k => /^PG|^DOCKER_|^COMPOSE_|^OPENSSL_|^LD_|^DYLD_/.test(k)) ||
      [".env", "prisma/.env"].some(p => existsSync(resolve(root, p)))) fail("CONFIGURATION");
  const manifest = JSON.parse(readFileSync(new URL("./runtime-role-manifest.json", import.meta.url)));
  if (manifest.clientImage !== clientImage || manifest.clientVersion !== clientVersion) fail("CLIENT_VERSION");
  connectionFiles(env.PREVIEW_SETUP_DATABASE_URL);
  runtimeCredential(env);
  return { status: "RUNTIME_LOGIN_PLAN_VALIDATED", migrationCount: plan.migrations.length };
}

export async function activateRuntimeLogin(env, execute, deps) {
  const plan = activationPlan(env);
  if (!execute) return plan;
  if (process.platform !== "linux" && !deps.testing) fail("EXECUTION_CONTEXT");
  await deps.authorize(env);
  await deps.probe(new URL(env.PREVIEW_SETUP_DATABASE_URL));
  const version = await deps.client("VERSION");
  if (version.error || version.signal || version.status !== 0 || version.stdout.trim() !== clientVersion) fail("CLIENT_VERSION");
  const applied = await deps.activate(runtimeCredential(env));
  if (applied?.committed !== true || applied.clientTls !== "VERIFIED" ||
      !/^[a-f0-9]{64}$/.test(applied.before?.schema ?? "") || !/^[a-f0-9]{64}$/.test(applied.before?.privileges ?? "") ||
      applied.ready?.schema !== applied.before.schema || applied.ready?.privileges !== applied.before.privileges) fail("ACTIVATION_EVIDENCE");
  const after = bindingResult(await deps.client("VERIFY", activationAuditSql("postcheck")), "VERIFY");
  if (after.schema !== applied.before.schema || after.privileges !== applied.before.privileges) fail("UNEXPECTED_CHANGE");
  return { status: "RUNTIME_LOGIN_ACTIVATED_AND_VERIFIED", runtimeLogin: true, runtimePassword: "SCRAM_PRESENT",
    applicationProfiles: 1, profilePolicies: 1, authUsers: 1, migrationCount: 11, tableCount: 50,
    checksums: "MATCH", schema: "UNCHANGED", privileges: "UNCHANGED_EXCEPT_LOGIN", rls: "ENABLED", apiAccess: "DENIED",
    clientTls: "VERIFIED", backendTlsBefore: applied.before.backendTls, backendTlsAfter: after.backendTls };
}

export function activationDiagnostic(error, attempted, completed) {
  const code = /^PREVIEW_(?:ROLE|SETUP|BINDING|ACTIVATION)_[A-Z_]+$/.test(error?.message ?? "") ? error.message : "PREVIEW_ACTIVATION_FAILED";
  const privateCategory = ["CREDENTIAL_FORMAT", "UNEXPECTED_CHANGE", "PROCESS_INCOMPLETE"].includes(error?.category) ? error.category : undefined;
  return { status: completed ? "APPLIED_VERIFICATION_FAILED" : attempted ? "UNKNOWN_CHECK_BEFORE_RETRY" : "NOT_EXECUTED",
    code, ...clientDiagnostic(error), ...(privateCategory ? { category: privateCategory } : {}),
    ...(activationConditions.includes(error?.condition) ? { condition: error.condition } : {}) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let directory, attempted = false, completed = false;
  const childEnv = { PATH: "/usr/bin:/bin" };
  const prepare = () => {
    const connection = connectionFiles(process.env.PREVIEW_SETUP_DATABASE_URL);
    if (!directory) {
      directory = mkdtempSync(join(tmpdir(), "preview-login-")); // 0700 on the Linux runner
      writeFileSync(join(directory, "pgpass"), connection.passfile, { mode: 0o600 });
      writeFileSync(join(directory, "ca.crt"), verifiedCa(), { mode: 0o600 });
      writeFileSync(join(directory, "activate.sql"), activationScript(), { mode: 0o600 });
    }
    return connection;
  };
  const cleanup = name => spawnSync("/usr/bin/docker", ["rm", "--force", name], { env: childEnv, stdio: "ignore", timeout: 15000 });
  try {
    if (process.argv.length !== 3 || !["--plan", "--activate-runtime-login"].includes(process.argv[2])) fail("ARGUMENTS");
    const result = await activateRuntimeLogin(process.env, process.argv[2] === "--activate-runtime-login", {
      authorize: verifyGitHubApproval, probe: probeTls,
      activate: async password => {
        const connection = prepare(), name = `preview-login-${process.pid}-apply`;
        const args = dockerArguments(directory, name, connection.env);
        if (args.at(-1) !== "--file=-" || args.includes("--tty")) fail("CLIENT_ARGUMENTS");
        args[args.length - 1] = "--file=/run/preview/activate.sql";
        attempted = true;
        try {
          const result = await runActivationSession(args, connection.env, password);
          completed = result.committed;
          return result;
        } finally { cleanup(name); }
      },
      client: async (phase, sql) => {
        const connection = prepare(), name = `preview-login-${process.pid}-${phase.toLowerCase()}`;
        try {
          const args = dockerArguments(directory, name, connection.env, phase === "VERSION");
          return phase === "VERSION" ? spawnSync("/usr/bin/docker", args, {
            env: childEnv, shell: false, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 180000, maxBuffer: 2 * 1024 * 1024,
          }) : await runTlsSession(args, connection.env, sql);
        } finally { cleanup(name); }
      },
    });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(JSON.stringify(activationDiagnostic(error, attempted, completed)));
    process.exitCode = 1;
  } finally { if (directory) rmSync(directory, { recursive: true, force: true }); }
}
