// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { initializePreview, setupPlan } from "../../scripts/preview/setup.mjs";
import { tagPrefix, environment, repository, repositoryId, owner, ownerId, workflow, validateGitHubContext, verifyGitHubApproval } from "../../scripts/preview/github-context.mjs";
import { reviewedFiles, verifyInitializedSchema } from "../../scripts/preview/verification.mjs";
import { probeTls } from "../../scripts/preview/tls-probe.mjs";
import target from "../../scripts/preview/verified-target.json";

const sha = "a".repeat(40);
const local = () => ({ PREVIEW_SETUP_APPROVED_PROJECT_REF: target.projectRef,
  PREVIEW_SETUP_PROJECT_NAME: target.projectName, PREVIEW_SETUP_APPROVAL: `initialize:${target.projectRef}`,
  PREVIEW_SETUP_APPROVED_ENDPOINT: `db.${target.projectRef}.supabase.co:5432`,
  PREVIEW_SETUP_DATABASE_URL: `postgresql://postgres:synthetic@db.${target.projectRef}.supabase.co:5432/postgres?sslmode=require&sslaccept=strict` });
const cloud = () => ({ ...local(), CI: "true", GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: repository,
  GITHUB_REF: `refs/tags/${tagPrefix}${sha}`, GITHUB_EVENT_NAME: "push", GITHUB_RUN_ATTEMPT: "1",
  GITHUB_WORKFLOW_REF: `${repository}/${workflow}@refs/tags/${tagPrefix}${sha}`, GITHUB_SHA: sha,
  GITHUB_WORKFLOW_SHA: sha, PREVIEW_SETUP_APPROVED_SHA: sha, PREVIEW_SETUP_ENVIRONMENT: environment,
  GITHUB_REPOSITORY_ID: repositoryId, GITHUB_REPOSITORY_OWNER_ID: ownerId,
  GITHUB_RUN_ID: "123", GITHUB_ACTOR: owner, GITHUB_ACTOR_ID: ownerId,
  GITHUB_TRIGGERING_ACTOR: owner, GITHUB_TOKEN: "synthetic" });
const files = reviewedFiles(target.migrations);
const history = () => target.migrations.map(name => ({ migration_name: name,
  checksum: files.hashes[`prisma/migrations/${name}/migration.sql`], finished_at: new Date(),
  rolled_back_at: null as Date | null, applied_steps_count: 1 }));
const tables = () => files.tables.map(name => ({ name, rls: true, api_access: false }));
function verifiedDb() {
  return { $queryRawUnsafe: vi.fn().mockResolvedValueOnce(history()).mockResolvedValueOnce(tables())
    .mockResolvedValueOnce([{ auth_users: 0, runtime_roles: 0, policies: 0 }])
    .mockResolvedValueOnce(files.tables.slice(1).map(() => ({ count: 0 }))) };
}
function dependencies() {
  return { authorize: vi.fn().mockResolvedValue(undefined), probe: vi.fn().mockResolvedValue({ tls: "verified" }),
    connect: vi.fn(), migrate: vi.fn(), diff: vi.fn() };
}
function approvalData() {
  const actor = () => ({ login: owner, id: Number(ownerId), type: "User" });
  return {
    run: { id: 123, event: "push", run_attempt: 1, head_sha: sha, actor: actor(), triggering_actor: actor(),
      repository: { id: Number(repositoryId), full_name: repository, fork: false, owner: actor() } },
    config: { name: environment, id: 42, can_admins_bypass: false,
      protection_rules: [],
      deployment_branch_policy: { custom_branch_policies: true, protected_branches: false } },
    policies: { total_count: 1, branch_policies: [{ name: `${tagPrefix}${sha}`, type: "tag" }] },
  };
}
function approvalRequest(data = approvalData()) {
  return vi.fn().mockResolvedValueOnce({ status: 200, json: async () => data.run })
    .mockResolvedValueOnce({ status: 200, json: async () => data.config })
    .mockResolvedValueOnce({ status: 200, json: async () => data.policies });
}
afterEach(() => vi.useRealTimers());

describe("one-time cloud initialization context", () => {
  it("accepts only the exact deliberately published setup tag and approved SHA", () => {
    expect(() => validateGitHubContext(cloud())).not.toThrow();
    expect(setupPlan(cloud()).migrations).toHaveLength(11);
  });
  it.each([
    { CI: "true", GITHUB_ACTIONS: "" }, { GITHUB_REPOSITORY: "other/repo" },
    { GITHUB_REF: "refs/heads/main" }, { GITHUB_EVENT_NAME: "workflow_dispatch" },
    { GITHUB_REF: "refs/heads/codex/cloud-release-candidate-20261102-192938" },
    { GITHUB_REF: `refs/heads/${tagPrefix}${sha}` },
    { GITHUB_REF: `refs/tags/${tagPrefix}${"b".repeat(40)}` },
    { GITHUB_REF: `refs/tags/${tagPrefix}${sha}-extra` },
    { GITHUB_REF: `refs/tags/agent-workforce-preview-setup-mfxqiyidmdppvdzeboke-${sha}` },
    { PREVIEW_SETUP_APPROVED_SHA: "b".repeat(40) },
    // The preserved original release must never authorize the replacement publication.
    { PREVIEW_SETUP_APPROVED_SHA: "59aaee2e23667ee333802791ba995861474d85fb" },
    { GITHUB_REF: `refs/tags/${tagPrefix}59aaee2e23667ee333802791ba995861474d85fb` },
    { GITHUB_EVENT_NAME: "pull_request_target" }, { GITHUB_RUN_ATTEMPT: "2" },
    { GITHUB_WORKFLOW_REF: "other" }, { GITHUB_WORKFLOW_SHA: "b".repeat(40) },
    { PREVIEW_SETUP_APPROVED_SHA: "" }, { PREVIEW_SETUP_ENVIRONMENT: "production" },
    { ACTIONS_STEP_DEBUG: "true" }, { ACTIONS_RUNNER_DEBUG: "true" },
    { GITHUB_ACTOR: "collaborator" }, { GITHUB_ACTOR_ID: "12345" }, { GITHUB_ACTOR_ID: "" },
    { GITHUB_ACTOR: "github-actions[bot]" }, { GITHUB_TRIGGERING_ACTOR: "collaborator" },
    { GITHUB_TRIGGERING_ACTOR: "" }, { GITHUB_REPOSITORY_ID: "12345" },
    { GITHUB_REPOSITORY_OWNER_ID: "12345" }, { GITHUB_REPOSITORY_OWNER_ID: "" },
  ])("rejects unsafe cloud context before external calls: %j", async patch => {
    const deps = dependencies();
    await expect(initializePreview({ ...cloud(), ...patch }, true, deps)).rejects.toThrow();
    for (const operation of Object.values(deps)) expect(operation).not.toHaveBeenCalled();
  });
  it("plan mode neither authorizes nor connects", async () => {
    const deps = dependencies();
    expect(await initializePreview(cloud(), false, deps)).toEqual({ status: "PLAN_VALIDATED", migrationCount: 11 });
    for (const operation of Object.values(deps)) expect(operation).not.toHaveBeenCalled();
  });
  it.each(["authorize", "probe"] as const)("stops on %s failure before database authentication", async boundary => {
    const deps = dependencies();
    deps[boundary].mockRejectedValue(new Error("denied"));
    await expect(initializePreview(cloud(), true, deps)).rejects.toThrow("denied");
    expect(deps.connect).not.toHaveBeenCalled(); expect(deps.migrate).not.toHaveBeenCalled();
    expect(deps[boundary]).toHaveBeenCalledOnce();
    if (boundary === "authorize") expect(deps.probe).not.toHaveBeenCalled();
  });
  it("requires a reviewed matching session-pooler endpoint and tenant username", () => {
    const endpoint = "aws-0-us-west-2.pooler.supabase.com:5432"; // Synthetic format fixture, not a discovered endpoint.
    const env = { ...local(), PREVIEW_SETUP_APPROVED_ENDPOINT: endpoint,
      PREVIEW_SETUP_DATABASE_URL: `postgresql://postgres.${target.projectRef}:synthetic@${endpoint}/postgres?sslmode=require&sslaccept=strict` };
    expect(() => setupPlan(env)).not.toThrow();
    for (const value of [env.PREVIEW_SETUP_DATABASE_URL.replace(":5432", ":6543"),
      env.PREVIEW_SETUP_DATABASE_URL.replace(target.projectRef, "mfxqiyidmdppvdzeboke"),
      env.PREVIEW_SETUP_DATABASE_URL.replace(target.projectRef, "ofxqdwpyqbvskrcfpdmx"),
      env.PREVIEW_SETUP_DATABASE_URL.replace("us-west-2", "us-east-1"),
      env.PREVIEW_SETUP_DATABASE_URL.replace("supabase.com", "supabase.com.evil.invalid"),
      env.PREVIEW_SETUP_DATABASE_URL + "&pgbouncer=true"])
      expect(() => setupPlan({ ...env, PREVIEW_SETUP_DATABASE_URL: value })).toThrow();
    expect(() => setupPlan({ ...env, PREVIEW_SETUP_APPROVED_ENDPOINT: "" })).toThrow();
    expect(() => setupPlan({ ...env, NODE_TLS_REJECT_UNAUTHORIZED: "0" })).toThrow();
  });
});

describe("server-side approval evidence", () => {
  it("accepts owner initiation without reviewers, checking live run identity and exact tag via read-only APIs", async () => {
    const request = approvalRequest();
    await verifyGitHubApproval(cloud(), request);
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls[0][0]).toBe(`https://api.github.com/repos/${repository}/actions/runs/123`);
    expect(request.mock.calls.map(call => call[0]).join(" ")).not.toContain("/approvals");
    for (const [url, options] of request.mock.calls) {
      expect(url).toMatch(/^https:\/\/api.github.com\/repos\/Gilsuhar\/Primelis-Outbound-Intelligence\//);
      expect(options.method).toBeUndefined(); expect(options.redirect).toBe("error");
    }
  });
  it.each(["bypass", "wrong-tag", "branch-policy", "extra-policy", "wrong-environment"])(
    "rejects %s", async failure => {
      const data = approvalData();
      if (failure === "bypass") data.config.can_admins_bypass = true;
      if (failure === "wrong-tag") data.policies.branch_policies[0].name = "*";
      if (failure === "branch-policy") data.policies.branch_policies[0].type = "branch";
      if (failure === "extra-policy") data.policies.total_count = 2;
      if (failure === "wrong-environment") data.config.name = "production";
      const request = approvalRequest(data);
      await expect(verifyGitHubApproval(cloud(), request)).rejects.toThrow("APPROVAL_REJECTED");
    },
  );
  it.each(["actor-id", "actor-name", "bot", "triggering-id", "triggering-name", "triggering-bot",
    "repository-id", "repository-name", "fork", "transferred-owner", "owner-name", "owner-type",
    "run-id", "sha", "event", "retry", "missing-actor"])("rejects authoritative run mismatch %s before TLS or database IO", async failure => {
    const data = approvalData();
    if (failure === "actor-id") data.run.actor.id = 12345;
    if (failure === "actor-name") data.run.actor.login = "collaborator";
    if (failure === "bot") data.run.actor.type = "Bot";
    if (failure === "triggering-id") data.run.triggering_actor.id = 12345;
    if (failure === "triggering-name") data.run.triggering_actor.login = "collaborator";
    if (failure === "triggering-bot") data.run.triggering_actor.type = "Bot";
    if (failure === "repository-id") data.run.repository.id = 12345;
    if (failure === "repository-name") data.run.repository.full_name = "other/repo";
    if (failure === "fork") data.run.repository.fork = true;
    if (failure === "transferred-owner") data.run.repository.owner.id = 12345;
    if (failure === "owner-name") data.run.repository.owner.login = "other";
    if (failure === "owner-type") data.run.repository.owner.type = "Organization";
    if (failure === "run-id") data.run.id = 124;
    if (failure === "sha") data.run.head_sha = "b".repeat(40);
    if (failure === "event") data.run.event = "workflow_dispatch";
    if (failure === "retry") data.run.run_attempt = 2;
    if (failure === "missing-actor") Object.assign(data.run, { actor: undefined });
    const request = approvalRequest(data);
    const deps = dependencies();
    deps.authorize.mockImplementation(env => verifyGitHubApproval(env, request));
    await expect(initializePreview(cloud(), true, deps)).rejects.toThrow("APPROVAL_REJECTED");
    expect(request).toHaveBeenCalledOnce();
    expect(deps.probe).not.toHaveBeenCalled(); expect(deps.connect).not.toHaveBeenCalled();
    expect(deps.migrate).not.toHaveBeenCalled(); expect(deps.diff).not.toHaveBeenCalled();
  });
  it.each([401, 403, 404, 500])("stops immediately on approval API HTTP %i", async status => {
    const request = vi.fn().mockResolvedValue({ status });
    await expect(verifyGitHubApproval(cloud(), request)).rejects.toThrow();
    expect(request).toHaveBeenCalledOnce();
  });
});

describe("reviewed migrations and post-write verification", () => {
  it("pins all eleven SQL files, Prisma schema and frozen lockfile", () => {
    expect(Object.keys(files.hashes)).toHaveLength(13);
    expect(() => reviewedFiles(target.migrations, path => path === "pnpm-lock.yaml"
      ? Buffer.from("changed") : readFileSync(path))).toThrow("FILES_CHANGED");
    expect(() => reviewedFiles(target.migrations, path => path.endsWith("migration.sql")
      ? Buffer.from("changed") : readFileSync(path))).toThrow("FILES_CHANGED");
  });
  it("verifies complete history, exact checksums, tables, RLS and zero seeded rows", async () => {
    expect(await verifyInitializedSchema(verifiedDb(), { migrations: target.migrations }, files))
      .toMatchObject({ migrationCount: 11, checksums: "verified", rls: "verified", apiAccess: "denied" });
  });
  it.each(["missing", "extra", "checksum", "unfinished", "rolled-back", "steps", "order"])("rejects %s history", async failure => {
    const rows = history();
    if (failure === "missing") rows.pop();
    if (failure === "extra") rows.push(rows[0]);
    if (failure === "checksum") rows[0].checksum = "wrong";
    if (failure === "unfinished") Object.assign(rows[0], { finished_at: null });
    if (failure === "rolled-back") rows[0].rolled_back_at = new Date();
    if (failure === "steps") rows[0].applied_steps_count = 0;
    if (failure === "order") rows.reverse();
    const db = { $queryRawUnsafe: vi.fn().mockResolvedValue(rows) };
    await expect(verifyInitializedSchema(db, { migrations: target.migrations }, files)).rejects.toThrow("HISTORY_VERIFICATION_FAILED");
    expect(db.$queryRawUnsafe).toHaveBeenCalledOnce();
  });
  it.each(["missing-table", "rls-off", "api-access", "auth-user", "runtime-role", "policy", "seeded-data"])("rejects %s", async failure => {
    const relations = tables();
    const untouched = { auth_users: 0, runtime_roles: 0, policies: 0 };
    const counts = files.tables.slice(1).map(() => ({ count: 0 }));
    if (failure === "missing-table") relations.pop();
    if (failure === "rls-off") relations[0].rls = false;
    if (failure === "api-access") relations[0].api_access = true;
    if (failure === "auth-user") untouched.auth_users = 1;
    if (failure === "runtime-role") untouched.runtime_roles = 1;
    if (failure === "policy") untouched.policies = 1;
    if (failure === "seeded-data") counts[0].count = 1;
    const db = { $queryRawUnsafe: vi.fn().mockResolvedValueOnce(history()).mockResolvedValueOnce(relations)
      .mockResolvedValueOnce([untouched]).mockResolvedValueOnce(counts) };
    await expect(verifyInitializedSchema(db, { migrations: target.migrations }, files)).rejects.toThrow();
  });
  it("reports post-apply verification failure without rerunning migrations", async () => {
    const deps = dependencies();
    const db = { $queryRawUnsafe: vi.fn().mockResolvedValueOnce([{ database: "postgres", operator: "postgres", fingerprint: target.clusterFingerprint }])
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]), $disconnect: vi.fn() };
    deps.connect.mockResolvedValue(db);
    await expect(initializePreview(cloud(), true, deps)).rejects.toThrow("APPLIED_VERIFICATION_FAILED");
    expect(deps.migrate).toHaveBeenCalledOnce(); expect(deps.diff).not.toHaveBeenCalled();
    expect(db.$disconnect).toHaveBeenCalledOnce();
  });
  it.each([false, true])("requires a successful read-only schema diff (failure=%s)", async fails => {
    const deps = dependencies();
    const post = verifiedDb();
    const db = { $queryRawUnsafe: vi.fn()
      .mockResolvedValueOnce([{ database: "postgres", operator: "postgres", fingerprint: target.clusterFingerprint }])
      .mockResolvedValueOnce([]).mockImplementation(post.$queryRawUnsafe), $disconnect: vi.fn() };
    deps.connect.mockResolvedValue(db);
    if (fails) deps.diff.mockRejectedValue(new Error("schema drift"));
    const pending = initializePreview(cloud(), true, deps);
    if (fails) await expect(pending).rejects.toThrow("APPLIED_VERIFICATION_FAILED");
    else await expect(pending).resolves.toMatchObject({ status: "SCHEMA_INITIALIZED_AND_VERIFIED", migrationCount: 11 });
    expect(deps.migrate).toHaveBeenCalledOnce(); expect(deps.diff).toHaveBeenCalledOnce();
    expect(deps.migrate.mock.invocationCallOrder[0]).toBeLessThan(deps.diff.mock.invocationCallOrder[0]);
    expect(db.$disconnect).toHaveBeenCalledOnce();
  });
});

describe("TLS probe without credentials", () => {
  function transport() {
    const socket = Object.assign(new EventEmitter(), { write: vi.fn(), destroy: vi.fn() });
    const secured = Object.assign(new EventEmitter(), { destroy: vi.fn(), authorized: true,
      getProtocol: () => "TLSv1.3", getPeerCertificate: () => ({ subjectaltname: `DNS:db.${target.projectRef}.supabase.co` }) });
    return { socket, secured, connect: vi.fn<(options: Record<string, unknown>) => typeof socket>(() => socket),
      secure: vi.fn<(options: Record<string, unknown>) => typeof secured>(() => secured) };
  }
  it("checks certificate/hostname and sends only PostgreSQL SSLRequest", async () => {
    const t = transport();
    const pending = probeTls(new URL(local().PREVIEW_SETUP_DATABASE_URL), t);
    t.socket.emit("connect"); t.socket.emit("data", Buffer.from("S")); t.secured.emit("secureConnect");
    await expect(pending).resolves.toEqual({ tls: "verified" });
    expect(t.socket.write).toHaveBeenCalledOnce();
    const bytes = t.socket.write.mock.calls[0][0] as Buffer;
    expect(bytes.length).toBe(8); expect(bytes.readInt32BE(4)).toBe(80877103);
    expect(t.secure.mock.calls[0][0]).toMatchObject({ rejectUnauthorized: true, minVersion: "TLSv1.2" });
  });
  it.each(["no-tls", "bad-certificate", "hostname", "network", "timeout"])("fails closed on %s", async failure => {
    vi.useFakeTimers();
    const t = transport();
    const pending = expect(probeTls(new URL(local().PREVIEW_SETUP_DATABASE_URL), t)).rejects.toThrow("TLS_CONNECTIVITY_FAILED");
    if (failure === "network") t.socket.emit("error", new Error("connection failed"));
    else if (failure === "timeout") await vi.advanceTimersByTimeAsync(10001);
    else if (failure === "no-tls") t.socket.emit("data", Buffer.from("N"));
    else {
      if (failure === "bad-certificate") t.secured.authorized = false;
      if (failure === "hostname") t.secured.getPeerCertificate = () => ({ subjectaltname: "DNS:wrong.invalid" });
      t.socket.emit("data", Buffer.from("S")); t.secured.emit("secureConnect");
    }
    await pending; expect(t.socket.destroy).toHaveBeenCalledOnce(); expect(t.connect).toHaveBeenCalledOnce();
  });
});

it("workflow accepts only setup-tag publication, is environment-gated, SHA-pinned and secret-scoped", () => {
  // Use the YAML parser already present in ESLint's frozen dependency tree; no new dependency.
  const require = createRequire(import.meta.url);
  const yaml = createRequire(require.resolve("eslint/package.json"))("js-yaml");
  const doc = yaml.load(readFileSync(workflow, "utf8"));
  expect(doc.on).toEqual({ push: { tags: [`${tagPrefix}*`] } });
  expect(doc.permissions).toEqual({ contents: "read", actions: "read" });
  expect(doc.concurrency["cancel-in-progress"]).toBe(false);
  const job = doc.jobs.initialize;
  expect(Object.keys(doc.jobs)).toEqual(["initialize"]);
  expect(job.environment).toBe(environment); expect(job["timeout-minutes"]).toBe(15);
  expect(job.if).toContain("github.run_attempt == 1");
  expect(job.if).toContain(`github.ref == format('refs/tags/${tagPrefix}{0}', github.sha)`);
  expect(job.if).toContain("github.event.created == true");
  expect(job.if).toContain("github.event.deleted == false");
  expect(job.if).toContain("github.event.forced == false");
  for (const predicate of [
    `github.repository_id == '${repositoryId}'`, `github.repository_owner_id == '${ownerId}'`,
    `github.actor_id == '${ownerId}'`, `github.actor == '${owner}'`, `github.triggering_actor == '${owner}'`,
    `github.event.sender.id == ${ownerId}`, "github.event.sender.type == 'User'",
  ]) expect(job.if).toContain(predicate);
  const steps = job.steps;
  for (const step of steps.filter((value: { uses?: string }) => value.uses)) expect(step.uses).toMatch(/@[a-f0-9]{40}$/);
  expect(steps[0].with["persist-credentials"]).toBe(false);
  expect(steps[0].with.ref).toBe("${{ github.sha }}");
  const secretSteps = steps.filter((step: { env?: Record<string, string> }) => step.env?.PREVIEW_SETUP_DATABASE_URL);
  expect(secretSteps).toHaveLength(1); expect(secretSteps[0]).toBe(steps.at(-1));
  expect(secretSteps[0].run.trim().split("\n")).toEqual([
    "node scripts/preview/setup.mjs --plan", "node scripts/preview/setup.mjs --execute-approved-initialization"]);
  expect(steps[2].run).toContain("pnpm install --frozen-lockfile --ignore-scripts");
  expect(readFileSync(workflow, "utf8")).not.toMatch(/migrate reset|migrate resolve|db push|prisma:seed|upload-artifact|continue-on-error|cancel-in-progress: true/);
});
