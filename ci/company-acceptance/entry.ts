import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from "node:fs";
import {
  requireCiApproval,
  requireCiDatabaseUrl,
  verifyRepositoryMetadata,
  checksum,
  fail,
} from "./policy";
import { blockProviderNetwork } from "./network";
import { connectCiDatabase } from "./transport";

async function main() {
  if (process.versions.node.split(".")[0] !== "24") fail("CI_NODE_VERSION");
  if (
    [
      ".env",
      ".env.local",
      ".env.production",
      ".env.production.local",
      ".env.test",
      ".env.test.local",
    ].some((f) => existsSync(f))
  )
    fail("CI_ENV_FILE_FORBIDDEN");
  const raw = readFileSync("ci/company-acceptance/approval.json", "utf8");
  const a = requireCiApproval(raw, process.env);
  const url = requireCiDatabaseUrl(process.env.CI_DATABASE_URL, a);
  if (!process.env.GITHUB_TOKEN) fail("CI_REPOSITORY_AUTH_REQUIRED");
  const response = await fetch("https://api.github.com/repos/" + a.repository, {
    headers: {
      authorization: "Bearer " + process.env.GITHUB_TOKEN,
      accept: "application/vnd.github+json",
    },
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok || Number(response.headers.get("content-length") ?? "0") > 65536)
    fail("CI_REPOSITORY_DENIED");
  const text = await response.text();
  if (Buffer.byteLength(text) > 65536) fail("CI_REPOSITORY_DENIED");
  verifyRepositoryMetadata(JSON.parse(text), a);
  delete process.env.GITHUB_TOKEN;
  const networkAttempts = blockProviderNetwork();
  const db = await connectCiDatabase(url, a);
  try {
    const { verifyDatabase, ciStores } = await import("./database");
    const { runAcceptance, qualityReport } = await import("./acceptance");
    await verifyDatabase(db, a, checksum(raw));
    const result = await runAcceptance({
      approval: a,
      approvalHash: checksum(raw),
      invocation: {
        runId: process.env.GITHUB_RUN_ID!,
        sha: process.env.GITHUB_SHA!,
        event: process.env.GITHUB_EVENT_NAME as "schedule" | "workflow_dispatch",
        at: new Date().toISOString(),
      },
      ...ciStores(db, a),
      interrupt: () => {
        if (networkAttempts()) fail("CI_NETWORK_ATTEMPTED");
        console.log(
          "CI_EXPECTED_INTERRUPTION: durable claim recorded; next scheduled run must recover.",
        );
        process.exit(73);
      },
    });
    if (networkAttempts()) fail("CI_NETWORK_ATTEMPTED");
    const report = qualityReport(result.state, result.audit, a, true);
    mkdirSync("outputs/company-ci", { recursive: true });
    writeFileSync("outputs/company-ci/QUALITY_RELIABILITY_REPORT.md", report);
    writeFileSync("outputs/company-ci/results.json", JSON.stringify(result, null, 2));
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
    console.log("CI_ACCEPTANCE_" + result.audit.phase);
  } finally {
    await db.$disconnect();
  }
}
void main().catch((error: unknown) => {
  // Never serialize Prisma errors, URLs, process env, SQL parameters or arbitrary exception text.
  console.error(
    error instanceof Error && /^CI_[A-Z_]{1,60}$/.test(error.message)
      ? error.message
      : "CI_ACCEPTANCE_FAILED_CLOSED",
  );
  process.exitCode = 1;
});
