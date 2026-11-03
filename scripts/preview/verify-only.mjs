import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { setupPlan } from "./setup.mjs";
import { reviewedFiles, verifyInitializedSchema } from "./verification.mjs";
import { verificationError, verificationReport } from "./verification-errors.mjs";
import { probeTls, tlsFailureCategory } from "./tls-probe.mjs";
import { prismaTlsUrl } from "./tls-trust.mjs";
import { runSchemaDiff } from "./schema-diff.mjs";
import { verifyGitHubApproval } from "./github-context.mjs";
import { verificationUrl, withReadOnlyContext } from "./read-only-context.mjs";

/** Independent verification of initialized Preview. No migration dependency or write command. */
export async function verifyPreview(env, execute, dependencies) {
  const plan = setupPlan(env, undefined, "verify-readonly");
  const url = verificationUrl(prismaTlsUrl(env.PREVIEW_VERIFY_DATABASE_URL));
  if (!execute) return { status: "VERIFICATION_PLAN_VALIDATED", migrationCount: plan.migrations.length };
  // Published Linux migrations use the reviewed LF bytes. A local CRLF checkout must not
  // produce a false checksum mismatch against those already-applied files.
  const files = reviewedFiles(plan.migrations, path => Buffer.from(
    readFileSync(new URL(`../../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n")));
  if (env.GITHUB_ACTIONS) await dependencies.authorize(env);
  await dependencies.probe(new URL(env.PREVIEW_VERIFY_DATABASE_URL));
  let db;
  try {
    db = await dependencies.connect(url);
  } catch (error) {
    await db?.$disconnect();
    throw verificationError(error, "IDENTITY");
  }
  try {
    const verification = await withReadOnlyContext(db, tx => verifyInitializedSchema(tx, plan, files, true));
    await dependencies.diff(url);
    return { status: "EXISTING_SCHEMA_VERIFIED", ...verification };
  } finally { await db.$disconnect(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3 || !["--plan", "--verify-only"].includes(process.argv[2]))
      throw new Error("PREVIEW_SETUP_CONFIGURATION_REJECTED");
    const result = await verifyPreview(process.env, process.argv[2] === "--verify-only", {
      authorize: verifyGitHubApproval, probe: probeTls, diff: runSchemaDiff,
      connect: async url => {
        const { PrismaClient } = await import("@prisma/client");
        return new PrismaClient({ datasources: { db: { url } }, log: [] });
      },
    });
    console.log(JSON.stringify(result));
  } catch (error) {
    if (error?.message === "PREVIEW_SETUP_TLS_CONNECTIVITY_FAILED")
      console.error(JSON.stringify({ tlsFailure: tlsFailureCategory(error) }));
    else console.error(JSON.stringify({ verification: verificationReport(error) }));
    console.error(/^PREVIEW_SETUP_[A-Z_]+$/.test(error?.message ?? "") ? error.message : "PREVIEW_SETUP_VERIFICATION_FAILED");
    process.exitCode = 1;
  }
}
