// Local publication diagnostics only. No I/O, authentication, or retry on import.
// Unknown stderr is omitted, rather than trusting regexes to find every secret.
const stages = new Set(["INPUT", "LOCAL_INVENTORY", "REMOTE_PREFLIGHT", "FINAL_RECHECK",
  "PUSH", "VERIFY_REMOTE_REFS", "VERIFY_PUBLISHED_COMMIT", "POST_ISOLATION"]);
const operations = new Set(["push", "ls-remote", "rev-parse", "status", "remote", "ls-tree", "show"]);
const spawnCodes = new Set(["ENOENT", "EACCES", "EPERM", "ETIMEDOUT", "ENOBUFS", "ECONNRESET"]);
const signatures = [
  [/authentication failed|could not read (?:username|password)|invalid username or (?:password|token)/i, "AUTHENTICATION", "Git reported authentication failure or unavailable interactive credentials."],
  [/permission .* denied|write access .* not granted|access denied|requested URL returned error: 403|GH013|protected branch|repository rule violations/i, "PERMISSION", "Git reported permission denial or a repository rule rejection."],
  [/repository not found|requested URL returned error: 404/i, "REPOSITORY_ACCESS", "Git reported repository not found or inaccessible."],
  [/could not resolve host|failed to connect|connection (?:reset|timed out|refused)|network is unreachable|SSL certificate problem|schannel|TLS handshake|unexpected disconnect|remote end hung up/i, "TRANSPORT", "Git reported a network, TLS, or connection failure."],
  [/src refspec .* does not match any|not a valid (?:object|ref)|invalid refspec/i, "LOCAL_REFSPEC", "Git reported an invalid or missing source object/refspec."],
  [/non-fast-forward|fetch first|failed to push some refs/i, "REF_UPDATE", "Git reported a rejected or unsuccessful ref update."],
  [/cannot spawn .*pre-push|cannot run .*pre-push|hook declined/i, "HOOK", "Git reported a hook execution failure or rejection."],
  [/missing config value|invalid config|bogus format in GIT_CONFIG|key does not contain a section|unable to read config/i, "LOCAL_CONFIG", "Git reported invalid or unreadable configuration."],
  [/HTTP (?:code = )?5\d\d|requested URL returned error: 5\d\d/i, "REMOTE_SERVER", "Git reported a remote HTTP server error."],
];
// Preserve independently observed markers, not an inferred root cause.
// Multiple markers on the same line must survive without retaining variable text.
const markerSignatures = [
  [/\bHTTP(?:\/\d(?:\.\d)?)?(?:\s+(?:code|status)(?:\s+code)?\s*[:=]?)?\s+403\b|requested URL returned error:\s*403\b/i,
    "HTTP_403", "Git reported HTTP 403."],
  [/\bwrite access\b[^\r\n]*\bnot granted\b|\bpermission to\b[^\r\n]*\bdenied\b/i,
    "WRITE_ACCESS_DENIED", "Git explicitly reported repository write-access denial."],
  [/\bGH006\b/i, "GH006", "GitHub reported GH006 (protected-branch rejection)."],
  [/\bGH013\b/i, "GH013", "GitHub reported GH013 (repository-rule rejection)."],
];

function redactKnown(text, secrets) {
  let safe = text;
  for (const secret of secrets) {
    if (typeof secret !== "string" || !secret) continue;
    for (const variant of [secret, encodeURIComponent(secret),
      Buffer.from(secret).toString("base64"),
      Buffer.from("x-access-token:" + secret).toString("base64")]) {
      safe = safe.split(variant).join("[REDACTED]");
    }
  }
  return safe
    .replace(/-----BEGIN [\s\S]*?-----END [^\n]+/g, "[PRIVATE KEY REDACTED]")
    .replace(/(?:proxy-)?authorization\s*[:=][^\r\n]*/gi, "[AUTHORIZATION REDACTED]")
    .replace(/\b(?:basic|bearer)\s+\S+/gi, "[AUTHORIZATION REDACTED]")
    .replace(/\b(?:https?|postgres(?:ql)?):\/\/\S+/gi, "[URL REDACTED]")
    .replace(/\b(?:github_pat_|gh[pousr]_|sk-)[A-Za-z0-9_-]+/g, "[TOKEN REDACTED]")
    .replace(/\b(?:password|token|secret|api[_-]?key)\s*[:=]\s*\S+/gi, "[SECRET REDACTED]");
}

function gitFailure(result, { stage, operation, secrets = [] } = {}) {
  const raw = typeof result?.stderr === "string" ? result.stderr :
    Buffer.isBuffer(result?.stderr) ? result.stderr.toString("utf8") : "";
  // Process bounded captured output; redact before line classification/storage.
  // No variable text from stderr is ever persisted, including unknown fragments.
  const safe = redactKnown(raw.slice(0, 2_000_000), secrets);
  const categories = [], markers = [], lines = [];
  for (const line of safe.split(/\r?\n/).filter(Boolean).slice(0, 80)) {
    const match = signatures.find(([pattern]) => pattern.test(line));
    const specific = markerSignatures.filter(([pattern]) => pattern.test(line));
    if (match && !categories.includes(match[1])) categories.push(match[1]);
    for (const [, marker] of specific) if (!markers.includes(marker)) markers.push(marker);
    const summaries = specific.map(([, , summary]) => summary);
    if (match) summaries.push(match[2]);
    if (!summaries.length) summaries.push("[Unrecognized stderr omitted]");
    for (const text of summaries) if (!lines.includes(text) && lines.length < 8) lines.push(text);
  }
  return {
    stage: stages.has(stage) ? stage : "UNKNOWN",
    operation: operations.has(operation) ? operation : "UNKNOWN",
    exitCode: Number.isInteger(result?.status) && result.status >= 0 && result.status <= 255 ? result.status : null,
    spawnCode: spawnCodes.has(result?.error?.code) ? result.error.code : null,
    signal: ["SIGTERM", "SIGKILL", "SIGINT"].includes(result?.signal) ? result.signal : null,
    categories,
    markers,
    sanitizedStderr: lines.length ? lines.join("\n") : "[No stderr captured]",
    stderrPresent: raw.length > 0,
    stderrTruncated: raw.length > 2_000_000 || safe.split(/\r?\n/).length > 80,
  };
}

function verifyRemotePublication({ readRefs, verifyInventory, verifyIsolation, expectedCommit }) {
  const unknown = reason => ({ publicationStatus: "UNKNOWN", reason });
  if (!/^[a-f0-9]{40}$/.test(expectedCommit ?? "")) return unknown("INVALID_EXPECTED_COMMIT");
  let text;
  try {
    const output = readRefs();
    if (typeof output !== "string" && !Buffer.isBuffer(output)) return unknown("MALFORMED_REMOTE_REFS");
    text = output.toString();
  } catch { return unknown("REMOTE_REF_READ_FAILED"); }
  if (text.length > 20_000) return unknown("MALFORMED_REMOTE_REFS");
  if (text === "") {
    try { if (verifyIsolation() !== true) return unknown("POST_ISOLATION_FAILED"); }
    catch { return unknown("POST_ISOLATION_FAILED"); }
    // Absence means no advertised refs in the verified repository, not proof
    // that no unreachable Git objects were ever uploaded.
    return { publicationStatus: "VERIFIED_ABSENT", reason: "REMOTE_HAS_NO_ADVERTISED_REFS" };
  }
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length || new Set(lines).size !== lines.length ||
      !lines.every(line => line === expectedCommit + "\tHEAD" || line === expectedCommit + "\trefs/heads/main") ||
      !lines.includes(expectedCommit + "\trefs/heads/main")) return unknown("UNEXPECTED_REMOTE_REFS");
  try { if (verifyInventory() !== true) return unknown("REMOTE_INVENTORY_UNVERIFIED"); }
  catch { return unknown("REMOTE_INVENTORY_UNVERIFIED"); }
  try { if (verifyIsolation() !== true) return unknown("POST_ISOLATION_FAILED"); }
  catch { return unknown("POST_ISOLATION_FAILED"); }
  return { publicationStatus: "VERIFIED_PUBLISHED", reason: "EXACT_COMMIT_INVENTORY_AND_ISOLATION_VERIFIED" };
}

function finishPublication({ push, ...verification }) {
  let pushFailed = false;
  if (push) {
    try { push(); } catch { pushFailed = true; }
  }
  // Always one read-only verification, even if the one push threw or timed out.
  // Never repeat push, infer absence from an error, or overwrite its diagnostic.
  return { pushFailed, ...verifyRemotePublication(verification) };
}

module.exports = { gitFailure, verifyRemotePublication, finishPublication };
