import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// Supplement Gitleaks with high-confidence provider shapes, including low-entropy test keys.
// No entropy threshold, test-file exclusion, placeholder allowlist or validity/network check.
// GitHub's complete server-side detector is not available offline; this is not a replica.
const patterns = [
  ["hubspot-private-app-shape", /\bpat-(?:na|eu)\d+-[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}\b/gi],
  ["github-token-shape", /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{70,})\b/g],
  ["openai-project-key-shape", /\bsk-proj-[A-Za-z0-9_-]{40,}/g],
  ["anthropic-key-shape", /\bsk-ant-[A-Za-z0-9_-]{40,}/g],
  ["supabase-secret-shape", /\bsb_secret_[A-Za-z0-9_-]{20,}/g],
  ["aws-access-key-shape", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ["google-api-key-shape", /\bAIza[A-Za-z0-9_-]{35}\b/g],
  ["private-key-block-shape", /-----BEGIN ((?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY)-----\r?\n[A-Za-z0-9+/=\r\n]{64,}-----END \1-----/g],
];

/** Return locations and rule IDs only. Never return a matched value, snippet or raw exception. */
export function scanText(text) {
  const findings = [];
  for (const [rule, pattern] of patterns) {
    for (const match of text.matchAll(pattern))
      findings.push({ rule, line: text.slice(0, match.index).split("\n").length });
  }
  return findings;
}

export function scanHistory(revision = "HEAD") {
  if (!/^(?:HEAD|[a-f0-9]{40})$/.test(revision)) throw new Error("INVALID_REVISION");
  const git = args => execFileSync("git", args, { maxBuffer: 128 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
  const commits = git(["rev-list", revision]).toString().trim().split("\n");
  const objects = git(["rev-list", "--objects", revision]).toString().trim().split("\n")
    .map(line => ({ oid: line.slice(0, 40), path: line.slice(41) }));
  const batch = execFileSync("git", ["cat-file", "--batch"], {
    input: objects.map(value => value.oid).join("\n") + "\n", maxBuffer: 128 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let offset = 0;
  const findings = [];
  for (const object of objects) {
    const end = batch.indexOf(10, offset);
    const [oid, type, length] = batch.subarray(offset, end).toString().split(" ");
    const size = Number(length);
    if (oid !== object.oid || !Number.isSafeInteger(size) || size < 0) throw new Error("INVALID_GIT_OBJECT");
    const content = batch.subarray(end + 1, end + 1 + size);
    for (const finding of scanText(content.toString("utf8"))) findings.push({ oid, path: object.path, type, ...finding });
    offset = end + size + 2;
  }
  if (offset !== batch.length) throw new Error("INVALID_GIT_BATCH");
  return { commitCount: commits.length, objectCount: objects.length, findings };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length > 3) throw new Error("INVALID_ARGUMENTS");
    const result = scanHistory(process.argv[2] ?? "HEAD");
    console.log(JSON.stringify(result));
    process.exitCode = result.findings.length ? 1 : 0;
  } catch {
    console.error("PUBLICATION_SCAN_FAILED: no object content logged");
    process.exitCode = 2;
  }
}
