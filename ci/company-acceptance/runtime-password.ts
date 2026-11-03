/**
 * Local operator procedure only. Never execute without separate approval.
 * Neon requires the unhashed password as input; TLS and server SCRAM storage
 * remain mandatory. The returned string is secret and must stay in memory/stdin.
 */
// One policy generates both the read-only preflight and same-connection guard.
// These are effective values, not authority to change managed settings.
const loggingPolicy: ReadonlyArray<{
  name: string; allowed: readonly string[]; optional?: boolean;
}> = [
  { name: "log_statement", allowed: ["none"] },
  { name: "log_min_duration_statement", allowed: ["-1"] },
  { name: "log_min_duration_sample", allowed: ["-1"] },
  { name: "log_transaction_sample_rate", allowed: ["0"] },
  { name: "log_duration", allowed: ["off"] },
  { name: "log_min_error_statement", allowed: ["panic"] },
  // Normal error messages are not SQL-text logging. Provider message contents
  // and inaccessible telemetry are NOT certified safe by this policy.
  { name: "log_min_messages", allowed: ["warning", "error", "log", "fatal", "panic"] },
  // This literal-SQL path uses no Bind values; related logging must be off.
  { name: "log_parameter_max_length", allowed: ["-1", "0"] },
  { name: "log_parameter_max_length_on_error", allowed: ["0"] },
  { name: "password_encryption", allowed: ["scram-sha-256"] },
  // NULL denotes an unregistered optional setting in the current session.
  { name: "pgaudit.log", allowed: ["none"], optional: true },
  { name: "auto_explain.log_min_duration", allowed: ["-1"], optional: true },
];
const currentSetting = (name: string) => `current_setting('${name}', true)`;
const loggingPredicate = loggingPolicy.map(({ name, allowed, optional }) => {
  const value = currentSetting(name);
  const accepted = `${value} IN (${allowed.map((v) => `'${v}'`).join(", ")})`;
  return `(${optional ? `${value} IS NULL OR ` : ""}${accepted})`;
}).join("\nAND ");

export const runtimePasswordLoggingPreflightSql = `
BEGIN READ ONLY;
SELECT json_build_object('settings', json_build_array(
${loggingPolicy.map(({ name }) =>
    `json_build_object('name', '${name}', 'value', ${currentSetting(name)})`).join(",\n")}
));
ROLLBACK;
`;

export function requireRuntimePasswordLoggingPreflight(value: unknown): void {
  const deny = (): never => { throw new Error("CI_CREDENTIAL_LOGGING_PREFLIGHT_DENIED"); };
  if (!value || typeof value !== "object" || Array.isArray(value) ||
    Object.keys(value).length !== 1) deny();
  const rows = (value as { settings?: unknown }).settings;
  if (!Array.isArray(rows) || rows.length !== loggingPolicy.length) deny();
  const seen = new Set<string>();
  for (const row of rows as unknown[]) {
    if (!row || typeof row !== "object" || Array.isArray(row)) deny();
    const item = row as { name?: unknown; value?: unknown };
    if (Object.keys(row as object).length !== 2 || typeof item.name !== "string") deny();
    const rule = loggingPolicy.find((p) => p.name === item.name);
    if (!rule || seen.has(item.name as string)) deny();
    seen.add(item.name as string);
    if (item.value === null && rule?.optional) continue;
    if (typeof item.value !== "string" || !rule?.allowed.includes(item.value)) deny();
  }
}

export function privateRuntimePasswordStatement(password: string): string {
  // Exactly the existing randomBytes(48).toString("base64url") representation.
  // No arbitrary operator input, SQL escaping ambiguity, CR/LF or psql commands.
  if (!/^[A-Za-z0-9_-]{64}$/.test(password))
    throw new Error("CI_RUNTIME_PASSWORD_FORMAT_DENIED");

  return [
    // psql ON_ERROR_STOP completes this separate, credential-free check on the
    // actual authenticated activation connection before sending ALTER ROLE.
    // Never SET logging options, disable audit extensions or grant privileges.
    "DO $guard$ BEGIN",
    `IF NOT coalesce((${loggingPredicate}), false)`,
    "THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'CI_CREDENTIAL_LOGGING_UNSAFE';",
    "END IF; END $guard$;",
    `ALTER ROLE ci_acceptance_app LOGIN PASSWORD '${password}';`,
  ].join("\n");
}
