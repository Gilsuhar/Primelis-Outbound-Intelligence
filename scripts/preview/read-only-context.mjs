import { identityQuery, failedIdentityConditions } from "./identity.mjs";
import { verificationError } from "./verification-errors.mjs";
import { verifiedCa, caPath } from "./tls-trust.mjs";

export const verificationRole = "recycler_preview_verify";
const reject = () => { throw Object.assign(new Error("PREVIEW_SETUP_READ_ONLY_REJECTED"), { stage: "READ_ONLY", category: "CHECK_FAILED" }); };

// Server-side defaults apply to every new backend, including the independent schema engine.
// An explicit transaction is additional protection, not a substitute for these defaults/ACLs.
export const privilegeQuery = `SELECT
  NOT (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls OR r.rolinherit) AS restricted_role,
  NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=r.oid) AS no_memberships,
  EXISTS (SELECT 1 FROM pg_catalog.pg_db_role_setting s WHERE s.setrole=r.oid AND s.setdatabase=0
    AND 'default_transaction_read_only=on'=ANY(s.setconfig) AND 'row_security=on'=ANY(s.setconfig)) AS login_defaults,
  NOT EXISTS (SELECT 1 FROM pg_catalog.pg_db_role_setting s WHERE s.setrole=r.oid AND s.setdatabase<>0) AS no_database_override,
  NOT has_database_privilege(current_user, current_database(), 'CREATE,TEMPORARY') AS no_database_writes,
  NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n WHERE has_schema_privilege(current_user,n.oid,'CREATE') OR n.nspowner=r.oid) AS no_schema_writes,
  NOT EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datdba=r.oid) AS no_database_ownership,
  NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c WHERE c.relowner=r.oid) AS no_relation_ownership,
  NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.proowner=r.oid) AS no_function_ownership,
  NOT EXISTS (SELECT 1 FROM pg_catalog.pg_shdepend d WHERE d.refclassid='pg_catalog.pg_authid'::regclass
    AND d.refobjid=r.oid AND d.deptype='o') AS no_owned_objects,
  NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c WHERE c.relkind IN ('r','p','v','m','f') AND
    (has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR
     has_any_column_privilege(current_user,c.oid,'INSERT,UPDATE,REFERENCES'))) AS no_table_writes,
  NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c WHERE c.relkind='S' AND has_sequence_privilege(current_user,c.oid,'USAGE,UPDATE')) AS no_sequence_writes,
  NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND has_function_privilege(current_user,p.oid,'EXECUTE')) AS no_user_functions,
  current_setting('row_security')='on' AS row_security_on
FROM pg_catalog.pg_roles r WHERE r.rolname=current_user`.replace(/\n/g, " ");

export const privilegeFields = Object.freeze(["restricted_role", "no_memberships", "login_defaults", "no_database_override",
  "no_database_writes", "no_schema_writes", "no_database_ownership", "no_relation_ownership", "no_function_ownership",
  "no_owned_objects", "no_table_writes", "no_sequence_writes", "no_user_functions", "row_security_on"]);

export function assertVerificationPrivileges(rows) {
  if (!Array.isArray(rows) || rows.length !== 1 || !rows[0] || privilegeFields.some(key => rows[0][key] !== true)) reject();
}

export function assertVerificationIdentity(rows) {
  if (!Array.isArray(rows) || rows.length !== 1 || !rows[0] || rows[0].operator !== verificationRole ||
      rows[0].effective_role !== verificationRole) throw verificationError(new Error("PREVIEW_SETUP_TARGET_REJECTED"), "IDENTITY");
  const failures = failedIdentityConditions(rows, verificationRole);
  if (failures.length) throw verificationError(Object.assign(new Error(failures.every(id => id.includes("READ_ONLY")) ?
    "PREVIEW_SETUP_READ_ONLY_REJECTED" : "PREVIEW_SETUP_TARGET_REJECTED"), { failedConditions: failures }), "IDENTITY");
}

/** Dedicated credential only. No administrator fallback or caller-provided startup overrides. */
export function verificationUrl(value) {
  verifiedCa();
  let url;
  try { url = new URL(value); } catch { reject(); }
  const ref = "txfxfrlhtvzwgluhnbpw";
  const direct = url.hostname === `db.${ref}.supabase.co` && url.username === verificationRole;
  const pooled = url.hostname === "aws-1-us-west-2.pooler.supabase.com" && url.username === `${verificationRole}.${ref}`;
  if (url.protocol !== "postgresql:" || (!direct && !pooled) || url.port !== "5432" || url.pathname !== "/postgres" ||
      !url.password || url.hash || url.searchParams.get("sslmode") !== "require" || url.searchParams.get("sslaccept") !== "strict" ||
      url.searchParams.get("sslcert") !== caPath || [...url.searchParams.keys()].sort().join(",") !== "sslaccept,sslcert,sslmode") reject();
  // Do not rely on pooler forwarding of options. No READ WRITE override is supplied to either engine.
  return url.toString();
}

/** All verification queries stay on the one connection pinned by Prisma's interactive transaction. */
export async function withReadOnlyContext(db, work) {
  return db.$transaction(async tx => {
    try {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      assertVerificationIdentity(await tx.$queryRawUnsafe(identityQuery));
      assertVerificationPrivileges(await tx.$queryRawUnsafe(privilegeQuery));
    } catch (error) { throw verificationError(error, error?.stage ?? "READ_ONLY"); }
    // Expose reads only, never transaction controls or model mutation methods.
    return work(Object.freeze({ $queryRawUnsafe: sql => {
      const syntax = sql.replace(/'(?:[^']|'')*'/g, "''").replace(/"(?:[^"]|"")*"/g, '""');
      if (!sql.startsWith("SELECT ") || /;|--|\/\*|\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|GRANT|REVOKE|TRUNCATE|COPY|CALL|DO|SET|INTO)\b/i.test(syntax)) reject();
      return tx.$queryRawUnsafe(sql);
    } }));
  }, { maxWait: 10000, timeout: 120000, isolationLevel: "RepeatableRead" });
}
