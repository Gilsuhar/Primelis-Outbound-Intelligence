// @vitest-environment node
// Fictional approvals and mocked psql only. No SQL or network execution.
import { readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { resolve } from "node:path";
import { beforeEach, expect, it, vi } from "vitest";
import { type Approval, checksum, NEON_CI_TARGET } from "../../ci/company-acceptance/policy";
import { initializeReviewedPhase } from "../../ci/company-acceptance/initialize";
import {
  PHASE02_BINDING,
  PHASE02_EXECUTION_APPROVAL,
  requirePhase02Approval,
} from "../../ci/company-acceptance/phase02-approval";

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), sqlDrift: false }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    readFileSync: (...args: Parameters<typeof actual.readFileSync>) => {
      const result = actual.readFileSync(...args);
      return mocks.sqlDrift && String(args[0]).endsWith("02-identity-marker.sql")
        ? result + "\n-- drift"
        : result;
    },
  };
});
const candidateRaw = readFileSync("ci/company-acceptance/approval.candidate.json", "utf8");
function fixture(): Approval {
  return {
    ...JSON.parse(candidateRaw),
    enabled: true,
    approvedAt: new Date(Date.now() - 60000).toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    approvalId: "fictional-offline-approval-not-human-consent",
    setupManualInterventions: 1,
    evidence: {
      privateRepository: "fictional-offline-only",
      noVercelIntegration: "fictional-offline-only",
      actionsPaidUsageBlocked: "fictional-offline-only",
      isolatedDatabaseAndGrants: "fictional-offline-only",
    },
  };
}
function input(raw = JSON.stringify(fixture())) {
  return {
    phase: "02" as const,
    psqlPath: process.execPath,
    caPath: resolve("ci/company-acceptance/sql/README.md"),
    password: "fictional-only",
    verifiedOrganization: NEON_CI_TARGET.organizationId,
    verifiedProject: NEON_CI_TARGET.projectId,
    verifiedBranch: NEON_CI_TARGET.branchId,
    executionApproval: PHASE02_EXECUTION_APPROVAL,
    approvalRaw: raw,
    approvalSha256: checksum(raw),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.sqlDrift = false;
});

it("keeps the real bound candidate disabled and rejects it even with its correct hash", async () => {
  const candidate = JSON.parse(candidateRaw);
  for (const key of ["repository", "repositoryId", "ownerId", "cohort", "actor"] as const)
    expect(candidate[key]).toBe(PHASE02_BINDING[key]);
  expect(candidate.enabled).toBe(false);
  expect(candidate.database.policySha256).toBe(PHASE02_BINDING.policySha256);
  expect(candidate.approvedAt).toBeNull();
  expect(candidate.expiresAt).toBeNull();
  expect(candidate.approvalId).toBeNull();
  await expect(initializeReviewedPhase(input(candidateRaw))).rejects.toThrow(
    "CI_PHASE02_MANIFEST_INVALID",
  );
  expect(mocks.spawn).not.toHaveBeenCalled();
});

it("refuses changed Phase 02 SQL before any subprocess starts", async () => {
  mocks.sqlDrift = true;
  await expect(initializeReviewedPhase(input())).rejects.toThrow("CI_INITIALIZATION_SQL_CHANGED");
  expect(mocks.spawn).not.toHaveBeenCalled();
});

it("accepts the exact reviewed bytes of an explicitly simulated complete approval", () => {
  const raw = JSON.stringify(fixture(), null, 2) + "\n";
  expect(requirePhase02Approval(raw, checksum(raw))).toBe(checksum(raw));
  expect(() => requirePhase02Approval(raw.trimEnd(), checksum(raw))).toThrow(
    "CI_PHASE02_MANIFEST_INVALID",
  );
});

const mutations: [string, (a: Approval) => void][] = [
  [
    "repository",
    (a) => {
      a.repository = "Gilsuhar/other";
    },
  ],
  [
    "repository ID",
    (a) => {
      a.repositoryId = "1426200738";
    },
  ],
  [
    "owner",
    (a) => {
      a.ownerId = "123";
    },
  ],
  [
    "cohort",
    (a) => {
      a.cohort = "other-cohort";
    },
  ],
  [
    "actor",
    (a) => {
      a.actor = "ci-fixture-other-actor";
    },
  ],
  [
    "policy digest",
    (a) => {
      a.database.policySha256 = "a".repeat(64);
    },
  ],
];
it.each(mutations)(
  "rejects a validly shaped but unapproved %s before psql",
  async (_label, mutate) => {
    const a = fixture();
    mutate(a);
    await expect(initializeReviewedPhase(input(JSON.stringify(a)))).rejects.toThrow(
      "CI_PHASE02_BINDING_DENIED",
    );
    expect(mocks.spawn).not.toHaveBeenCalled();
  },
);

it.each([
  { enabled: false },
  { approvalId: null },
  { setupManualInterventions: null },
  { evidence: {} },
  { ref: "refs/heads/other" },
  { unknown: true },
  { limits: { ...fixture().limits, aiEnabled: true } },
  { limits: { ...fixture().limits, outbound: true } },
  { limits: { ...fixture().limits, jobs: 4 } },
  { database: { ...fixture().database, projectId: "other" } },
  { database: { ...fixture().database, branchId: "other" } },
  { database: { ...fixture().database, branchId: undefined } },
  { database: { ...fixture().database, name: "neondb" } },
  { database: { ...fixture().database, host: "unrelated.neon.tech" } },
  { database: { ...fixture().database, role: "neondb_owner" } },
])("rejects disabled, incomplete, insecure or unknown approval fields: %j", async (patch) => {
  await expect(
    initializeReviewedPhase(input(JSON.stringify({ ...fixture(), ...patch }))),
  ).rejects.toThrow("CI_PHASE02_MANIFEST_INVALID");
  expect(mocks.spawn).not.toHaveBeenCalled();
});

it.each(["", "{", " ".repeat(8193)])(
  "rejects missing, malformed and oversized files",
  async (raw) => {
    await expect(initializeReviewedPhase(input(raw))).rejects.toThrow(
      "CI_PHASE02_MANIFEST_INVALID",
    );
    expect(mocks.spawn).not.toHaveBeenCalled();
  },
);
it.each(["", "0".repeat(64), "a".repeat(64) + "\n\\i other.sql"])(
  "rejects incorrect/injectable digest",
  async (hash) => {
    await expect(initializeReviewedPhase({ ...input(), approvalSha256: hash })).rejects.toThrow(
      "CI_PHASE02_MANIFEST_INVALID",
    );
    expect(mocks.spawn).not.toHaveBeenCalled();
  },
);
it.each([
  { approvedAt: "2099-01-01T00:00:00Z", expiresAt: "2099-01-02T00:00:00Z" },
  { approvedAt: "2000-01-01T00:00:00Z", expiresAt: "2000-01-02T00:00:00Z" },
  { approvedAt: "2000-01-01T00:00:00Z", expiresAt: "2099-01-02T00:00:00Z" },
])("rejects future, expired and overlong approvals", async (patch) => {
  await expect(
    initializeReviewedPhase(input(JSON.stringify({ ...fixture(), ...patch }))),
  ).rejects.toThrow("CI_PHASE02_APPROVAL_EXPIRED");
  expect(mocks.spawn).not.toHaveBeenCalled();
});
it.each([
  { executionApproval: "INITIALIZE_SNOWY_ART_PILOT" },
  { executionApproval: "" },
  { verifiedOrganization: "other" },
  { verifiedProject: "other" },
  { verifiedBranch: "other" },
])("requires new phase-specific consent and the exact target", async (patch) => {
  await expect(initializeReviewedPhase({ ...input(), ...patch })).rejects.toThrow(
    "CI_INITIALIZATION_INPUT_DENIED",
  );
  expect(mocks.spawn).not.toHaveBeenCalled();
});

it.each(["valid", "wrong-database", "plaintext", "certificate-failure", "sql-failure"])(
  "gates only Phase 02 on same-session verified TLS: %s",
  async (scenario) => {
    const writes: string[] = [];
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: vi.fn(),
      stdin: new Writable({
        write(chunk, _encoding, done) {
          writes.push(chunk.toString());
          done();
        },
      }),
    });
    mocks.spawn.mockReturnValue(child);
    const request = input();
    const result = initializeReviewedPhase(request);
    const assertion =
      scenario === "valid"
        ? expect(result).resolves.toEqual({ phase: "02", clientTls: "VERIFIED" })
        : expect(result).rejects.toThrow(
            scenario === "certificate-failure"
              ? "CI_INITIALIZATION_FAILED"
              : scenario === "sql-failure"
                ? "CI_INITIALIZATION_SQLSTATE_42501"
                : "CI_INITIALIZATION_TLS_UNVERIFIED",
          );
    expect(writes).toHaveLength(1);
    expect(writes[0]).not.toContain("\\i ");
    const [, args, options] = mocks.spawn.mock.calls[0];
    expect(args).toContain(`approval_sha256=${request.approvalSha256}`);
    expect(args.join(" ")).not.toContain(request.password);
    expect(options.env).toMatchObject({
      PGDATABASE: NEON_CI_TARGET.name,
      PGHOST: NEON_CI_TARGET.host,
      PGSSLMODE: "verify-full",
      PGSSLMINPROTOCOLVERSION: "TLSv1.2",
    });
    if (scenario === "certificate-failure") {
      child.stderr.write("certificate verification failed (sensitive diagnostic omitted)");
      child.emit("close", 2);
      expect(writes).toHaveLength(1);
    } else {
      const marker = writes[0].split("\\echo ")[1].trim();
      const database = scenario === "wrong-database" ? "neondb" : NEON_CI_TARGET.name;
      const tls =
        scenario === "plaintext"
          ? ""
          : "SSL connection (protocol: TLSv1.3, cipher: TLS_AES_256_GCM_SHA384, compression: off)\n";
      child.stdout.write(
        `You are connected to database "${database}" as user "neondb_owner" on host "${NEON_CI_TARGET.host}" at port "5432".\n${tls}${marker}\n`,
      );
      if (["valid", "sql-failure"].includes(scenario)) {
        expect(writes[1]).toBe(
          "\\set ci_client_tls_verified PSQL_VERIFY_FULL_SAME_SESSION\n\\i 02-identity-marker.sql\n",
        );
        if (scenario === "sql-failure")
          child.stderr.write("ERROR: 42501 sensitive details omitted");
        child.emit("close", scenario === "valid" ? 0 : 3);
      } else expect(writes).toHaveLength(1);
    }
    await assertion;
  },
);
