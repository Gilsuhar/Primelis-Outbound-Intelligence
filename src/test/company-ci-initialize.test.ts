// @vitest-environment node
// Mock subprocess only: never executes psql, SQL, or a cloud request.
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { resolve } from "node:path";
import { beforeEach, expect, it, vi } from "vitest";
import { NEON_CI_TARGET } from "../../ci/company-acceptance/policy";
import {
  initializeReviewedPhase,
  requirePsqlTlsInfo,
} from "../../ci/company-acceptance/initialize";
const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
const info = (database = "neondb") =>
  `You are connected to database "${database}" as user "neondb_owner" on host "${NEON_CI_TARGET.host}" (address "127.0.0.1") at port "5432".\nSSL connection (protocol: TLSv1.3, cipher: TLS_AES_256_GCM_SHA384, compression: off, ALPN: postgresql)\n`;
const input = {
  phase: "00" as const,
  psqlPath: process.execPath,
  caPath: resolve("ci/company-acceptance/sql/README.md"),
  password: "fictional-only",
  verifiedOrganization: NEON_CI_TARGET.organizationId,
  verifiedProject: NEON_CI_TARGET.projectId,
  verifiedBranch: NEON_CI_TARGET.branchId,
  executionApproval: "INITIALIZE_SNOWY_ART_PILOT",
};
beforeEach(() => vi.clearAllMocks());
it.each([
  info().replace("TLSv1.3", "TLSv1.0"),
  info().replace(/^SSL connection.*$/m, ""),
  info().replace(NEON_CI_TARGET.host, "unrelated.neon.tech"),
  info("other_database"),
  info().replace('port "5432"', 'port "5433"'),
  info().replace('"neondb_owner"', '"other_role"'),
  "",
  "PSQL_VERIFY_FULL_SAME_SESSION",
])("rejects missing or mismatched same-session transport evidence", (text) => {
  expect(() => requirePsqlTlsInfo(text, "neondb")).toThrow("CI_INITIALIZATION_TLS_UNVERIFIED");
});
it("accepts only pinned identity with modern client TLS", () => {
  expect(() => requirePsqlTlsInfo(info(), "neondb")).not.toThrow();
  expect(() => requirePsqlTlsInfo(info(NEON_CI_TARGET.name), NEON_CI_TARGET.name)).not.toThrow();
});
it.each([true, false])(
  "sends reviewed SQL only after same-process verified conninfo: %s",
  async (valid) => {
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
    const result = initializeReviewedPhase(input);
    const assertion = valid
      ? expect(result).resolves.toEqual({ phase: "00", clientTls: "VERIFIED" })
      : expect(result).rejects.toThrow("CI_INITIALIZATION_TLS_UNVERIFIED");
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatch(/^\\conninfo\n\\echo CI_TLS_BOUNDARY_/);
    expect(writes[0]).not.toContain("\\i ");
    const marker = writes[0].split("\\echo ")[1].trim();
    child.stdout.write((valid ? info() : info("wrong")) + marker + "\r\n");
    if (valid) {
      expect(writes[1]).toBe(
        "\\set ci_client_tls_verified PSQL_VERIFY_FULL_SAME_SESSION\n\\i 00-create-database.sql\n",
      );
      child.emit("close", 0);
    } else expect(writes).toHaveLength(1);
    await assertion;
    const [executable, args, options] = mocks.spawn.mock.calls[0];
    expect(executable).toBe(input.psqlPath);
    expect(args).toContain("-X");
    expect(args.join(" ")).not.toContain(input.password);
    expect(options.env).toMatchObject({
      PGSSLMODE: "verify-full",
      PGGSSENCMODE: "disable",
      PGHOST: NEON_CI_TARGET.host,
      PGDATABASE: "neondb",
      PGUSER: "neondb_owner",
    });
    expect(options.env.PGSERVICE).toBeUndefined();
    expect(options.env.PGHOSTADDR).toBeUndefined();
  },
);
it.each([
  { verifiedBranch: "other" },
  { verifiedProject: "other" },
  { verifiedOrganization: "other" },
  { executionApproval: "" },
  { password: "" },
  { phase: "02" },
])("denies unapproved target/phase before process startup", async (patch) => {
  await expect(initializeReviewedPhase({ ...input, ...patch } as typeof input)).rejects.toThrow(
    "CI_INITIALIZATION_INPUT_DENIED",
  );
  expect(mocks.spawn).not.toHaveBeenCalled();
});
