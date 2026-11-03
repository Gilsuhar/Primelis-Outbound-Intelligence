/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { gitFailure, verifyRemotePublication, finishPublication } = require("./CiPublicationDiagnostics.cjs");
const hash = "a".repeat(40);
const options = { stage: "PUSH", operation: "push" };
for (const [message, marker] of [
  ["fatal: unable to access 'https://example.invalid/': The requested URL returned error: 403", "HTTP_403"],
  ["error: RPC failed; HTTP 403", "HTTP_403"],
  ["HTTP/2 403", "HTTP_403"],
  ["HTTP code = 403", "HTTP_403"],
  ["remote: Write access to repository not granted.", "WRITE_ACCESS_DENIED"],
  ["remote: Permission to fictional-owner/repo.git denied to fictional-user.", "WRITE_ACCESS_DENIED"],
  ["remote: error: GH006: Protected branch update failed for refs/heads/main.", "GH006"],
  ["remote: error: GH013: Repository rule violations found for refs/heads/main.", "GH013"],
]) test("retains distinct marker " + marker + ": " + message.split(":")[0], () => {
  const d = gitFailure({ status: 128, stderr: message }, options);
  assert.deepEqual(d.markers, [marker]);
  assert(!JSON.stringify(d).includes("fictional-owner"));
  assert(!JSON.stringify(d).includes("fictional-user"));
});
test("retains all independent markers on one line without precedence loss", () => {
  const d = gitFailure({ status: 128, stderr: "HTTP 403; Write access to repository not granted; GH006; GH013" }, options);
  assert.deepEqual(d.markers, ["HTTP_403", "WRITE_ACCESS_DENIED", "GH006", "GH013"]);
});
test("generic denial, missing diagnostics and lookalikes do not invent markers", () => {
  for (const message of ["Access denied", "protected branch", "GH0069 GH0130 HTTP 4030", "", "repository rule violations"]) {
    assert.deepEqual(gitFailure({ status: 128, stderr: message }, options).markers, []);
  }
});
test("marker-like credentials, headers and URLs are redacted before classification", () => {
  const secrets = ["sensitive GH006 value"];
  const stderr = [
    secrets[0], "Authorization: Bearer GH013",
    "https://user:password@example.invalid/GH006?token=GH013",
    "password=GH006", "token=GH013",
    "github_pat_fictional_GH006_value",
  ].join("\n");
  const d = gitFailure({ status: 128, stderr }, { ...options, secrets });
  assert.deepEqual(d.markers, []);
  assert(!JSON.stringify(d).includes("sensitive"));
  assert(!JSON.stringify(d).includes("example.invalid"));
});
test("precise markers survive adjacent redaction without leaking private data", () => {
  const secret = "fictional-sensitive-marker-test";
  const d = gitFailure({ status: 128, stderr: [
    "HTTP 403 https://user:" + secret + "@example.invalid/?token=" + secret,
    "remote: GH006: private-company-data",
    "remote: GH013: private-rule-details",
    "Write access to repository not granted. Authorization: Bearer " + secret,
  ].join("\n") }, { ...options, secrets: [secret] });
  assert.deepEqual(d.markers, ["HTTP_403", "GH006", "GH013", "WRITE_ACCESS_DENIED"]);
  for (const value of [secret, "private-company-data", "private-rule-details", "example.invalid"])
    assert(!JSON.stringify(d).includes(value));
});
for (const [name, message, category] of [
  ["authentication", "fatal: Authentication failed for 'https://example.invalid/'", "AUTHENTICATION"],
  ["permission", "remote: Write access to repository not granted.", "PERMISSION"],
  ["transport", "fatal: Could not resolve host: example.invalid", "TRANSPORT"],
  ["TLS", "fatal: SSL certificate problem: expired certificate", "TRANSPORT"],
  ["refspec", "error: src refspec fictional does not match any", "LOCAL_REFSPEC"],
  ["config", "error: missing config value GIT_CONFIG_VALUE_0", "LOCAL_CONFIG"],
]) test(name + " captures exit, stage and safe category", () => {
  const d = gitFailure({ status: 128, stderr: message }, options);
  assert.equal(d.exitCode, 128); assert.equal(d.stage, "PUSH"); assert.equal(d.operation, "push");
  assert.deepEqual(d.categories, [category]); assert(d.sanitizedStderr.length > 0);
});
test("secret variants, headers, URLs, arbitrary text and private keys never survive", () => {
  const secret = "fictional-sensitive-credential:123";
  const payloads = [secret, encodeURIComponent(secret), Buffer.from(secret).toString("base64"),
    Buffer.from("x-access-token:" + secret).toString("base64"),
    "github_pat_FICTIONAL_not_a_real_token", "Authorization: Basic arbitrary-value",
    "Bearer arbitrary-value", "https://user:fictional-password@example.invalid/?token=fictional-query",
    "-----BEGIN PRIVATE KEY-----\nfictional-key\n-----END PRIVATE KEY-----",
    "password=fictional-password", "unrecognizable-private-data"];
  for (const payload of payloads) {
    const d = gitFailure({ status: 128, stderr: "fatal: Authentication failed " + payload }, { ...options, secrets: [secret] });
    const stored = JSON.stringify(d);
    for (const value of [secret, payload, "fictional-password", "fictional-key", "arbitrary-value", "unrecognizable-private-data"])
      assert(!stored.includes(value));
  }
});
test("missing diagnostics preserve nulls without manufacturing a reason", () => {
  const d = gitFailure({}, options);
  assert.equal(d.exitCode, null); assert.equal(d.spawnCode, null);
  assert.equal(d.stderrPresent, false); assert.deepEqual(d.categories, []);
  assert.equal(d.sanitizedStderr, "[No stderr captured]");
});
test("spawn error message is never retained", () => {
  const d = gitFailure({ status: null, error: { code: "ETIMEDOUT", message: "private-value" }, signal: "SIGTERM" }, options);
  assert.equal(d.spawnCode, "ETIMEDOUT"); assert.equal(d.signal, "SIGTERM");
  assert(!JSON.stringify(d).includes("private-value"));
});
test("untrusted metadata and unknown stderr are suppressed", () => {
  const d = gitFailure({ status: "private", error: { code: "private" }, stderr: "private" },
    { stage: "private", operation: "private" });
  assert.equal(d.stage, "UNKNOWN"); assert.equal(d.operation, "UNKNOWN");
  assert.equal(d.spawnCode, null); assert(!JSON.stringify(d).includes("private"));
});
test("output is bounded and Buffer stderr supported", () => {
  const d = gitFailure({ status: 1, stderr: Buffer.from(("fatal: Authentication failed hidden-value\n").repeat(100)) }, options);
  assert(d.stderrTruncated); assert(d.sanitizedStderr.length < 1000); assert(!d.sanitizedStderr.includes("hidden-value"));
});
const valid = () => ({
  readRefs: () => hash + "\tHEAD\n" + hash + "\trefs/heads/main\n",
  verifyInventory: () => true, verifyIsolation: () => true, expectedCommit: hash,
});
test("exact commit plus inventory and isolation is verified published", () => {
  assert.equal(verifyRemotePublication(valid()).publicationStatus, "VERIFIED_PUBLISHED");
});
test("successful empty refs plus isolation is verified absent", () => {
  assert.equal(verifyRemotePublication({ ...valid(), readRefs: () => "" }).publicationStatus, "VERIFIED_ABSENT");
});
for (const [name, overrides] of [
  ["ref read failure", { readRefs: () => { throw Error("private"); } }],
  ["missing response", { readRefs: () => undefined }],
  ["whitespace response", { readRefs: () => " \n" }],
  ["wrong commit", { readRefs: () => "b".repeat(40) + "\trefs/heads/main\n" }],
  ["unexpected branch", { readRefs: () => hash + "\trefs/heads/other\n" }],
  ["duplicate refs", { readRefs: () => (hash + "\trefs/heads/main\n").repeat(2) }],
  ["unverified inventory", { verifyInventory: () => false }],
  ["inventory exception", { verifyInventory: () => { throw Error("private"); } }],
  ["isolation failure", { verifyIsolation: () => false }],
  ["empty refs but isolation failure", { readRefs: () => "", verifyIsolation: () => { throw Error("private"); } }],
  ["invalid expected commit", { expectedCommit: "private" }],
]) test(name + " stays unknown", () => {
  const result = verifyRemotePublication({ ...valid(), ...overrides });
  assert.equal(result.publicationStatus, "UNKNOWN"); assert(!JSON.stringify(result).includes("private"));
});
for (const [name, readRefs, state] of [
  ["acknowledgment lost but commit verified", valid().readRefs, "VERIFIED_PUBLISHED"],
  ["rejected and empty", () => "", "VERIFIED_ABSENT"],
  ["push and read transport failed", () => { throw Error("offline"); }, "UNKNOWN"],
]) test("failed push: " + name + "; no retry", () => {
  let pushes = 0, reads = 0;
  const original = gitFailure({ status: 128, stderr: "fatal: Authentication failed" }, options);
  const snapshot = JSON.stringify(original);
  const result = finishPublication({ ...valid(), push: () => { pushes++; throw Error("offline"); },
    readRefs: () => { reads++; return readRefs(); } });
  assert.equal(pushes, 1); assert.equal(reads, 1); assert.equal(result.pushFailed, true);
  assert.equal(result.publicationStatus, state); assert.equal(JSON.stringify(original), snapshot);
});
test("already published verification does not push", () => {
  assert.equal(finishPublication(valid()).publicationStatus, "VERIFIED_PUBLISHED");
});
test("successful push is followed by read-only verification", () => {
  const calls = [];
  const result = finishPublication({ ...valid(), push: () => calls.push("push"),
    readRefs: () => { calls.push("read"); return valid().readRefs(); } });
  assert.deepEqual(calls, ["push", "read"]); assert.equal(result.pushFailed, false);
  assert.equal(result.publicationStatus, "VERIFIED_PUBLISHED");
});
