import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const workforceSources = [
  "src/app/api/sales-agent/dashboard/route.ts",
  "src/server/agent-workforce/dashboard/service.ts",
  "src/features/agent-workforce/dashboard/dashboard-client.tsx",
  "src/features/agent-workforce/dashboard/integration-controls.tsx",
] as const;

/** Hash source bytes at build time, independently of Vercel's commit label/cache. */
export function createWorkforceBuildInfo(root: string, declaredCommit?: string) {
  const packageName = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).name;
  if (packageName !== "primelis-outbound-intelligence")
    throw new Error("WORKFORCE_BUILD_ROOT_MISMATCH");
  const sha = (value: string | undefined) =>
    value && /^[a-f0-9]{40}$/i.test(value) ? value.toLowerCase() : null;
  let checkoutCommit: string | null = null;
  try {
    checkoutCommit = sha(
      execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim(),
    );
  } catch {
    // Vercel source archives may have no Git metadata. Source hashes still apply.
  }
  const gitCommit = sha(declaredCommit) ?? checkoutCommit;
  if (sha(declaredCommit) && checkoutCommit && gitCommit !== checkoutCommit)
    throw new Error("WORKFORCE_BUILD_COMMIT_MISMATCH");
  const sources = Object.fromEntries(
    workforceSources.map((path) => [
      path,
      createHash("sha256")
        .update(readFileSync(resolve(root, path)))
        .digest("hex"),
    ]),
  );
  return {
    schema: 1 as const,
    gitCommit,
    checkoutCommit,
    sourceFingerprint: createHash("sha256").update(JSON.stringify(sources)).digest("hex"),
    sources,
  };
}
