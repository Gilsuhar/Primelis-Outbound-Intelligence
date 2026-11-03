// @vitest-environment node
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, expect, it, vi } from "vitest";
import http from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import { blockProviderNetwork } from "../../ci/company-acceptance/network";
import {
  checksum,
  NEON_CI_TARGET,
  requireCiApproval,
  requireCiDatabaseUrl,
  verifyRepositoryMetadata,
} from "../../ci/company-acceptance/policy";
import { fictionalApproval as approval } from "../../ci/company-acceptance/test-support";
import { verifyDatabase, ciStores } from "../../ci/company-acceptance/database";
import type { MinimalPrismaClient } from "../lib/prisma";
// Database policy unit tests use a mocked transport; actual boundary coverage is
// in company-ci-transport.test.ts and company-ci-tls-wire.test.ts.
vi.mock("../../ci/company-acceptance/transport", () => ({ requireVerifiedCiTransport: vi.fn() }));
const raw = JSON.stringify(approval),
  now = new Date("2026-10-19T10:00:00Z");
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
});
const env: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  CI_APPROVAL_SHA256: checksum(raw),
  CI_ACCEPTANCE_ENABLED: "true",
  CI_ACCEPTANCE_MODE: "SIMULATED",
  GITHUB_ACTIONS: "true",
  RUNNER_ENVIRONMENT: "github-hosted",
  RUNNER_OS: "Linux",
  GITHUB_REPOSITORY: approval.repository,
  GITHUB_REPOSITORY_ID: approval.repositoryId,
  GITHUB_REPOSITORY_OWNER_ID: approval.ownerId,
  GITHUB_REF: approval.ref,
  GITHUB_EVENT_NAME: "schedule",
  GITHUB_RUN_ID: "100",
  GITHUB_RUN_ATTEMPT: "1",
  GITHUB_RUN_NUMBER: "1",
  GITHUB_SHA: "a".repeat(40),
};
it("accepts only a bounded, hash-bound approved CI identity and private repository metadata", () => {
  expect(requireCiApproval(raw, env, now)).toEqual(approval);
  const repo = {
    id: 123,
    full_name: approval.repository,
    private: true,
    fork: false,
    archived: false,
    disabled: false,
    default_branch: "main",
    owner: { id: 456 },
  };
  expect(() => verifyRepositoryMetadata(repo, approval)).not.toThrow();
  for (const patch of [
    { private: false },
    { id: 999 },
    { fork: true },
    { default_branch: "other" },
    { owner: { id: 9 } },
  ])
    expect(() => verifyRepositoryMetadata({ ...repo, ...patch }, approval)).toThrow();
});
it.each([
  ["CI_ACCEPTANCE_ENABLED", "false"],
  ["CI_ACCEPTANCE_MODE", "LIVE"],
  ["GITHUB_ACTIONS", "false"],
  ["RUNNER_ENVIRONMENT", "self-hosted"],
  ["RUNNER_OS", "Windows"],
  ["GITHUB_REPOSITORY", "wrong/repo"],
  ["GITHUB_REPOSITORY_ID", "9"],
  ["GITHUB_REPOSITORY_OWNER_ID", "9"],
  ["GITHUB_REF", "refs/pull/1/merge"],
  ["GITHUB_EVENT_NAME", "push"],
  ["GITHUB_EVENT_NAME", "pull_request_target"],
  ["GITHUB_RUN_ATTEMPT", "2"],
  ["GITHUB_RUN_NUMBER", "15"],
  ["GITHUB_RUN_NUMBER", "0"],
  ["GITHUB_SHA", "bad"],
  ["CI_APPROVAL_SHA256", "bad"],
  ["VERCEL_ENV", "preview"],
  ["DATABASE_URL", "fictional"],
  ["OPENAI_API_KEY", "fictional"],
  ["HUBSPOT_TOKEN", "fictional"],
  ["SUPABASE_SERVICE_ROLE_KEY", "fictional"],
  ["OUTREACH_SECRET", "fictional"],
])("fails closed for %s=%s without reading credentials", (key, value) => {
  expect(() => requireCiApproval(raw, { ...env, [key]: value }, now)).toThrow(/^CI_/);
});
it("rejects missing evidence, disabled templates, expired approvals and changed budgets", () => {
  for (const patch of [
    { enabled: false },
    { evidence: {} },
    { limits: { ...approval.limits, outbound: true } },
    { limits: { ...approval.limits, infrastructureOverageUsd: 5 } },
    { limits: { ...approval.limits, retries: 1 } },
    { expiresAt: "2026-10-19T09:00:00.000Z" },
    { expiresAt: "2027-01-01T00:00:00.000Z" },
  ]) {
    const changed = JSON.stringify({ ...approval, ...patch });
    expect(() =>
      requireCiApproval(changed, { ...env, CI_APPROVAL_SHA256: checksum(changed) }, now),
    ).toThrow(/^CI_/);
  }
  expect(() =>
    requireCiApproval(
      readFileSync("ci/company-acceptance/approval.template.json", "utf8"),
      env,
      now,
    ),
  ).toThrow();
});
const fictionalUrl = `postgresql://ci_acceptance_app:fictional-only@${NEON_CI_TARGET.host}/${NEON_CI_TARGET.name}?sslmode=require&sslaccept=strict&connection_limit=1&connect_timeout=15`;
it("pins database host, role, name, TLS and single connection; cannot fall back to local or production", () => {
  expect(requireCiDatabaseUrl(fictionalUrl, approval)).toBe(fictionalUrl);
  for (const value of [
    undefined,
    fictionalUrl.replace("ep-green-silence-b5lbunar.", "ep-other."),
    fictionalUrl.replace("ci_acceptance_app:", "postgres:"),
    fictionalUrl.replace("/ci_acceptance_pilot?", "/postgres?"),
    fictionalUrl.replace("sslaccept=strict", "sslaccept=accept_invalid_certs"),
    fictionalUrl + "&sslmode=disable",
    fictionalUrl + "&schema=private",
    fictionalUrl.replace("limit=1", "limit=2"),
    fictionalUrl.replace(".neon.tech", ".neon.tech.evil.example"),
    fictionalUrl.replace(":fictional-only@", "@"),
  ])
    expect(() => requireCiDatabaseUrl(value, approval)).toThrow("CI_DATABASE_IDENTITY_DENIED");
});
it("accepts the reviewed c-7 endpoint only with the pinned project and database", () => {
  expect(NEON_CI_TARGET.host).toBe("ep-green-silence-b5lbunar.c-7.us-east-2.aws.neon.tech");
  expect(requireCiApproval(raw, env, now).database.projectId).toBe("snowy-art-90934943");
  expect(requireCiDatabaseUrl(fictionalUrl, approval)).toBe(fictionalUrl);
});
it.each([
  { host: "ep-green-silence-b5lbunar.us-east-2.aws.neon.tech" },
  { host: "ep-green-silence-b5lbunar.c-8.us-east-2.aws.neon.tech" },
  { host: "ep-other.c-7.us-east-2.aws.neon.tech" },
  { host: "ep-green-silence-b5lbunar-pooler.c-7.us-east-2.aws.neon.tech" },
  { host: "ep-green-silence-b5lbunar.c-7.eu-central-1.aws.neon.tech" },
  { host: "ep-green-silence-b5lbunar.c-7.us-east-2.aws.neon.tech.attacker.invalid" },
  { host: "ep-green-silence-b5lbunar.c-7.us-east-2.aws.neon.tech." },
  { host: "127.0.0.1" },
  { host: "db.production.supabase.co" },
  { projectId: "unknown-project" },
  { name: "neondb" },
  { name: "ci_acceptance_unreviewed" },
])("rejects substituted target metadata even with a recomputed approval hash: %j", (patch) => {
  const changed = { ...approval, database: { ...approval.database, ...patch } };
  const changedRaw = JSON.stringify(changed);
  expect(() =>
    requireCiApproval(changedRaw, { ...env, CI_APPROVAL_SHA256: checksum(changedRaw) }, now),
  ).toThrow("CI_APPROVAL_INVALID");
  expect(() => requireCiDatabaseUrl(fictionalUrl, changed as typeof approval)).toThrow(
    "CI_DATABASE_IDENTITY_DENIED",
  );
});
it.each([
  ["sslmode=require", "sslmode=disable"],
  ["sslaccept=strict", "sslaccept=accept_invalid_certs"],
  ["connection_limit=1", "connection_limit=2"],
  ["connect_timeout=15", "connect_timeout=0"],
  ["postgresql:", "https:"],
  [".tech/", ".tech:5433/"],
  ["/ci_acceptance_pilot?", "/ci_acceptance_other?"],
])("retains connection security for the corrected endpoint: %s", (from, to) => {
  expect(() => requireCiDatabaseUrl(fictionalUrl.replace(from, to), approval)).toThrow(
    "CI_DATABASE_IDENTITY_DENIED",
  );
});
it("verifies role, RLS and reviewed policies after client transport verification", async () => {
  const policies = [{ policyname: "fictional-policy" }];
  const a = {
    ...approval,
    database: { ...approval.database, policySha256: checksum(JSON.stringify(policies)) },
  };
  const identity = {
    database: a.database.name,
    role: a.database.role,
    tls: true,
    elevated: false,
    databaseCreate: false,
    schemaCreate: false,
    ownsObjects: false,
    canDelete: false,
    inheritedRoles: false,
  };
  const marker = JSON.stringify({
    profile: a.profile,
    projectId: a.database.projectId,
    cohort: a.cohort,
    actor: a.actor,
    approvalHash: "a".repeat(64),
  });
  const make = (patch = {}) =>
    ({
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ ...identity, ...patch }])
        .mockResolvedValueOnce([{ draftContent: marker }])
        .mockResolvedValueOnce([{ enabled: true, forced: true, policies: 1 }])
        .mockResolvedValueOnce(policies),
    }) as unknown as MinimalPrismaClient;
  await expect(verifyDatabase(make(), a, "a".repeat(64))).resolves.toBeUndefined();
  for (const patch of [
    { database: "neondb" },
    { elevated: true },
    { role: "postgres" },
    { databaseCreate: true },
    { schemaCreate: true },
    { ownsObjects: true },
    { canDelete: true },
    { inheritedRoles: true },
  ])
    await expect(verifyDatabase(make(patch), a, "a".repeat(64))).rejects.toThrow(
      "CI_DATABASE_GRANTS_DENIED",
    );
  // Proxy backend TLS status cannot override or invalidate verified client TLS.
  await expect(verifyDatabase(make({ tls: false }), a, "a".repeat(64))).resolves.toBeUndefined();
  await expect(verifyDatabase(make(), approval, "a".repeat(64))).rejects.toThrow(
    "CI_DATABASE_POLICY_CHANGED",
  );
  await expect(ciStores(make(), a).store.read("wrong")).rejects.toThrow("CI_ACTOR_DENIED");
  const absentMarker = make();
  vi.mocked(absentMarker.$queryRaw)
    .mockReset()
    .mockResolvedValueOnce([identity])
    .mockResolvedValueOnce([]);
  await expect(verifyDatabase(absentMarker, a, "a".repeat(64))).rejects.toThrow(
    "CI_DATABASE_MARKER_DENIED",
  );
  const absentRls = make();
  vi.mocked(absentRls.$queryRaw)
    .mockReset()
    .mockResolvedValueOnce([identity])
    .mockResolvedValueOnce([{ draftContent: marker }])
    .mockResolvedValueOnce([{ enabled: false, forced: false, policies: 0 }]);
  await expect(verifyDatabase(absentRls, a, "a".repeat(64))).rejects.toThrow(
    "CI_DATABASE_RLS_REQUIRED",
  );
});
it("keeps the workflow inert, finite, read-only and deployment-free", () => {
  const workflow = readFileSync("ci/company-acceptance/workflow.template.yml", "utf8");
  expect(workflow).toContain("github.run_number <= 14");
  expect(workflow).toContain("timeout-minutes: 15");
  expect(workflow).toContain("persist-credentials: false");
  expect(workflow).toContain("contents: read");
  expect(workflow).not.toMatch(/\n\s+(push|pull_request|pull_request_target):/);
  expect(workflow).not.toMatch(/vercel deploy|prisma migrate|db push|service_role|OPENAI_API_KEY/);
  const actions = [...workflow.matchAll(/uses: ([^\n]+)/g)].map((m) => m[1]);
  expect(actions).toHaveLength(3);
  expect(actions.every((a) => /@[a-f0-9]{40}$/.test(a))).toBe(true);
});
it("denies provider HTTP transports even if accidentally called by a fixture", async () => {
  const original = {
    fetch: globalThis.fetch,
    request: http.request,
    get: http.get,
    secureRequest: https.request,
    secureGet: https.get,
  };
  try {
    const attempts = blockProviderNetwork();
    await expect(fetch("https://provider.example/")).rejects.toThrow("CI_NETWORK_FORBIDDEN");
    expect(() => http.request("http://provider.example/")).toThrow("CI_NETWORK_FORBIDDEN");
    expect(() => https.get("https://provider.example/")).toThrow("CI_NETWORK_FORBIDDEN");
    expect(attempts()).toBe(3);
  } finally {
    globalThis.fetch = original.fetch;
    http.request = original.request;
    http.get = original.get;
    https.request = original.secureRequest;
    https.get = original.secureGet;
    syncBuiltinESMExports();
  }
});
it("interrupts a real subprocess after a persisted claim, recovers in a fresh process, and independently reopens all results", () => {
  const require = createRequire(import.meta.url);
  const esbuild = createRequire(require.resolve("vite"))("esbuild") as {
    buildSync(o: Record<string, unknown>): void;
  };
  mkdirSync(resolve("outputs"), { recursive: true });
  const directory = mkdtempSync(join(resolve("outputs"), "company-ci-offline-")),
    entry = join(directory, "worker.cjs");
  directories.push(directory);
  esbuild.buildSync({
    entryPoints: [resolve("src/test/company-ci-process.ts")],
    outfile: entry,
    bundle: true,
    platform: "node",
    format: "cjs",
    packages: "external",
    logLevel: "silent",
    alias: { "@": resolve("src"), "server-only": resolve("src/test/server-only.ts") },
  });
  const childEnv = Object.fromEntries(
    ["SystemRoot", "WINDIR", "TEMP", "TMP", "PATH"].flatMap((key) =>
      process.env[key] ? [[key, process.env[key]!]] : [],
    ),
  );
  const run = (id: string) =>
    spawnSync(process.execPath, [entry, directory, id], {
      env: { ...childEnv, NODE_ENV: "test" },
      encoding: "utf8",
      timeout: 20000,
    });
  const interrupted = run("100");
  expect(interrupted.status, interrupted.stderr).toBe(73);
  const snapshot = JSON.parse(readFileSync(join(directory, "queue.json"), "utf8"));
  expect(snapshot.jobs).toHaveLength(3);
  expect(snapshot.jobs[2]).toMatchObject({ status: "RUNNING", stage: "VALIDATE", recoveries: 0 });
  expect(snapshot.jobs[2].checkpoints).toHaveLength(1);
  expect(run("100").status).toBe(1); // Same hosted run identity cannot claim fresh-runner recovery.
  const resumed = run("101");
  expect(resumed.status, resumed.stderr).toBe(0);
  expect(resumed.stdout).toContain("RECOVERED");
  expect(run("101").status).toBe(1); // Reopen must be a third invocation.
  const reopened = run("102");
  expect(reopened.status, reopened.stderr).toBe(0);
  expect(reopened.stdout).toContain("VERIFIED");
  const result = JSON.parse(readFileSync(join(directory, "results.json"), "utf8"));
  expect(result.state.jobs.map((j: { status: string }) => j.status)).toEqual([
    "COMPLETE",
    "COMPLETE",
    "COMPLETE",
  ]);
  expect(result.audit.manualDispatches).toBe(0);
  expect(result.state.jobs.map((j: { run: { usage: unknown[] } }) => j.run.usage)).toEqual([
    [],
    [],
    [],
  ]);
  expect(result.state.jobs[1].run.groundingAudit.status).toBe("REJECTED");
  expect(result.state.jobs[2].recoveries).toBe(1);
  expect(run("103").status).toBe(0);
  // Tampering with persisted completion is rejected, not overwritten.
  const changed = JSON.parse(readFileSync(join(directory, "queue.json"), "utf8"));
  changed.jobs[0].run.canSend = true;
  writeFileSync(join(directory, "queue.json"), JSON.stringify(changed));
  expect(run("104").status).toBe(1);
  writeFileSync(
    resolve("outputs/COMPANY_CI_OFFLINE_REPORT.md"),
    readFileSync(join(directory, "REPORT.md")),
  );
}, 60000);
