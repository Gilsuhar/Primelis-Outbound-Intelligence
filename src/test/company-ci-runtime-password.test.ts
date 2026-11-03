// @vitest-environment node
import { expect, it } from "vitest";
import { privateRuntimePasswordStatement, runtimePasswordLoggingPreflightSql,
  requireRuntimePasswordLoggingPreflight } from "../../ci/company-acceptance/runtime-password";
import { RuntimeDiagnostics, diagnoseActivationTransaction } from "../../ci/company-acceptance/runtime-diagnostics";

const fictional = "Fictional_Only_Not_A_Credential_".padEnd(64, "X");
// Non-sensitive managed-setting fixture; no credentials and no live connection.
const settings = {
  log_statement: "none", log_min_duration_statement: "-1",
  log_min_duration_sample: "-1", log_transaction_sample_rate: "0",
  log_duration: "off", log_min_error_statement: "panic",
  log_min_messages: "warning", log_parameter_max_length: "-1",
  log_parameter_max_length_on_error: "0", password_encryption: "scram-sha-256",
  "pgaudit.log": null, "auto_explain.log_min_duration": null,
};
const fixture = (overrides: Record<string, unknown> = {}) => ({
  settings: Object.entries({ ...settings, ...overrides }).map(([name, value]) => ({ name, value })),
});

it.each([null, undefined, {}, { permitted: true }, [], { settings: null },
  { settings: "safe" }, { settings: [] }, { ...fixture(), extra: "unexpected" },
  { settings: [...fixture().settings, fixture().settings[0]] },
  { settings: fixture().settings.slice(1) },
  { settings: fixture().settings.map((v, i) => i === 0 ? { ...v, extra: true } : v) },
  { settings: fixture().settings.map((v, i) => i === 0 ? fixture().settings[1] : v) },
  { settings: fixture().settings.map((v, i) => i === 0 ? null : v) },
  { settings: fixture().settings.map((v, i) => i === 0 ? { name: "unknown", value: "none" } : v) },
])(
  "rejects malformed/incomplete logging responses without echoing them: case %#", (value) => {
    expect(() => requireRuntimePasswordLoggingPreflight(value))
      .toThrow(/^CI_CREDENTIAL_LOGGING_PREFLIGHT_DENIED$/);
  },
);
it("accepts effective managed settings without requiring or modifying privileges", () => {
  expect(() => requireRuntimePasswordLoggingPreflight(fixture())).not.toThrow();
  expect(runtimePasswordLoggingPreflightSql).toContain("BEGIN READ ONLY;");
  expect(runtimePasswordLoggingPreflightSql).toContain("ROLLBACK;");
  expect(runtimePasswordLoggingPreflightSql).not.toMatch(/ALTER|GRANT|set_config|SET LOCAL|has_parameter_privilege/);
});
it.each(Object.keys(settings).filter((name) => !name.includes(".")))(
  "fails closed when required %s is inaccessible", (name) => {
    for (const value of [null, undefined, "", 0, true, {}, ["none"]])
      expect(() => requireRuntimePasswordLoggingPreflight(fixture({ [name]: value })))
        .toThrow(/^CI_CREDENTIAL_LOGGING_PREFLIGHT_DENIED$/);
  },
);
it.each([
  ["log_statement", "ddl"], ["log_statement", "mod"], ["log_statement", "all"],
  ["log_min_duration_statement", "0"], ["log_min_duration_statement", "500"],
  ["log_min_duration_sample", "0"], ["log_min_duration_sample", "500"],
  ["log_transaction_sample_rate", "0.1"], ["log_transaction_sample_rate", "1"],
  ["log_duration", "on"], ["log_min_error_statement", "error"],
  ["log_min_error_statement", "fatal"], ["log_min_messages", "debug5"],
  ["log_parameter_max_length_on_error", "-1"], ["password_encryption", "md5"],
  ["pgaudit.log", "all"], ["pgaudit.log", "role"], ["pgaudit.log", ""],
  ["auto_explain.log_min_duration", "0"], ["auto_explain.log_min_duration", "10"],
])("rejects unsafe effective %s=%s even if an operator could SET it", (name, value) => {
  expect(() => requireRuntimePasswordLoggingPreflight(fixture({ [name]: value })))
    .toThrow(/^CI_CREDENTIAL_LOGGING_PREFLIGHT_DENIED$/);
});
it("accepts explicitly inactive optional extensions but not missing response fields", () => {
  expect(() => requireRuntimePasswordLoggingPreflight(fixture({
    "pgaudit.log": "none", "auto_explain.log_min_duration": "-1",
  }))).not.toThrow();
  expect(() => requireRuntimePasswordLoggingPreflight(fixture({ "pgaudit.log": undefined }))).toThrow();
});

it("delivers the exact unhashed value only to the fixed restricted role", () => {
  const sql = privateRuntimePasswordStatement(fictional);
  expect(sql.split("\n").at(-1)).toBe(`ALTER ROLE ci_acceptance_app LOGIN PASSWORD '${fictional}';`);
  expect(sql.split(fictional)).toHaveLength(2);
  expect(sql).not.toContain("SCRAM-SHA-256$");
  expect(sql).toContain("current_setting('password_encryption', true) IN ('scram-sha-256')");
});

it.each(["", "short", "a".repeat(63), "a".repeat(65), "'".repeat(64),
  "\\".repeat(64), "\n".repeat(64), " ".repeat(64), "SCRAM-SHA-256$4096:FICTIONAL"])(
  "rejects malformed or prehashed input without echoing it: case %#", (value) => {
    expect(() => privateRuntimePasswordStatement(value)).toThrow(/^CI_RUNTIME_PASSWORD_FORMAT_DENIED$/);
  },
);

it("rechecks every effective setting on the actual connection before the credential, without changing logging", () => {
  const sql = privateRuntimePasswordStatement(fictional);
  const prefix = sql.slice(0, sql.indexOf("ALTER ROLE"));
  for (const [name, value] of Object.entries(settings)) {
    const read = `current_setting('${name}', true)`;
    expect(runtimePasswordLoggingPreflightSql).toContain(read);
    expect(prefix).toContain(read);
    if (value === null) expect(prefix).toContain(`${read} IS NULL OR`);
    else expect(prefix).not.toContain(`${read} IS NULL OR`);
  }
  expect(prefix).toContain("IF NOT coalesce((");
  expect(prefix).toContain("), false)");
  expect(prefix).toContain("ERRCODE = '42501'");
  expect(prefix).not.toContain(fictional);
  expect(sql).not.toMatch(/ALTER SYSTEM|GRANT|DISABLE|SET |set_config|has_parameter_privilege/);
});

it.each([["SQL_EXECUTION", 2, "42501"], ["TRANSACTION_COMMIT", 3, "XX000"]] as const)(
  "keeps credential-bearing server output out of the %s audit", (stage, count, code) => {
    const audit = new RuntimeDiagnostics();
    let caught: unknown;
    try {
      diagnoseActivationTransaction({
        audit,
        statement: privateRuntimePasswordStatement(fictional),
        verifyTransport: () => {}, // Fictional process; actual TLS tested separately.
        execute: (script) => ({
          status: 3,
          stdout: script.split("\n").filter((l) => l.startsWith("\\echo "))
            .slice(0, count).map((l) => l.slice(6)).join("\n") + "\n",
          stderr: `ERROR:  ${code}\nDETAIL: ${fictional}\nCONTEXT: ${script}`,
        }),
      });
    } catch (e) { caught = e; }
    expect(audit.snapshot().failure).toMatchObject({ stage, sqlstate: code });
    expect(String(caught)).not.toContain(fictional);
    expect(JSON.stringify(audit.snapshot())).not.toContain(fictional);
  },
);
