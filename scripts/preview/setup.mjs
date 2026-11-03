import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { validateGitHubContext, verifyGitHubApproval } from "./github-context.mjs";
import { probeTls } from "./tls-probe.mjs";
import { reviewedFiles, verifyInitializedSchema } from "./verification.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const target = JSON.parse(readFileSync(new URL("./verified-target.json", import.meta.url), "utf8"));
const legacy = ["ofxqdwpyqbvskrcfpdmx", "mfxqiyidmdppvdzeboke"];
const fail = () => { throw new Error("PREVIEW_SETUP_CONFIGURATION_REJECTED"); };

/** Separate operator-only credentials: never consumed by Next.js or installation hooks. */
export function setupPlan(env, migrations = readdirSync(resolve(root, "prisma/migrations"))) {
  const ref = env.PREVIEW_SETUP_APPROVED_PROJECT_REF;
  if (env.CI || env.GITHUB_ACTIONS) validateGitHubContext(env);
  if (env.VERCEL || env.VERCEL_ENV || env.DATABASE_URL || env.DIRECT_URL ||
      env.NODE_TLS_REJECT_UNAUTHORIZED === "0" ||
      !ref || ref !== target.projectRef || legacy.includes(ref) ||
      env.PREVIEW_SETUP_PROJECT_NAME !== "agent-workforce-preview" ||
      env.PREVIEW_SETUP_APPROVAL !== `initialize:${ref}`) fail();
  let url;
  try { url = new URL(env.PREVIEW_SETUP_DATABASE_URL); } catch { fail(); }
  const direct = url.hostname === `db.${ref}.supabase.co` && url.username === "postgres";
  const session = /^aws-[0-9]+-us-west-2\.pooler\.supabase\.com$/.test(url.hostname) &&
    url.username === `postgres.${ref}`;
  if (url.protocol !== "postgresql:" || (!direct && !session) ||
      url.port !== "5432" || env.PREVIEW_SETUP_APPROVED_ENDPOINT !== `${url.hostname}:5432` ||
      url.pathname !== "/postgres" || !url.password || url.hash ||
      url.searchParams.get("sslmode") !== "require" || url.searchParams.get("sslaccept") !== "strict" ||
      [...url.searchParams.keys()].sort().join(",") !== "sslaccept,sslmode") fail();
  const ordered = migrations.filter(name => /^\d{14}_[a-z0-9_]+$/.test(name)).sort();
  if (JSON.stringify(ordered) !== JSON.stringify(target.migrations)) fail();
  reviewedFiles(ordered);
  return { projectRef: ref, endpoint: `${url.hostname}:5432`, migrations: ordered };
}

/** Default is validation only. Execution requires an independent explicit CLI action and approval. */
export async function initializePreview(env, execute, dependencies) {
  const plan = setupPlan(env);
  if (!execute) return { status: "PLAN_VALIDATED", migrationCount: plan.migrations.length };
  const files = reviewedFiles(plan.migrations);
  if (env.GITHUB_ACTIONS) await dependencies.authorize(env);
  await dependencies.probe(new URL(env.PREVIEW_SETUP_DATABASE_URL));
  // TLS endpoint plus independently observed cluster fingerprint; never trust a session GUC
  // or project name as proof of identity. A restored/replaced cluster requires fresh review.
  const db = await dependencies.connect(env.PREVIEW_SETUP_DATABASE_URL);
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
    await dependencies.migrate(env.PREVIEW_SETUP_DATABASE_URL);
    // Verification failures do not undo committed migrations and must never trigger a rerun.
    try {
      const verification = await verifyInitializedSchema(db, plan, files);
      await dependencies.diff(env.PREVIEW_SETUP_DATABASE_URL);
      return { status: "SCHEMA_INITIALIZED_AND_VERIFIED", ...verification };
    } catch { throw new Error("PREVIEW_SETUP_APPLIED_VERIFICATION_FAILED"); }
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
      diff: async url => {
        const childEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
          ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "TEMP", "TMP"].includes(key)));
        const child = spawnSync(process.execPath,
          [resolve(root, "node_modules/prisma/build/index.js"), "migrate", "diff",
            "--from-schema-datasource", resolve(root, "prisma/schema.prisma"),
            "--to-schema-datamodel", resolve(root, "prisma/schema.prisma"), "--exit-code"],
          { cwd: root, env: { ...childEnv, DATABASE_URL: url, DIRECT_URL: url, CHECKPOINT_DISABLE: "1" }, stdio: "ignore" });
        if (child.status !== 0) throw new Error("PREVIEW_SETUP_SCHEMA_DIFF_FAILED");
      },
    });
    console.log(JSON.stringify(result));
  } catch (error) {
    const code = /^PREVIEW_SETUP_[A-Z_]+$/.test(error?.message ?? "") ? error.message : "PREVIEW_SETUP_FAILED";
    console.error(`${code}: stopped; inspect securely; no automatic retry.`);
    process.exitCode = 1;
  }
}
