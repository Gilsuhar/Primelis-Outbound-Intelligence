import { readFileSync } from "node:fs";
const target = JSON.parse(readFileSync(new URL("./verified-target.json", import.meta.url), "utf8"));

// One fixed SELECT; no SET ROLE, SET SESSION AUTHORIZATION, set_config or application data.
export const identityQuery = "SELECT current_database()::text AS database, session_user::text AS operator, " +
  "current_user::text AS effective_role, " +
  "pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(system_identifier::text, 'UTF8')), 'hex') AS fingerprint, " +
  "current_setting('transaction_read_only') AS read_only, " +
  "current_setting('default_transaction_read_only') AS default_read_only, " +
  "(SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=session_user) AS session_superuser, " +
  "(SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user) AS effective_superuser " +
  "FROM pg_catalog.pg_control_system()";

const conditions = Object.freeze([
  "IDENTITY_RESULT_COUNT", "IDENTITY_ROW_SHAPE", "DATABASE_NAME", "SESSION_USER", "CLUSTER_FINGERPRINT",
  "TRANSACTION_READ_ONLY", "EFFECTIVE_ROLE", "SESSION_ROLE_NOT_SUPERUSER", "EFFECTIVE_ROLE_NOT_SUPERUSER",
  "DEFAULT_TRANSACTION_READ_ONLY",
]);
const readOnlyConditions = new Set(["TRANSACTION_READ_ONLY", "DEFAULT_TRANSACTION_READ_ONLY"]);

/** Fixed identifiers only, even when handed an untrusted error object. */
export function sanitizedConditions(value) {
  return Array.isArray(value) ? conditions.filter(id => value.includes(id)) : [];
}

export function failedIdentityConditions(rows) {
  if (!Array.isArray(rows) || rows.length !== 1) return ["IDENTITY_RESULT_COUNT"];
  const row = rows[0];
  if (!row || typeof row !== "object" || Array.isArray(row)) return ["IDENTITY_ROW_SHAPE"];
  const checks = [
    ["DATABASE_NAME", row.database === "postgres"],
    ["SESSION_USER", row.operator === "postgres"],
    ["CLUSTER_FINGERPRINT", row.fingerprint === target.clusterFingerprint],
    ["TRANSACTION_READ_ONLY", row.read_only === "on"],
    ["EFFECTIVE_ROLE", row.effective_role === "postgres"],
    ["SESSION_ROLE_NOT_SUPERUSER", row.session_superuser === false],
    ["EFFECTIVE_ROLE_NOT_SUPERUSER", row.effective_superuser === false],
    ["DEFAULT_TRANSACTION_READ_ONLY", row.default_read_only === "on"],
  ];
  return checks.filter(([, passes]) => !passes).map(([id]) => id);
}

export function assertPreviewIdentity(rows) {
  const failedConditions = failedIdentityConditions(rows);
  if (!failedConditions.length) return;
  const onlyReadOnly = failedConditions.every(id => readOnlyConditions.has(id));
  throw Object.assign(new Error(onlyReadOnly ? "PREVIEW_SETUP_READ_ONLY_REJECTED" : "PREVIEW_SETUP_TARGET_REJECTED"), {
    stage: onlyReadOnly ? "READ_ONLY" : "IDENTITY", category: "CHECK_FAILED", failedConditions,
  });
}
