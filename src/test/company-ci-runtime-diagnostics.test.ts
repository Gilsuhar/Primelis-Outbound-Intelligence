// @vitest-environment node
// Fictional process results only. No psql, Neon, GitHub, or credential access.
import { existsSync, readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import {
  diagnoseActivationTransaction,
  psqlErrorCode,
  RuntimeDiagnostics,
  runtimeStages,
} from "../../ci/company-acceptance/runtime-diagnostics";
import { requirePsqlTlsInfo } from "../../ci/company-acceptance/initialize";
import { NEON_CI_TARGET } from "../../ci/company-acceptance/policy";

const fictionalSecret = "FICTIONAL_SECRET_MUST_NEVER_APPEAR";
const info =
  `You are connected to database "${NEON_CI_TARGET.name}" as user "neondb_owner" on host "${NEON_CI_TARGET.host}" at port "5432".\n` +
  "SSL connection (protocol: TLSv1.3, cipher: TLS_AES_256_GCM_SHA384, compression: off)\n";
const statement = `ALTER ROLE ci_acceptance_app LOGIN PASSWORD '${fictionalSecret}';`;

function fixture(options: {
  acknowledgements?: number;
  status?: number | null;
  stderr?: string;
  error?: unknown;
  transport?: string;
  corrupt?: boolean;
} = {}) {
  const audit = new RuntimeDiagnostics();
  const execute = vi.fn((script: string) => {
    const markers = script.split("\n").filter((line) => line.startsWith("\\echo "))
      .map((line) => line.slice(6));
    if (options.corrupt) markers.reverse();
    return {
      stdout: (options.transport ?? info) +
        markers.slice(0, options.acknowledgements ?? 4).join("\r\n") + "\r\n",
      stderr: options.stderr ?? "",
      status: options.status === undefined ? 0 : options.status,
      error: options.error,
    };
  });
  const run = () => diagnoseActivationTransaction({
    audit, statement, execute,
    verifyTransport: (text) => requirePsqlTlsInfo(text, NEON_CI_TARGET.name),
  });
  return { audit, execute, run };
}

it("acknowledges statement and commit separately in one unchanged transaction", () => {
  const { audit, run, execute } = fixture();
  run();
  expect(execute).toHaveBeenCalledTimes(1);
  const script = execute.mock.calls[0][0];
  const plainSql = script.split("\n").filter((line) => !line.startsWith("\\echo ")).join("\n");
  expect(plainSql).toBe(
    "BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='20s';\n" +
    statement + "\nCOMMIT;\n",
  );
  expect(audit.snapshot()).toEqual({
    entries: ["ACTIVATION_TRANSPORT", "TRANSACTION_BEGIN", "SQL_EXECUTION", "TRANSACTION_COMMIT"]
      .map((stage) => ({ stage, outcome: "PASSED" })),
  });
  expect(JSON.stringify(audit.snapshot())).not.toContain(fictionalSecret);
});

it.each([
  [1, "TRANSACTION_BEGIN"],
  [2, "SQL_EXECUTION"],
  [3, "TRANSACTION_COMMIT"],
] as const)("attributes XX000 after %i acknowledgements to %s", (acknowledgements, stage) => {
  const { audit, execute, run } = fixture({
    acknowledgements, status: 3,
    stderr: `ERROR:  XX000\nCONTEXT: ${statement}\nDETAIL: ${fictionalSecret}\n`,
  });
  expect(run).toThrow(`CI_RUNTIME_${stage}_POSTGRES_ERROR_XX000`);
  expect(execute).toHaveBeenCalledTimes(1); // no automatic retry
  expect(audit.snapshot().failure).toEqual({
    stage, outcome: "FAILED", reason: "POSTGRES_ERROR", sqlstate: "XX000",
  });
  expect(audit.snapshot().entries).not.toContainEqual({ stage, outcome: "PASSED" });
  expect(JSON.stringify(audit.snapshot())).not.toMatch(/FICTIONAL|ALTER ROLE|PASSWORD|DETAIL|CONTEXT/);
});

it.each(runtimeStages)("bounds and sanitizes synchronous failure at %s", (stage) => {
  const audit = new RuntimeDiagnostics();
  const error = Object.assign(new Error(fictionalSecret), {
    code: "42501", detail: statement, query: statement, parameters: [fictionalSecret],
  });
  expect(() => audit.sync(stage, () => { throw error; })).toThrow(
    `CI_RUNTIME_${stage}_POSTGRES_ERROR_42501`,
  );
  expect(audit.snapshot().failure).toEqual({
    stage, outcome: "FAILED", reason: "POSTGRES_ERROR", sqlstate: "42501",
  });
  expect(JSON.stringify(audit.snapshot())).not.toContain(fictionalSecret);
});

it.each(["RESTRICTED_CONNECTIVITY", "RESTRICTED_IDENTITY_VERIFICATION"] as const)(
  "sanitizes async failure and does not proceed after %s",
  async (stage) => {
    const audit = new RuntimeDiagnostics();
    const later = vi.fn();
    await expect((async () => {
      await audit.run(stage, async () => {
        throw Object.assign(new Error(fictionalSecret), { code: "08006", cause: statement });
      });
      later();
    })()).rejects.toThrow(`CI_RUNTIME_${stage}_POSTGRES_ERROR_08006`);
    expect(later).not.toHaveBeenCalled();
    expect(JSON.stringify(audit.snapshot())).not.toContain(fictionalSecret);
  },
);

it("records successful async checks without retaining returned connection objects", async () => {
  const audit = new RuntimeDiagnostics();
  const value = { password: fictionalSecret };
  expect(await audit.run("RESTRICTED_CONNECTIVITY", async () => value)).toBe(value);
  expect(audit.snapshot()).toEqual({
    entries: [{ stage: "RESTRICTED_CONNECTIVITY", outcome: "PASSED" }],
  });
});

it.each([
  new Error(fictionalSecret),
  new Error(`CI_${fictionalSecret}`),
  { code: "P1001", meta: { database_error: statement } },
  { code: "XX000\n" + fictionalSecret },
  { code: "00000" },
  { message: "CI_RUNTIME_SQLSTATE_XX000 " + fictionalSecret },
])("drops raw errors, driver metadata and invalid SQLSTATE representations", (error) => {
  const audit = new RuntimeDiagnostics();
  expect(() => audit.sync("RESTRICTED_CONNECTIVITY", () => { throw error; })).toThrow(
    "CI_RUNTIME_RESTRICTED_CONNECTIVITY_STAGE_FAILED",
  );
  expect(audit.snapshot().failure?.sqlstate).toBeUndefined();
  expect(JSON.stringify(audit.snapshot())).not.toContain(fictionalSecret);
});

it("retains the original failure when safety recovery also fails", () => {
  const audit = new RuntimeDiagnostics();
  expect(() => audit.sync("TRANSACTION_COMMIT", () => {
    throw new Error("CI_RUNTIME_SQLSTATE_XX000");
  })).toThrow();
  expect(() => audit.sync("SAFETY_RELOCK", () => {
    throw { code: "08006", detail: fictionalSecret };
  })).toThrow();
  expect(audit.snapshot().failure?.stage).toBe("TRANSACTION_COMMIT");
  expect(audit.snapshot().entries.at(-1)?.stage).toBe("SAFETY_RELOCK");
});

it.each([
  { acknowledgements: 0 },
  { acknowledgements: 1 },
  { acknowledgements: 2 },
  { acknowledgements: 3 },
  { corrupt: true },
  { status: null, error: new Error(fictionalSecret) },
  { status: 1 },
  { stderr: "ERROR:  XX000\n" }, // contradictory zero process status
  { stderr: fictionalSecret.repeat(20000) },
  { transport: info.replace(NEON_CI_TARGET.host, "unrelated.neon.tech") },
  { transport: info.replace(NEON_CI_TARGET.name, "other_database") },
  { transport: info.replace("TLSv1.3", "TLSv1.0") },
  { transport: info.split("\n")[0] + "\n" },
  { transport: "", stderr: "FATAL:  28000\n", status: 2 },
])("fails closed on missing acknowledgements, transport or process uncertainty", (options) => {
  const { run, audit } = fixture(options);
  expect(run).toThrow(/^CI_RUNTIME_/);
  expect(audit.snapshot().failure).toBeDefined();
  expect(JSON.stringify(audit.snapshot())).not.toContain(fictionalSecret);
});

it("sanitizes thrown process failures before any acknowledgement", () => {
  const audit = new RuntimeDiagnostics();
  expect(() => diagnoseActivationTransaction({
    audit, statement,
    execute: () => { throw new Error(fictionalSecret); },
    verifyTransport: () => { throw new Error("must not run"); },
  })).toThrow("CI_RUNTIME_ACTIVATION_TRANSPORT_PROCESS_FAILED");
});

it.each([
  ["ERROR:  XX000\n", "XX000"],
  ["psql:<stdin>:7: ERROR:  42501\r\n", "42501"],
  ["FATAL:  28000\n", "28000"],
  ["ERROR:  XX000\nDETAIL: " + fictionalSecret, "XX000"],
  ["ERROR:  " + fictionalSecret, undefined],
  ["ERROR:  XX000 " + fictionalSecret, undefined],
  ["ERROR:  00000\n", undefined],
  ["CONTEXT: ERROR:  XX000\n", undefined],
])("extracts only a bounded standalone SQLSTATE", (stderr, expected) => {
  expect(psqlErrorCode(stderr as string)).toBe(expected);
});

it("bounds the audit and returns detached snapshots", () => {
  const audit = new RuntimeDiagnostics();
  for (let i = 0; i < 32; i++) audit.passed("REPOSITORY_PREFLIGHT");
  expect(() => audit.passed("REPOSITORY_PREFLIGHT")).toThrow("AUDIT_LIMIT");
  const copy = audit.snapshot();
  copy.entries.length = 0;
  expect(audit.snapshot().entries).toHaveLength(32);
});

// The private operational helper is deliberately outside the publication inputs.
it.runIf(existsSync("outputs/company-ci/runtime-handoff.cjs"))("wires the existing local operator helper, preserving hard stops and transport options", () => {
  // Read source only; never import or execute the activation entry point.
  const helper = readFileSync("outputs/company-ci/runtime-handoff.cjs", "utf8");
  for (const stage of runtimeStages.filter((s) =>
    !["ACTIVATION_TRANSPORT", "TRANSACTION_BEGIN", "SQL_EXECUTION", "TRANSACTION_COMMIT"].includes(s)))
    expect(helper).toContain(`'${stage}'`);
  expect(helper).toContain("reviewed.diagnoseActivationTransaction(");
  expect(helper).toContain("CI_EXISTING_REPOSITORY_SECRETS_STOP");
  expect(helper).toContain("PGSSLMODE:'verify-full'");
  expect(helper).toContain("PGSSLROOTCERT:caPath");
  expect(helper).toContain("'ON_ERROR_STOP=1'");
  expect(helper).toContain("'VERBOSITY=sqlstate'");
  expect(helper).toContain("ALTER ROLE ci_acceptance_app NOLOGIN PASSWORD NULL");
  expect(helper).toContain("report.diagnostics=diagnostics?.snapshot()");
  expect(helper).not.toContain("report.code=/^CI_");
});
