/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "CiPilotPublisher.cjs"), "utf8");
const hash = "db48e581750848fe68956aaf47c7b6a5a9fb4b60";
const fictionalToken = "github_pat_FICTIONAL_OFFLINE_TEST_NOT_REAL_123456";
function exercise({ pushResult = { status: 128, stderr: "fatal: Authentication failed" },
  remote = "", already = false, denyPreflight = false, inventoryFails = false } = {}) {
  const calls = [], writes = [];
  const mockFs = {
    existsSync: () => false,
    readFileSync: file => file === 0 ? fictionalToken :
      String(file).endsWith("operator-isolation.json") ?
        JSON.stringify({ kind: "OPERATOR_CONFIRMED_NO_APPS_OR_EXTERNAL_DEPLOYMENTS", confirmedAt: new Date().toISOString() }) : Buffer.from("{}"),
    writeFileSync: file => writes.push(path.basename(file)),
  };
  let reads = 0;
  const req = name => {
    if (name === "node:fs") return mockFs;
    if (name === "node:child_process") return { spawnSync: (executable, args) => {
      assert(executable.endsWith("git.exe"), "No actual gh/network execution permitted in tests");
      const operation = args[2];
      calls.push(operation);
      if (operation === "push") {
        assert.deepEqual(Array.from(args.slice(3)), ["--porcelain", "origin", hash + ":refs/heads/main"]);
        if (pushResult instanceof Error) throw pushResult;
        return pushResult;
      }
      assert.equal(operation, "ls-remote");
      reads++;
      if (already) return { status: 0, stdout: Buffer.from(hash + "\trefs/heads/main\n") };
      if (reads <= 2) return { status: 0, stdout: Buffer.from("") };
      if (remote instanceof Error) return { status: 128, stderr: remote.message };
      return { status: 0, stdout: Buffer.from(remote) };
    } };
    if (name === "./CiPublicationDiagnostics.cjs") return require(name);
    return require(name);
  };
  const context = { require: req, module: { exports: {} }, __dirname, Buffer,
    process: { env: {}, stdin: { isTTY: false } }, console,
    already, denyPreflight, inventoryFails, calls };
  vm.createContext(context);
  vm.runInContext(source + `
    inventory=()=>({fileCount:66,files:[]});
    api=endpoint=>{
      if(endpoint==='user')return {id:79252537,login:'Gilsuhar'};
      if(endpoint.includes('/branches'))return already?[{name:'main',commit:{sha:commit}}]:[];
      throw Error('Unexpected API');
    };
    isolation=()=>{calls.push('isolation');if(denyPreflight)throw Error('PUBLICATION_ACTIONS_NOT_DISABLED');return {private:true,actionsEnabled:false};};
    verifyPublishedInventory=()=>{calls.push('inventory');if(inventoryFails)throw Error('PUBLICATION_REMOTE_BLOB_HASH_MISMATCH');report.inventoryVerified=true;};
    module.exports.run=main;
    module.exports.state=()=>({report,step,pushAttempted});
  `, context);
  let error;
  try { context.module.exports.run(); } catch (e) { error = e.message; }
  return { ...context.module.exports.state(), error, calls, writes };
}
for (const [name, stderr, category] of [
  ["authentication", "fatal: Authentication failed " + fictionalToken, "AUTHENTICATION"],
  ["permission", "remote: Write access to repository not granted", "PERMISSION"],
  ["transport", "fatal: Connection reset by peer", "TRANSPORT"],
]) test("publisher retains " + name + " failure and verifies absent without retry", () => {
  const r = exercise({ pushResult: { status: 128, stderr } });
  assert.equal(r.error, "PUBLICATION_GIT_FAILED");
  assert.equal(r.step, "PUSH"); assert.equal(r.report.pushFailure.exitCode, 128);
  assert.equal(r.report.pushFailure.stage, "PUSH");
  assert.equal(r.report.pushFailure.categories[0], category);
  assert.equal(r.report.publicationStatus, "VERIFIED_ABSENT");
  assert.equal(r.calls.filter(x => x === "push").length, 1);
  assert.deepEqual(r.writes, ["push-started.json"]);
  assert(!JSON.stringify(r).includes(fictionalToken));
});
test("failed push and failed authenticated read remain unknown; original failure retained", () => {
  const r = exercise({ remote: Error("fatal: Could not resolve host: private-host") });
  assert.equal(r.report.publicationStatus, "UNKNOWN");
  assert.equal(r.report.pushFailure.categories[0], "AUTHENTICATION");
  assert.equal(r.report.gitFailures.length, 2);
  assert.equal(r.report.gitFailures[1].operation, "ls-remote");
  assert(!JSON.stringify(r).includes("private-host"));
  assert.equal(r.calls.filter(x => x === "push").length, 1);
});
test("lost push acknowledgment can verify published while preserving failed push status", () => {
  const r = exercise({ remote: hash + "\trefs/heads/main\n" });
  assert.equal(r.error, "PUBLICATION_GIT_FAILED");
  assert.equal(r.report.publicationStatus, "VERIFIED_PUBLISHED");
  assert.equal(r.report.inventoryVerified, true);
  assert(r.report.after); assert.equal(r.calls.filter(x => x === "push").length, 1);
});
test("spawn exception captures only safe code, then verifies remote", () => {
  const error = Object.assign(Error("fictional-private-process-data"), { code: "ENOENT" });
  const r = exercise({ pushResult: error });
  assert.equal(r.report.pushFailure.spawnCode, "ENOENT");
  assert.equal(r.report.pushFailure.exitCode, null);
  assert.equal(r.report.publicationStatus, "VERIFIED_ABSENT");
  assert(!JSON.stringify(r).includes("fictional-private-process-data"));
});
test("missing stderr stays explicit, without invented cause", () => {
  const r = exercise({ pushResult: { status: 1 } });
  assert.equal(r.report.pushFailure.exitCode, 1);
  assert.equal(r.report.pushFailure.stderrPresent, false);
  assert.equal(r.report.publicationStatus, "VERIFIED_ABSENT");
});
test("success still requires exact inventory and post isolation", () => {
  const r = exercise({ pushResult: { status: 0, stdout: Buffer.from("") }, remote: hash + "\trefs/heads/main\n" });
  assert.equal(r.error, undefined);
  assert.equal(r.report.status, "PRIVATE_SOURCE_PUBLICATION_VERIFIED");
  assert.equal(r.report.publicationStatus, "VERIFIED_PUBLISHED");
  assert.deepEqual(r.calls.slice(-3), ["ls-remote", "inventory", "isolation"]);
});
test("successful command but no advertised refs cannot claim publication", () => {
  const r = exercise({ pushResult: { status: 0, stdout: Buffer.from("") } });
  assert.equal(r.error, "PUBLICATION_REMOTE_UNVERIFIED");
  assert.equal(r.report.publicationStatus, "VERIFIED_ABSENT");
});
test("inventory mismatch remains unknown and fails closed", () => {
  const r = exercise({ remote: hash + "\trefs/heads/main\n", inventoryFails: true });
  assert.equal(r.report.publicationStatus, "UNKNOWN");
  assert.equal(r.error, "PUBLICATION_GIT_FAILED");
});
test("already published expected commit is verified without another push", () => {
  const r = exercise({ already: true });
  assert.equal(r.report.publicationStatus, "VERIFIED_PUBLISHED");
  assert.equal(r.pushAttempted, false); assert.deepEqual(r.writes, []);
  assert.equal(r.calls.filter(x => x === "push").length, 0);
});
test("failed preflight never pushes or invokes post-push reads", () => {
  const r = exercise({ denyPreflight: true });
  assert.equal(r.error, "PUBLICATION_ACTIONS_NOT_DISABLED");
  assert.equal(r.report.publicationStatus, "UNKNOWN");
  assert.equal(r.pushAttempted, false); assert.deepEqual(r.writes, []);
  assert.equal(r.calls.filter(x => x === "ls-remote").length, 0);
});
for (const [stderr, marker] of [
  ["fatal: The requested URL returned error: 403", "HTTP_403"],
  ["remote: Write access to repository not granted", "WRITE_ACCESS_DENIED"],
  ["remote: error: GH006: Protected branch update failed", "GH006"],
  ["remote: error: GH013: Repository rule violations found", "GH013"],
]) test("publisher preserves exact " + marker + " after read-only absence verification", () => {
  const r = exercise({ pushResult: { status: 128, stderr } });
  assert.deepEqual(Array.from(r.report.pushFailure.markers), [marker]);
  assert.equal(r.report.publicationStatus, "VERIFIED_ABSENT");
  assert.equal(r.error, "PUBLICATION_GIT_FAILED");
  assert.equal(r.calls.filter(x => x === "push").length, 1);
});
