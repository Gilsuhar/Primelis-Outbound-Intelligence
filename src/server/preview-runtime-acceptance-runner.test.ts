// @vitest-environment node
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { acceptancePlan, acceptRuntimePrisma, runtimeChildEnvironment, runtimeResult } from '../../scripts/preview/accept-runtime-prisma.mjs';
import { applicationRuntimeBindings, runRuntimeClient } from '../../scripts/preview/runtime-acceptance-client.mjs';
import { buildRuntimeGuard } from '../../scripts/preview/build-runtime-acceptance.mjs';
import { credentialAttestation } from '../../scripts/preview/runtime-credential.mjs';
import { clientVersion } from '../../scripts/preview/provision-runtime-role.mjs';
import { activationAuditSql } from '../../scripts/preview/runtime-provisioning-sql.mjs';
import { branchPrefix, repository, repositoryId, ownerId, workflow } from '../../scripts/preview/github-context.mjs';
import { runtimeDatabaseUrl } from '../lib/preview-runtime-tls';
// Deliberately sequential bytes, never a generated/live credential.
const password = Buffer.from(Array.from({ length: 32 }, (_, i) => i)).toString("base64url");
const ref = "txfxfrlhtvzwgluhnbpw", sha = "a".repeat(40);
const env = () => ({ CI: "true", GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: repository, GITHUB_REPOSITORY_ID: repositoryId,
  GITHUB_REPOSITORY_OWNER_ID: ownerId, GITHUB_ACTOR_ID: ownerId, GITHUB_ACTOR: "Gilsuhar", GITHUB_TRIGGERING_ACTOR: "Gilsuhar",
  GITHUB_REF: `refs/heads/${branchPrefix}${sha}`, GITHUB_REF_TYPE: "branch", GITHUB_SHA: sha, GITHUB_WORKFLOW_SHA: sha,
  GITHUB_WORKFLOW_REF: `${repository}/${workflow}@refs/heads/${branchPrefix}${sha}`, GITHUB_EVENT_NAME: "push", GITHUB_RUN_ATTEMPT: "1", GITHUB_RUN_ID: "123",
  PREVIEW_SETUP_APPROVED_PROJECT_REF: ref, PREVIEW_SETUP_PROJECT_NAME: "agent-workforce-preview",
  PREVIEW_SETUP_APPROVAL: "accept-runtime-prisma:" + ref, PREVIEW_SETUP_ENVIRONMENT: "agent-workforce-preview-setup",
  PREVIEW_SETUP_APPROVED_ENDPOINT: "aws-1-us-west-2.pooler.supabase.com:5432", PREVIEW_SETUP_APPROVED_SHA: sha,
  PREVIEW_SETUP_PUSH_CREATED: "true", PREVIEW_SETUP_PUSH_DELETED: "false", PREVIEW_SETUP_PUSH_FORCED: "false", PREVIEW_SETUP_PUSH_BEFORE: "0".repeat(40),
  PREVIEW_SETUP_DATABASE_URL: "postgresql://postgres." + ref + ":synthetic-only@aws-1-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require&sslaccept=strict",
  PREVIEW_RUNTIME_DATABASE_URL: `postgresql://recycler_preview_app.${ref}:${password}@aws-1-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require&sslaccept=strict&connection_limit=1`,
  PREVIEW_RUNTIME_CREDENTIAL_ATTESTATION: credentialAttestation });
const evidence = { status: "POSTCHECK_PASSED", schema: "a".repeat(64), privileges: "b".repeat(64), backendTls: "REPORTED_TLS" };
const runtimeEvidence = { status: "RUNTIME_PRISMA_VERIFIED", visibleProfiles: 1, allowedColumns: 5, deniedReads: 4, writePrivileges: "DENIED", readOnly: "VERIFIED" };
const result = (data: unknown) => ({ status: 0, clientTls: "VERIFIED", stdout: JSON.stringify(data), stderr: "" });
const deps = () => ({ testing: true, authorize: vi.fn().mockResolvedValue(undefined), probe: vi.fn().mockResolvedValue(undefined),
  client: vi.fn().mockResolvedValueOnce({ status: 0, stdout: clientVersion }).mockResolvedValueOnce(result(evidence)).mockResolvedValueOnce(result(evidence)),
  runtime: vi.fn().mockResolvedValue(result(runtimeEvidence)) });

describe("one-time read-only runtime acceptance", () => {
  it("plans without connecting, executing a client or exposing credentials", async () => {
    const d = deps(), plan = await acceptRuntimePrisma(env(), false, d);
    expect(plan).toEqual({ status: "RUNTIME_ACCEPTANCE_PLAN_VALIDATED", migrationCount: 11 });
    for (const fn of [d.authorize, d.probe, d.client, d.runtime]) expect(fn).not.toHaveBeenCalled();
    expect(JSON.stringify(plan)).not.toContain(password);
  });
  it.each([
    { GITHUB_ACTOR_ID: "1" }, { GITHUB_ACTOR: "other" }, { GITHUB_TRIGGERING_ACTOR: "other" }, { GITHUB_REPOSITORY_ID: "1" },
    { GITHUB_REPOSITORY_OWNER_ID: "1" }, { GITHUB_RUN_ATTEMPT: "2" }, { PREVIEW_SETUP_APPROVED_SHA: "b".repeat(40) },
    { PREVIEW_SETUP_PUSH_CREATED: "false" }, { PREVIEW_SETUP_PUSH_FORCED: "true" }, { PREVIEW_SETUP_PUSH_DELETED: "true" },
    { PREVIEW_SETUP_PUSH_BEFORE: "b".repeat(40) }, { GITHUB_REF: "refs/heads/main" }, { GITHUB_EVENT_NAME: "workflow_dispatch" },
    { PREVIEW_SETUP_APPROVAL: "activate-runtime-login:" + ref }, { PREVIEW_SETUP_APPROVAL: "initialize:" + ref },
    { PREVIEW_SETUP_APPROVED_PROJECT_REF: "ofxqdwpyqbvskrcfpdmx" }, { PREVIEW_SETUP_APPROVED_PROJECT_REF: "mfxqiyidmdppvdzeboke" },
    { PREVIEW_SETUP_APPROVED_ENDPOINT: "production.invalid:5432" }, { PREVIEW_SETUP_DATABASE_URL: undefined },
    { PREVIEW_RUNTIME_DATABASE_URL: undefined }, { PREVIEW_RUNTIME_CREDENTIAL_ATTESTATION: undefined },
    { DATABASE_URL: "unapproved" }, { DIRECT_URL: "unapproved" }, { VERCEL_ENV: "production" },
    { PGSSLMODE: "disable" }, { NODE_TLS_REJECT_UNAUTHORIZED: "0" }, { PRISMA_QUERY_ENGINE_LIBRARY: "untrusted" },
    { NODE_EXTRA_CA_CERTS: "untrusted" }, { NODE_OPTIONS: "untrusted" }, { DOCKER_HOST: "untrusted" },
    { ACTIONS_STEP_DEBUG: "true" }, { ACTIONS_RUNNER_DEBUG: "true" },
    { PREVIEW_RUNTIME_DATABASE_URL: env().PREVIEW_RUNTIME_DATABASE_URL.replace("recycler_preview_app", "postgres") },
    { PREVIEW_RUNTIME_DATABASE_URL: env().PREVIEW_RUNTIME_DATABASE_URL.replace("sslaccept=strict", "sslaccept=accept_invalid_certs") },
  ])("rejects unsafe/missing configuration before any operation %#", async override => {
    const d = deps(); await expect(acceptRuntimePrisma({ ...env(), ...override }, true, d)).rejects.toThrow();
    for (const fn of [d.authorize, d.probe, d.client, d.runtime]) expect(fn).not.toHaveBeenCalled();
  });
  it("isolates Prisma from the administrator secret, GitHub token and inherited provider configuration", async () => {
    const source = { ...env(), GITHUB_TOKEN: "synthetic-github-only", OPENAI_API_KEY: "synthetic-provider-only" };
    const child = runtimeChildEnvironment(source);
    expect(child.PREVIEW_SETUP_DATABASE_URL).toBeUndefined(); expect(child.GITHUB_TOKEN).toBeUndefined(); expect(child.OPENAI_API_KEY).toBeUndefined();
    expect(child.PREVIEW_RUNTIME_DATABASE_URL).toBe(source.PREVIEW_RUNTIME_DATABASE_URL);
    expect(applicationRuntimeBindings(child).PREVIEW_DATABASE_URL).toBe(source.PREVIEW_RUNTIME_DATABASE_URL);
    const d = deps(), report = await acceptRuntimePrisma(source, true, d);
    expect(d.runtime).toHaveBeenCalledOnce(); expect(d.runtime).toHaveBeenCalledWith(child);
    expect(d.client.mock.calls.map(c => c[0])).toEqual(["VERSION", "BEFORE", "AFTER"]);
    expect(d.client.mock.calls[1][1]).toBe(activationAuditSql("postcheck"));
    expect(d.client.mock.calls[2][1]).toBe(activationAuditSql("postcheck"));
    expect(d.client.mock.invocationCallOrder[1]).toBeLessThan(d.runtime.mock.invocationCallOrder[0]);
    expect(d.runtime.mock.invocationCallOrder[0]).toBeLessThan(d.client.mock.invocationCallOrder[2]);
    expect(report).toMatchObject({ status: "RUNTIME_ACCEPTANCE_VERIFIED", databaseWrites: 0, migrationCount: 11, tableCount: 50 });
    expect(JSON.stringify(report)).not.toContain(password);
  });
  it.each(["authorize", "probe", "runtime"] as const)("stops without retry on %s failure", async stage => {
    const d = deps(); d[stage].mockRejectedValue(new Error("private failure"));
    await expect(acceptRuntimePrisma(env(), true, d)).rejects.toThrow();
    expect(d.runtime.mock.calls.length).toBe(stage === "runtime" ? 1 : 0);
    expect(d.client.mock.calls.some(c => c[0] === "AFTER")).toBe(false);
  });
  it.each(["IDENTITY", "HISTORY", "RLS_API", "ATTRIBUTES", "PROFILE_COLUMNS", "EFFECTIVE_ACCESS", "SCHEMA_BASELINE"])
    ("rejects administrative preflight %s before connecting Prisma", async code => {
      const d = deps(); d.client.mockReset().mockResolvedValueOnce({ status: 0, stdout: clientVersion })
        .mockResolvedValueOnce({ status: 3, clientTls: "VERIFIED", stdout: "", stderr: "ERROR: P0001: PREVIEW_ROLE_" + code });
      await expect(acceptRuntimePrisma(env(), true, d)).rejects.toThrow(code); expect(d.runtime).not.toHaveBeenCalled();
    });
  it("rejects a different PostgreSQL client version", async () => {
    const d = deps(); d.client.mockReset().mockResolvedValue({ status: 0, stdout: "other" });
    await expect(acceptRuntimePrisma(env(), true, d)).rejects.toThrow("CLIENT_VERSION"); expect(d.runtime).not.toHaveBeenCalled();
  });
  it.each(["schema", "privileges"])("fails on independent postcheck %s changes without retry", async key => {
    const d = deps(); d.client.mockReset().mockResolvedValueOnce({ status: 0, stdout: clientVersion })
      .mockResolvedValueOnce(result(evidence)).mockResolvedValueOnce(result({ ...evidence, [key]: "c".repeat(64) }));
    await expect(acceptRuntimePrisma(env(), true, d)).rejects.toThrow("UNEXPECTED_CHANGE"); expect(d.runtime).toHaveBeenCalledOnce();
  });
  it("requires actual-client TLS on each independent audit", async () => {
    const d = deps(); d.client.mockReset().mockResolvedValueOnce({ status: 0, stdout: clientVersion })
      .mockResolvedValueOnce(result(evidence)).mockResolvedValueOnce({ status: 0, stdout: JSON.stringify(evidence) });
    await expect(acceptRuntimePrisma(env(), true, d)).rejects.toThrow("TLS_EVIDENCE");
  });
  it.each([
    { ...runtimeEvidence, deniedReads: 3 }, { ...runtimeEvidence, readOnly: "UNKNOWN" }, { ...runtimeEvidence, visibleProfiles: 2 },
    { ...runtimeEvidence, writePrivileges: "UNKNOWN" }, { ...runtimeEvidence, private: "must-not-leak" }, {},
  ])("rejects incomplete or extra runtime evidence %#", data => {
    expect(() => runtimeResult(result(data))).toThrow("CLIENT_EVIDENCE");
  });
  it("sanitizes child output and recognizes only fixed error codes", () => {
    expect(() => runtimeResult({ status: 1, stdout: password, stderr: password })).toThrow("CLIENT_FAILED");
    expect(() => runtimeResult({ status: 1, stdout: "", stderr: JSON.stringify({ status: "RUNTIME_ACCEPTANCE_FAILED", code: "PREVIEW_RUNTIME_VERIFY_SESSION" }) })).toThrow("SESSION");
    expect(() => runtimeResult({ ...result(runtimeEvidence), stderr: password })).toThrow("CLIENT_EVIDENCE");
  });
});

describe("actual application URL guard and isolated Prisma construction", () => {
  it.each(["PREVIEW_SETUP_DATABASE_URL", "DATABASE_URL", "DIRECT_URL", "PRISMA_QUERY_ENGINE_LIBRARY", "NODE_OPTIONS", "NODE_EXTRA_CA_CERTS", "PGPASSWORD"])
    ("rejects inherited %s before constructing Prisma", key => {
      expect(() => applicationRuntimeBindings({ ...runtimeChildEnvironment(env()), [key]: "forbidden" })).toThrow();
    });
  it("bundles and executes the unchanged application URL/TLS guard without credentials or network access", async () => {
    await buildRuntimeGuard();
    const guardModule = await import(/* @vite-ignore */ pathToFileURL(resolve("node_modules/.cache/preview-runtime-acceptance/url-guard.mjs")).href);
    const bindings = applicationRuntimeBindings(runtimeChildEnvironment(env()));
    const actual = guardModule.runtimeDatabaseUrl(bindings);
    expect(actual).toBe(runtimeDatabaseUrl(bindings));
    const parsed = new URL(actual);
    expect(parsed.username).toBe("recycler_preview_app." + ref);
    expect(parsed.searchParams.get("sslaccept")).toBe("strict"); expect(parsed.searchParams.get("sslmode")).toBe("require");
    expect(parsed.searchParams.get("sslcert")).toMatch(/supabase-prod-ca-2021\.crt$/);
    expect(() => guardModule.runtimeDatabaseUrl({ ...bindings, DATABASE_URL: "forbidden" })).toThrow("ISOLATION_REQUIRED");
    const bundle = readFileSync("node_modules/.cache/preview-runtime-acceptance/url-guard.mjs", "utf8");
    expect(bundle).not.toContain(password); expect(bundle).not.toContain(env().PREVIEW_RUNTIME_DATABASE_URL);
    expect(bundle).toContain("PREVIEW_DATABASE_TLS_REQUIRED");
  });
  it("builds through the standalone CLI without test-runner module resolution or credentials", () => {
    const child = spawnSync(process.execPath, ["scripts/preview/build-runtime-acceptance.mjs"], {
      env: { NODE_ENV: "test", SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, TEMP: process.env.TEMP, TMP: process.env.TMP },
      encoding: "utf8", timeout: 30000, shell: false,
    });
    expect(child.error).toBeUndefined(); expect(child.status).toBe(0);
    expect(child.stderr).toBe(""); expect(child.stdout.trim()).toBe("RUNTIME_ACCEPTANCE_GUARD_BUILT");
  });
  it.each(["--activate-runtime-login", "--execute-approved-initialization", "--bind-profile", "--retry"])
    ("rejects the unapproved CLI operation %s before any connection", argument => {
      const child = spawnSync(process.execPath, ["scripts/preview/accept-runtime-prisma.mjs", argument], {
        env: { NODE_ENV: "test", SystemRoot: process.env.SystemRoot, PATH: process.env.PATH }, encoding: "utf8", timeout: 10000, shell: false,
      });
      expect(child.status).toBe(1); expect(child.stdout).toBe("");
      expect(JSON.parse(child.stderr).code).toBe("PREVIEW_RUNTIME_ACCEPTANCE_ARGUMENTS");
    });
  it("never constructs a non-pinned Prisma version or falls back to administrator", async () => {
    const connect = vi.fn();
    await expect(runRuntimeClient(runtimeChildEnvironment(env()), { version: "6.0.0", url: runtimeDatabaseUrl, connect })).rejects.toThrow("CONFIGURATION");
    expect(connect).not.toHaveBeenCalled();
  });
  it("disconnects after a runtime-session failure and retains no raw connection error", async () => {
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const client = { $transaction: vi.fn().mockRejectedValue(new Error(password)), $disconnect: disconnect };
    await expect(runRuntimeClient(runtimeChildEnvironment(env()), { version: "5.22.0", url: runtimeDatabaseUrl, connect: () => client })).rejects.toThrow("CONNECTION_OR_QUERY");
    expect(disconnect).toHaveBeenCalledOnce();
  });
  it("has no reachable migration, password, activation or application write command", () => {
    for (const file of ["accept-runtime-prisma.mjs", "runtime-acceptance-client.mjs", "build-runtime-acceptance.mjs"]) {
      const source = readFileSync("scripts/preview/" + file, "utf8");
      expect(source).not.toMatch(/activateRuntimeLogin|runActivationSession|initializePreview|bindProfile\(|provisionRuntimeRole\(|migrate deploy|migrate reset|db push|\\password |ALTER ROLE|\.user\.(?:create|update|delete)|\$executeRaw/);
    }
    const audit = activationAuditSql("postcheck");
    expect(audit).toMatch(/^BEGIN READ ONLY;/); expect(audit).toMatch(/ROLLBACK;$/);
    expect(audit.replace(/'(?:[^']|'')*'/g, "''")).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|TRUNCATE|COPY|CALL)\b/i);
    expect(readFileSync(workflow, "utf8")).not.toMatch(/activate-runtime-login|--bind-profile|--provision-runtime-role|migrate deploy|upload-artifact/);
    expect(acceptancePlan(env()).migrationCount).toBe(11);
  });
});
