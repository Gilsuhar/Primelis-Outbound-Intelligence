import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { validateGitHubContext, verifyGitHubApproval } from "./github-context.mjs";
import { probeTls, tlsFailureCategory } from "./tls-probe.mjs";
import { prismaTlsUrl, verifiedCa } from "./tls-trust.mjs";
import { reviewedFiles, verifyInitializedSchema } from "./verification.mjs";
import { runSchemaDiff } from "./schema-diff.mjs";
import { verificationReport } from "./verification-errors.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const target = JSON.parse(readFileSync(new URL("./verified-target.json", import.meta.url), "utf8"));
const legacy = ["ofxqdwpyqbvskrcfpdmx", "mfxqiyidmdppvdzeboke"];
const fail = () => { throw new Error("PREVIEW_SETUP_CONFIGURATION_REJECTED"); };

/** Separate operator-only credentials: never consumed by Next.js or installation hooks. */
export function setupPlan(env, migrations = readdirSync(resolve(root, "prisma/migrations")), operation = "initialize") {
  if (!["initialize", "verify", "verify-readonly", "audit-admin", "provision-runtime-role", "bind-profile", "activate-runtime-login"].includes(operation)) fail();
  const ref = env.PREVIEW_SETUP_APPROVED_PROJECT_REF;
  if (env.CI || env.GITHUB_ACTIONS) validateGitHubContext(env);
  if (env.VERCEL || env.VERCEL_ENV || env.DATABASE_URL || env.DIRECT_URL ||
      env.NODE_TLS_REJECT_UNAUTHORIZED === "0" ||
      !ref || ref !== target.projectRef || legacy.includes(ref) ||
      env.PREVIEW_SETUP_PROJECT_NAME !== "agent-workforce-preview" ||
      env.PREVIEW_SETUP_APPROVAL !== `${operation}:${ref}`) fail();
  let url;
  if (operation === "verify-readonly" && env.PREVIEW_SETUP_DATABASE_URL) fail();
  try { url = new URL(operation === "verify-readonly" ? env.PREVIEW_VERIFY_DATABASE_URL : env.PREVIEW_SETUP_DATABASE_URL); } catch { fail(); }
  const role = operation === "verify-readonly" ? "recycler_preview_verify" : "postgres";
  const direct = url.hostname === `db.${ref}.supabase.co` && url.username === role;
  const session = /^aws-[0-9]+-us-west-2\.pooler\.supabase\.com$/.test(url.hostname) &&
    url.username === `${role}.${ref}`;
  if (url.protocol !== "postgresql:" || (!direct && !session) ||
      url.port !== "5432" || env.PREVIEW_SETUP_APPROVED_ENDPOINT !== `${url.hostname}:5432` ||
      url.pathname !== "/postgres" || !url.password || url.hash ||
      url.searchParams.get("sslmode") !== "require" || url.searchParams.get("sslaccept") !== "strict" ||
      [...url.searchParams.keys()].sort().join(",") !== "sslaccept,sslmode") fail();
  const ordered = migrations.filter(name => /^\d{14}_[a-z0-9_]+$/.test(name)).sort();
  if (JSON.stringify(ordered) !== JSON.stringify(target.migrations)) fail();
  reviewedFiles(ordered);
  verifiedCa();
  return { projectRef: ref, endpoint: `${url.hostname}:5432`, migrations: ordered };
}

/** Default is validation only. Execution requires an independent explicit CLI action and approval. */
export async function initializePreview(env, execute, dependencies) {
  const plan = setupPlan(env);
  if (!execute) return { status: "PLAN_VALIDATED", migrationCount: plan.migrations.length };
  const files = reviewedFiles(plan.migrations);
  if (env.GITHUB_ACTIONS) await dependencies.authorize(env);
  await dependencies.probe(new URL(env.PREVIEW_SETUP_DATABASE_URL));
  const databaseUrl = prismaTlsUrl(env.PREVIEW_SETUP_DATABASE_URL);
  // TLS endpoint plus independently observed cluster fingerprint; never trust a session GUC
  // or project name as proof of identity. A restored/replaced cluster requires fresh review.
  const db = await dependencies.connect(databaseUrl);
  try {
    const identity = await db.$queryRawUnsafe(
      "SELECT current_database() AS database, session_user AS operator, " +
      "pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(system_identifier::text, 'UTF8')), 'hex') AS fingerprint " +
      "FROM pg_catalog.pg_control_system()",
    );
    if (identity.length !== 1 || identity[0].database !== "postgres" ||
        identity[0].operator !== "postgres" || identity[0].fingerprint !== target.clusterFingerprint)
      throw new Error("PREVIEW_SETUP_TARGET_REJECTED");
    const objects = await db.$queryRawUnsafe(
      "SELECT c.relname AS name FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' " +
      "UNION ALL SELECT t.typname FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public'",
    );
    // Fresh initialization only. Partial migrations require separate operator diagnosis; no retries.
    if (objects.length) throw new Error("PREVIEW_SETUP_DATABASE_NOT_EMPTY");
    await dependencies.migrate(databaseUrl);
    // Verification failures do not undo committed migrations and must never trigger a rerun.
    try {
      const verification = await verifyInitializedSchema(db, plan, files);
      await dependencies.diff(databaseUrl);
      return { status: "SCHEMA_INITIALIZED_AND_VERIFIED", ...verification };
    } catch (error) {
      throw Object.assign(new Error("PREVIEW_SETUP_APPLIED_VERIFICATION_FAILED"), { verification: verificationReport(error) });
    }
  } finally { await db.$disconnect(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const arg = process.argv[2];
    if (!["--plan", "--execute-approved-initialization"].includes(arg) || process.argv.length !== 3) fail();
    const result = await initializePreview(process.env, arg === "--execute-approved-initialization", {
      authorize: verifyGitHubApproval,
      probe: probeTls,
      connect: async url => {
        const { PrismaClient } = await import("@prisma/client");
        return new PrismaClient({ datasources: { db: { url } }, log: [] });
      },
      migrate: async url => {
        // No inherited application/provider credentials; no shell; suppress child diagnostics.
        const childEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
          ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "TEMP", "TMP"].includes(key)));
        const child = spawnSync(process.execPath,
          [resolve(root, "node_modules/prisma/build/index.js"), "migrate", "deploy", "--schema", resolve(root, "prisma/schema.prisma")],
          { cwd: root, env: { ...childEnv, DATABASE_URL: url, DIRECT_URL: url, CHECKPOINT_DISABLE: "1" }, stdio: "ignore" });
        if (child.status !== 0) throw new Error("PREVIEW_SETUP_MIGRATION_FAILED_POSSIBLY_PARTIAL");
      },
      diff: runSchemaDiff,
    });
    console.log(JSON.stringify(result));
  } catch (error) {
    if (error?.message === "PREVIEW_SETUP_APPLIED_VERIFICATION_FAILED")
      console.error(JSON.stringify({ verification: error.verification }));
    if (error?.message === "PREVIEW_SETUP_TLS_CONNECTIVITY_FAILED")
      console.error(JSON.stringify({ tlsFailure: tlsFailureCategory(error) }));
    const code = /^PREVIEW_SETUP_[A-Z_]+$/.test(error?.message ?? "") ? error.message : "PREVIEW_SETUP_FAILED";
    console.error(`${code}: stopped; inspect securely; no automatic retry.`);
    process.exitCode = 1;
  }
}
