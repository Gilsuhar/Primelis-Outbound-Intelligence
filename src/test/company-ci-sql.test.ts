// @vitest-environment node
// Static review regressions only. Never execute SQL or connect to PostgreSQL here.
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { NEON_CI_TARGET, checksum } from "../../ci/company-acceptance/policy";
import { reviewedSqlHashes } from "../../ci/company-acceptance/initialize";
const sql = (file: string) => readFileSync(`ci/company-acceptance/sql/${file}.sql`, "utf8");

it("binds every initialization phase to the exact target before any DDL or marker write", () => {
  const guard = sql("target-guard");
  for (const value of [
    NEON_CI_TARGET.organizationId,
    NEON_CI_TARGET.projectId,
    NEON_CI_TARGET.branchId,
    NEON_CI_TARGET.host,
    "verify-full",
    "CI_EXECUTION_APPROVAL_REQUIRED",
  ])
    expect(guard).toContain(value);
  expect(guard).toContain("current_database() = :'expected_database'");
  expect(guard).toContain("session_user = 'neondb_owner'");
  expect(guard).not.toContain("pg_stat_ssl");
  expect(guard).toContain("CI_CLIENT_TLS_REQUIRED");
  expect(guard).toContain("AND :'ci_client_tls_verified' = 'PSQL_VERIFY_FULL_SAME_SESSION'");
  for (const file of ["00-create-database", "01-schema-role", "02-identity-marker"]) {
    const content = sql(file);
    expect(content.indexOf("\\ir target-guard.sql")).toBeLessThan(
      content.indexOf("\nBEGIN;") >= 0
        ? content.indexOf("\nBEGIN;")
        : content.indexOf("\nCREATE DATABASE"),
    );
    expect(content).not.toMatch(/\b(DROP|TRUNCATE|DELETE FROM|CREATE EXTENSION)\s/i);
    expect(content).not.toMatch(
      /\bPASSWORD\s+'|ALTER ROLE.*LOGIN|CREATE (?:TABLE|TYPE|ROLE|DATABASE) IF NOT EXISTS/i,
    );
  }
});

it("keeps the reviewed DDL byte-identical and binds the revised TLS guard", () => {
  for (const [file, hash] of Object.entries(reviewedSqlHashes))
    expect(checksum(readFileSync(`ci/company-acceptance/sql/${file}`, "utf8"))).toBe(hash);
  const previous = sql("target-guard")
    .replace(/-- Set only by the reviewed initializer[\s\S]*?\\endif\r?\n/, "")
    .replace(
      "AND :'ci_client_tls_verified' = 'PSQL_VERIFY_FULL_SAME_SESSION'",
      "AND COALESCE((SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()), false)",
    );
  expect(checksum(previous)).toBe(
    "426e9b1a46c7765acbbc3566a785c0eb2316c6922e1b6fd6b0c081d72bf4b781",
  );
});

it("runtime policies permit only exact queue/audit writes and never marker writes", () => {
  const content = sql("01-schema-role");
  const actor = "ci-fixture-pilot-20261019";
  const queueId = "company-queue-" + checksum(JSON.stringify(actor));
  const policies = [...content.matchAll(/CREATE POLICY (\w+)[\s\S]*?;/g)].map((m) => ({
    name: m[1],
    text: m[0],
  }));
  expect(policies).toHaveLength(5);
  for (const name of ["ci_insert", "ci_update"]) {
    const text = policies.find((p) => p.name === name)!.text;
    expect(text).toContain("TO ci_acceptance_app");
    expect(text).toContain(actor);
    expect(text).toContain(queueId);
    expect(text).toContain("ci-audit-pilot-20261019");
    expect(text).not.toContain("ci-identity-");
    expect(text).toContain("WITH CHECK");
  }
  expect(policies.find((p) => p.name === "ci_update")!.text).toContain("USING");
  for (const policy of policies.filter((p) => p.name.startsWith("ci_owner")))
    expect(policy.text).toContain("TO neondb_owner");
  expect(content).toMatch(
    /CREATE ROLE ci_acceptance_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE\s+NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 1/,
  );
  expect(content).toContain("FORCE ROW LEVEL SECURITY");
  const grants = content.split("\n").filter((line) => line.startsWith("GRANT "));
  expect(grants).toEqual([
    "GRANT CONNECT ON DATABASE ci_acceptance_pilot TO ci_acceptance_app;",
    "GRANT USAGE ON SCHEMA public TO ci_acceptance_app;",
    'GRANT USAGE ON TYPE public."GeneratedDraftStatus" TO ci_acceptance_app;',
    'GRANT SELECT, INSERT, UPDATE ON TABLE public."GeneratedDraft" TO ci_acceptance_app;',
  ]);
});

it("marker construction matches runtime JSON ordering and cannot overwrite historical approval", () => {
  const content = sql("02-identity-marker");
  const expression = content.match(/expected := ([\s\S]*?);/)![1];
  const literals = [...expression.matchAll(/'([^']*)'/g)].map((m) => m[1]);
  const hash = checksum("fictional offline manifest, not an execution approval");
  const expected = literals.slice(0, 2).join("") + hash + literals[2];
  expect(expected).toBe(
    JSON.stringify({
      profile: "GITHUB_ACTIONS_SIMULATED",
      projectId: NEON_CI_TARGET.projectId,
      cohort: "pilot-20261019",
      actor: "ci-fixture-pilot-20261019",
      approvalHash: hash,
    }),
  );
  expect(content).toContain("CI_EXISTING_IDENTITY_MISMATCH");
  expect(content).toContain("NOT rolcanlogin");
  expect(content).not.toMatch(/UPDATE public\.|ON CONFLICT[\s\S]*DO UPDATE/i);
});
