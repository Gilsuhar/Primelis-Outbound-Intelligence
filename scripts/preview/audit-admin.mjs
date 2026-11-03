// One-time trusted administrative audit. Never used by the application or installation hooks.
// The Prisma CLI uses a privileged independent connection: see the explicit approval below.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { setupPlan } from "./setup.mjs";
import { identityQuery, assertPreviewIdentity } from "./identity.mjs";
import { reviewedFiles, verifyInitializedSchema } from "./verification.mjs";
import { classifyDiff } from "./schema-diff.mjs";
import { prismaTlsUrl } from "./tls-trust.mjs";
import { probeTls, tlsFailureCategory } from "./tls-probe.mjs";
import { verifyGitHubApproval } from "./github-context.mjs";
import { verificationError, verificationReport } from "./verification-errors.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const fail = () => { throw new Error("PREVIEW_SETUP_CONFIGURATION_REJECTED"); };

/** Explicit transaction boundaries, not startup options or permanent administrator defaults. */
export async function withAdministrativeAudit(db, work) {
  return db.$transaction(async tx => {
    try {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      await tx.$executeRawUnsafe("SET LOCAL default_transaction_read_only = on");
      // This does NOT bypass RLS. PostgreSQL errors instead of returning policy-filtered counts.
      await tx.$executeRawUnsafe("SET LOCAL row_security = off");
      const rows = await tx.$queryRawUnsafe(`SELECT identity.*, current_setting('row_security')='off' AS unfiltered FROM (${identityQuery}) identity`);
      assertPreviewIdentity(rows);
      if (rows[0].unfiltered !== true) throw new Error("PREVIEW_SETUP_RLS_VERIFICATION_FAILED");
    } catch (error) { throw verificationError(error, "IDENTITY"); }
    return work(Object.freeze({ $queryRawUnsafe: sql => {
      const syntax = sql.replace(/'(?:[^']|'')*'/g, "''").replace(/"(?:[^"]|"")*"/g, '""');
      if (!sql.startsWith("SELECT ") || /;|--|\/\*|\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|GRANT|REVOKE|TRUNCATE|COPY|CALL|DO|SET|INTO)\b/i.test(syntax))
        throw verificationError(new Error("PREVIEW_SETUP_READ_ONLY_REJECTED"), "READ_ONLY");
      return tx.$queryRawUnsafe(sql);
    } }));
  }, { isolationLevel: "RepeatableRead", maxWait: 10000, timeout: 120000 });
}

/**
 * No migration dependency is invoked. Execution requires explicit acceptance of the DIFFERENT
 * trust boundary: CLI diff is read-only by pinned command implementation, not by denied admin ACLs
 * or a transaction on this client. No claim is made about the CLI session's read-only GUC.
 */
export async function auditPreview(env, execute, dependencies) {
  const plan = setupPlan(env, undefined, "audit-admin");
  if (env.PREVIEW_VERIFY_DATABASE_URL || env.PREVIEW_ADMIN_DIFF_APPROVAL !== "privileged-read-only-prisma-diff") fail();
  if (JSON.parse(readFileSync(resolve(root, "node_modules/prisma/package.json"), "utf8")).version !== "5.22.0" ||
      [".env", "prisma/.env"].some(path => existsSync(resolve(root, path)))) fail();
  const url = prismaTlsUrl(env.PREVIEW_SETUP_DATABASE_URL);
  if (!execute) return { status: "ADMINISTRATIVE_AUDIT_PLAN_VALIDATED", migrationCount: plan.migrations.length,
    diffProtection: "REVIEWED_COMMAND_WITH_PRIVILEGED_CREDENTIAL" };
  const files = reviewedFiles(plan.migrations, path => Buffer.from(readFileSync(resolve(root, path), "utf8").replace(/\r\n/g, "\n")));
  if (env.GITHUB_ACTIONS) await dependencies.authorize(env);
  await dependencies.probe(new URL(env.PREVIEW_SETUP_DATABASE_URL));
  let db;
  let failed = false;
  try { db = await dependencies.connect(url); } catch (error) { throw verificationError(error, "IDENTITY"); }
  try {
    // Administrator can read existing metadata/counts without granting another role any access.
    // No new RLS policies are expected; existing public API denial remains mandatory.
    await withAdministrativeAudit(db, tx => verifyInitializedSchema(tx, plan, files));
    const childEnv = Object.fromEntries(Object.entries(env).filter(([key]) =>
      ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "TEMP", "TMP"].includes(key)));
    let result;
    try {
      result = dependencies.run(process.execPath, [resolve(root, "node_modules/prisma/build/index.js"), "migrate", "diff",
        "--from-schema-datasource", resolve(root, "prisma/schema.prisma"),
        "--to-schema-datamodel", resolve(root, "prisma/schema.prisma"), "--exit-code"], {
        cwd: root, env: { ...childEnv, DATABASE_URL: url, DIRECT_URL: url, CHECKPOINT_DISABLE: "1" },
        shell: false, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", timeout: 60000, maxBuffer: 1024 * 1024,
      });
    } catch { result = { status: null, error: {} }; }
    classifyDiff(result); // Never print the process's raw output or treat errors as drift.
    // Fresh transaction rechecks identity/history/RLS/counts after the independent CLI finishes.
    const verification = await withAdministrativeAudit(db, tx => verifyInitializedSchema(tx, plan, files));
    return { status: "ADMINISTRATIVE_SCHEMA_AUDIT_PASSED", ...verification,
      schemaComparison: "MATCH", diffProtection: "REVIEWED_COMMAND_WITH_PRIVILEGED_CREDENTIAL" };
  } catch (error) { failed = true; throw error; } finally {
    try { await db.$disconnect(); } catch { if (!failed) throw verificationError(new Error(), "IDENTITY"); }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3 || !["--plan", "--audit-with-prisma-diff"].includes(process.argv[2])) fail();
    const result = await auditPreview(process.env, process.argv[2] === "--audit-with-prisma-diff", {
      authorize: verifyGitHubApproval, probe: probeTls, run: spawnSync,
      connect: async url => {
        const { PrismaClient } = await import("@prisma/client");
        return new PrismaClient({ datasources: { db: { url } }, log: [] });
      },
    });
    console.log(JSON.stringify(result));
  } catch (error) {
    if (error?.message === "PREVIEW_SETUP_TLS_CONNECTIVITY_FAILED") console.error(JSON.stringify({ tlsFailure: tlsFailureCategory(error) }));
    else console.error(JSON.stringify({ verification: verificationReport(error) }));
    console.error(/^PREVIEW_SETUP_[A-Z_]+$/.test(error?.message ?? "") ? error.message : "PREVIEW_SETUP_VERIFICATION_FAILED");
    process.exitCode = 1;
  }
}
