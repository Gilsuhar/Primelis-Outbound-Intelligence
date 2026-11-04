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
import { runtimeAuditSql } from "./runtime-provisioning-sql.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
// Official library/postgres 17.11-bookworm, linux/amd64 manifest read on 2026-11-04.
// --entrypoint psql prevents the image's database entrypoint/init scripts from running.
export const clientImage = "postgres@sha256:2cd2c0f809604aaeff6f0ec8f40aecbd025613107561015c69369a1a7f1d3416";
export const clientVersion = "psql (PostgreSQL) 17.11 (Debian 17.11-1.pgdg12+2)";
const endpoint = "aws-1-us-west-2.pooler.supabase.com:5432";
const fail = code => { throw new Error(`PREVIEW_ROLE_${code}`); };
const text = path => readFileSync(resolve(root, path), "utf8").replace(/\r\n/g, "\n");

export function runtimeRolePlan(env) {
  const plan = setupPlan(env, undefined, "provision-runtime-role");
  if (plan.endpoint !== endpoint || env.PREVIEW_VERIFY_DATABASE_URL || env.PREVIEW_ADMIN_DIFF_APPROVAL ||
      Object.keys(env).some(k => /^PG|^DOCKER_|^COMPOSE_|^OPENSSL_|^LD_|^DYLD_/.test(k)) ||
      [".env", "prisma/.env"].some(p => existsSync(resolve(root, p)))) fail("CONFIGURATION");
  const sql = text("scripts/preview/runtime-role.sql");
  const expected = JSON.parse(text("scripts/preview/runtime-role-manifest.json"));
  if (sha256(sql) !== expected.sqlSha256 || expected.clientImage !== clientImage || expected.clientVersion !== clientVersion ||
      !/^[a-f0-9]{64}$/.test(expected.schemaBaselineSha256))
    fail("REVIEWED_FILES_CHANGED");
  // Fail malformed/unsafe password-file inputs without printing any decoded component.
  connectionFiles(env.PREVIEW_SETUP_DATABASE_URL);
  return { status: "RUNTIME_ROLE_PLAN_VALIDATED", migrationCount: plan.migrations.length };
}

export function connectionFiles(value) {
  const url = new URL(value);
  const parts = [url.hostname, url.port, url.pathname.slice(1), decodeURIComponent(url.username), decodeURIComponent(url.password)];
  if (parts.some(p => !p || /[\r\n\0]/.test(p))) fail("CONFIGURATION");
  const escape = p => p.replaceAll("\\", "\\\\").replaceAll(":", "\\:");
  return { passfile: parts.map(escape).join(":") + "\n", env: {
    PGHOST: parts[0], PGPORT: parts[1], PGDATABASE: parts[2], PGUSER: parts[3],
    PGSSLMODE: "verify-full", PGSSLROOTCERT: "/run/preview/ca.crt", PGPASSFILE: "/run/preview/pgpass",
    PGSSLMINPROTOCOLVERSION: "TLSv1.2", PGGSSENCMODE: "disable", PGCONNECT_TIMEOUT: "15",
  } };
}

export function dockerArguments(directory, name, settings, version = false) {
  const args = ["run", "--rm", "--pull=never", "--platform=linux/amd64", "--name", name,
    "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--pids-limit=64",
    "--user", String(process.getuid?.() ?? 1001), "--entrypoint", "/usr/lib/postgresql/17/bin/psql"];
  if (version) return [...args, "--network=none", clientImage, "--version"];
  return [...args, "--interactive", "--mount", `type=bind,source=${directory},target=/run/preview,readonly`,
    ...Object.entries(settings).flatMap(([k, v]) => ["--env", `${k}=${v}`]),
    clientImage, "-X", "--no-password", "--quiet", "--tuples-only", "--no-align", "--set=ON_ERROR_STOP=1", "--file=-"];
}

// Only pinned stdin SQL, never a shell. Both stdout and stderr stay private; fixed codes only.
export function checkedResult(child, phase) {
  if (child.error || child.signal || child.status !== 0) {
    const known = ["SCHEMA_BASELINE", "IDENTITY", "READ_ONLY", "TLS", "HISTORY", "TABLES", "RLS_API", "EMPTY_DATA", "POLICIES",
      "ROLE_EXISTS", "GRANT_AUTHORITY", "PASSWORD_AUDIT_AUTHORITY", "PUBLIC_ACCESS", "ATTRIBUTES", "MEMBERSHIPS", "PROFILE_COLUMNS", "EFFECTIVE_ACCESS"];
    const condition = known.find(c => new RegExp(`\\bPREVIEW_ROLE_${c}\\b`).test(child.stderr ?? ""));
    throw Object.assign(new Error(`PREVIEW_ROLE_${condition ?? "CLIENT_FAILED"}`), { phase });
  }
  try {
    const rows = child.stdout.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
    const expected = phase === "APPLY" ? "PREFLIGHT_PASSED" : "POSTCHECK_PASSED";
    if (rows.length !== 1 || rows[0].status !== expected || !/^[a-f0-9]{64}$/.test(rows[0].schema)) fail("OUTPUT");
    return rows[0];
  } catch { throw Object.assign(new Error("PREVIEW_ROLE_OUTPUT"), { phase }); }
}

export async function provisionRuntimeRole(env, execute, deps) {
  const plan = runtimeRolePlan(env);
  if (!execute) return plan;
  // No local credentialed execution, dispatch inputs, arbitrary URLs or generic SQL mode.
  if (env.GITHUB_ACTIONS !== "true" || process.platform !== "linux" && !deps.testing) fail("EXECUTION_CONTEXT");
  await deps.authorize(env);
  await deps.probe(new URL(env.PREVIEW_SETUP_DATABASE_URL));
  const version = await deps.client("VERSION");
  if (version.error || version.status !== 0 || version.stdout.trim() !== clientVersion) fail("CLIENT_VERSION");
  // Every mandatory preflight occurs on the SAME verify-full libpq session as the role SQL.
  // Any preflight error terminates psql before the first role statement.
  const before = checkedResult(await deps.client("APPLY", runtimeAuditSql(false) + "\n" + text("scripts/preview/runtime-role.sql")), "APPLY");
  const after = checkedResult(await deps.client("VERIFY", runtimeAuditSql(true)), "VERIFY");
  if (before.schema !== after.schema) throw Object.assign(new Error("PREVIEW_ROLE_SCHEMA_CHANGED"), { phase: "VERIFY" });
  return { status: "ROLE_APPLIED_AND_VERIFIED", role: "recycler_preview_app", login: false,
    password: "ABSENT", migrationCount: 11, checksums: "MATCH", tableCount: 50,
    schema: "UNCHANGED", rls: "ENABLED", apiAccess: "DENIED", applicationRows: 0, authUsers: 0 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let directory;
  let attempted = false;
  let completed = false;
  try {
    if (process.argv.length !== 3 || !["--plan", "--provision-nologin-role"].includes(process.argv[2])) fail("ARGUMENTS");
    const result = await provisionRuntimeRole(process.env, process.argv[2] === "--provision-nologin-role", {
      authorize: verifyGitHubApproval, probe: probeTls,
      client: async (phase, sql) => {
        const connection = connectionFiles(process.env.PREVIEW_SETUP_DATABASE_URL);
        if (!directory) {
          directory = mkdtempSync(join(tmpdir(), "preview-role-")); // mkdtemp creates 0700 on the Linux runner
          writeFileSync(join(directory, "pgpass"), connection.passfile, { mode: 0o600 });
          writeFileSync(join(directory, "ca.crt"), verifiedCa(), { mode: 0o600 });
        }
        const name = `preview-role-${process.pid}-${phase.toLowerCase()}`;
        const childEnv = { PATH: "/usr/bin:/bin" }; // no Docker context, DB/service overrides or GitHub token
        if (phase === "APPLY") attempted = true;
        let child;
        try {
          child = spawnSync("/usr/bin/docker", dockerArguments(directory, name, connection.env, phase === "VERSION"), {
            env: childEnv, shell: false, input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 180000, maxBuffer: 2 * 1024 * 1024,
          });
          if (phase === "APPLY" && !child.error && child.status === 0) completed = true;
          return child;
        } finally {
          // A timed-out docker CLI must not leave a credentialed SQL container running.
          // This is cleanup, not a retry. A lost COMMIT acknowledgement remains UNKNOWN.
          spawnSync("/usr/bin/docker", ["rm", "--force", name], { env: childEnv, stdio: "ignore", timeout: 15000 });
        }
      },
    });
    console.log(JSON.stringify(result));
  } catch (error) {
    const code = /^PREVIEW_(?:ROLE|SETUP)_[A-Z_]+$/.test(error?.message ?? "") ? error.message : "PREVIEW_ROLE_FAILED";
    console.error(JSON.stringify({ status: completed ? "APPLIED_VERIFICATION_FAILED" : attempted ? "UNKNOWN_CHECK_BEFORE_RETRY" : "NOT_EXECUTED", code }));
    process.exitCode = 1;
  } finally { if (directory) rmSync(directory, { recursive: true, force: true }); }
}
