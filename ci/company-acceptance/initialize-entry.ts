// Build separately; never imported by the worker, application, or workflow.
import { initializeReviewedPhase } from "./initialize";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

async function main() {
  const phase = process.argv[2];
  if (phase !== "00" && phase !== "01" && phase !== "02")
    throw new Error("CI_INITIALIZATION_PHASE_REQUIRED");
  let approvalRaw: string | undefined;
  if (phase === "02") {
    // No candidate/template fallback or caller-controlled SQL/manifest path.
    const path = resolve("ci/company-acceptance/approval.json");
    const stat = statSync(path);
    if (!stat.isFile() || stat.size > 8192) throw new Error("CI_PHASE02_MANIFEST_INVALID");
    approvalRaw = readFileSync(path, "utf8");
  }
  return initializeReviewedPhase({
    phase,
    approvalRaw,
    approvalSha256: process.env.CI_APPROVAL_SHA256,
    psqlPath: process.env.CI_NEON_PSQL_PATH ?? "",
    caPath: process.env.CI_NEON_CA_PATH ?? "",
    password: process.env.CI_NEON_ADMIN_PASSWORD ?? "",
    verifiedOrganization: process.env.CI_NEON_VERIFIED_ORG ?? "",
    verifiedProject: process.env.CI_NEON_VERIFIED_PROJECT ?? "",
    verifiedBranch: process.env.CI_NEON_VERIFIED_BRANCH ?? "",
    executionApproval: process.env.CI_NEON_EXECUTION_APPROVAL ?? "",
  });
}
void main()
  .then(
    (result) => console.log(JSON.stringify(result)),
    (error: unknown) => {
      console.error(
        error instanceof Error && /^CI_[A-Z_0-9]+$/.test(error.message)
          ? error.message
          : "CI_INITIALIZATION_FAILED_CLOSED",
      );
      process.exitCode = 1;
    },
  )
  .finally(() => {
    delete process.env.CI_NEON_ADMIN_PASSWORD;
  });
