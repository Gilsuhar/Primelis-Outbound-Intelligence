/** LOCAL source staging only. Never initializes Git, reads env files, publishes or executes the worker. */
import { readFileSync, writeFileSync, mkdirSync, lstatSync } from "node:fs";
import { resolve, join, dirname, relative, sep } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const built = spawnSync(process.execPath, ["scripts/build-company-ci.mjs"], { cwd: root, stdio: "pipe", windowsHide: true });
if (built.status !== 0) throw new Error("CI_LOCAL_PACKAGE_BUILD_FAILED");
const inputs = JSON.parse(readFileSync("outputs/company-ci/build-inputs.json", "utf8"));
if (!Array.isArray(inputs) || !inputs.length || inputs.length > 500) throw new Error("CI_LOCAL_PACKAGE_INPUTS_INVALID");
const files = [...new Set([...inputs, "package.json", "pnpm-lock.yaml", "tsconfig.json", "prisma/schema.prisma", "scripts/build-company-ci.mjs", "ci/company-acceptance/approval.candidate.json", "ci/company-acceptance/workflow.template.yml"])].sort();
const candidate = JSON.parse(readFileSync("ci/company-acceptance/approval.candidate.json", "utf8"));
if (candidate.enabled !== false || candidate.repository !== "Gilsuhar/agentworkforce-ci-acceptance" || candidate.repositoryId !== "1426200737" || candidate.database.projectId !== "snowy-art-90934943" || candidate.database.branchId !== "br-empty-breeze-b51o9q71" || candidate.database.name !== "ci_acceptance_pilot") throw new Error("CI_LOCAL_PACKAGE_BINDING_FAILED");
const target = resolve("outputs/ci-publication", randomUUID());
mkdirSync(target, { recursive: true });
const manifest = [];
for (const file of files) {
  if (typeof file !== "string" || file.includes("\\") || file.split("/").some(p => p === ".." || p.startsWith(".")) || !/^(src\/|ci\/company-acceptance\/|scripts\/build-company-ci\.mjs$|prisma\/schema\.prisma$|package\.json$|pnpm-lock\.yaml$|tsconfig\.json$)/.test(file) || !/\.(ts|tsx|mjs|json|yml|yaml|prisma)$/.test(file) || /(?:secret|credential|approval\.json)/i.test(file)) throw new Error("CI_LOCAL_PACKAGE_PATH_DENIED");
  const source = resolve(root, file);
  if (relative(root, source).startsWith(".." + sep)) throw new Error("CI_LOCAL_PACKAGE_PATH_DENIED");
  for (let path = source; path !== root; path = dirname(path))
    if (lstatSync(path).isSymbolicLink()) throw new Error("CI_LOCAL_PACKAGE_LINK_DENIED");
  const bytes = readFileSync(source), content = bytes.toString("utf8");
  // Refuse, never silently redact executable source. Fictional literals may also require review.
  if (/-----BEGIN (?:[A-Z ]*PRIVATE KEY|OPENSSH)|\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}|\b(?:ghp_|github_pat_|AKIA)[A-Za-z0-9_]{16,}|(?:postgres(?:ql)?|https?):\/\/[^\s/:'"`]+:[^\s/@'"`]+@/i.test(content)) throw new Error("CI_LOCAL_PACKAGE_LITERAL_REVIEW_REQUIRED");
  const destination = join(target, file);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, bytes, { flag: "wx" });
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (createHash("sha256").update(readFileSync(destination)).digest("hex") !== hash) throw new Error("CI_LOCAL_PACKAGE_HASH_FAILED");
  manifest.push({ path: file, bytes: bytes.length, sha256: hash });
}
writeFileSync(join(target, "PUBLICATION_REVIEW.json"), JSON.stringify({ version: 1, status: "LOCAL_ONLY_DISABLED", repository: candidate.repository, repositoryId: candidate.repositoryId, fileCount: manifest.length, files: manifest, limitations: ["Credential-pattern screening is not a guarantee; review all staged files before publication.", "No final approval manifest or active workflow; no source publication or credentials included.", "Not a database backup or full application backup."] }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ status: "LOCAL_ONLY_DISABLED", directory: target, files: manifest.length, verified: true }));
