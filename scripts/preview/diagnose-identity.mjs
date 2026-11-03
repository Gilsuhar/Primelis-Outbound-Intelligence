import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { setupPlan } from "./setup.mjs";
import { assertPreviewIdentity, identityQuery } from "./identity.mjs";
import { verifyGitHubApproval } from "./github-context.mjs";
import { probeTls, tlsFailureCategory } from "./tls-probe.mjs";
import { prismaTlsUrl } from "./tls-trust.mjs";
import { readOnlyUrl } from "./schema-diff.mjs";
import { verificationError, verificationReport } from "./verification-errors.mjs";

/** Exactly one SELECT, no history/diff/initialization. Never returns database values. */
export async function diagnoseIdentity(env, dependencies) {
  setupPlan(env, undefined, "verify");
  if (env.GITHUB_ACTIONS) await dependencies.authorize(env);
  await dependencies.probe(new URL(env.PREVIEW_SETUP_DATABASE_URL));
  let db;
  let failure;
  try {
    db = await dependencies.connect(readOnlyUrl(prismaTlsUrl(env.PREVIEW_SETUP_DATABASE_URL)));
    assertPreviewIdentity(await db.$queryRawUnsafe(identityQuery));
    return [];
  } catch (error) {
    failure = verificationError(error, "IDENTITY");
    throw failure;
  } finally {
    // Do not let an arbitrary disconnect exception disclose connection details.
    try { await db?.$disconnect(); } catch {
      if (!failure) throw new Error("PREVIEW_SETUP_DIAGNOSTIC_DISCONNECT_FAILED");
    }
  }
}

export function diagnosticConditions(error) {
  if (error?.message === "PREVIEW_SETUP_TLS_CONNECTIVITY_FAILED") return [`TLS_${tlsFailureCategory(error)}`];
  for (const code of ["PREVIEW_SETUP_CONFIGURATION_REJECTED", "PREVIEW_SETUP_GITHUB_APPROVAL_REJECTED",
    "PREVIEW_SETUP_FILES_CHANGED", "PREVIEW_SETUP_CA_REJECTED", "PREVIEW_SETUP_DIAGNOSTIC_DISCONNECT_FAILED"])
    if (error?.message === code) return [code];
  const report = verificationReport(error);
  return report.failedConditions?.length ? report.failedConditions : [`IDENTITY_QUERY_${report.category}`];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3 || process.argv[2] !== "--diagnose-identity")
      throw new Error("PREVIEW_SETUP_CONFIGURATION_REJECTED");
    const result = await diagnoseIdentity(process.env, {
      authorize: verifyGitHubApproval, probe: probeTls,
      connect: async url => {
        const { PrismaClient } = await import("@prisma/client");
        return new PrismaClient({ datasources: { db: { url } }, log: [] });
      },
    });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(JSON.stringify(diagnosticConditions(error)));
    process.exitCode = 1;
  }
}
