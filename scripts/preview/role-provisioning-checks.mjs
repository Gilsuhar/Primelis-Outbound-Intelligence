// Catalog-only checks. No application rows, secret fields, role changes or SQL execution here.
export const provisioningChecks = Object.freeze([
  ["CREATE_ROLE_AUTHORITY", "(SELECT rolcreaterole OR rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user)"],
  ["IDENTITY_GRANT_AUTHORITY", "has_function_privilege(current_user,'pg_catalog.pg_control_system()','EXECUTE WITH GRANT OPTION')"],
  ["AUTH_SCHEMA_GRANT_AUTHORITY", "has_schema_privilege(current_user,'auth','USAGE WITH GRANT OPTION')"],
  ["AUTH_COLUMN_GRANT_AUTHORITY", "has_column_privilege(current_user,'auth.users','id','SELECT WITH GRANT OPTION')"],
  ["AUTH_POLICY_AUTHORITY", "pg_has_role(current_user,(SELECT relowner FROM pg_catalog.pg_class WHERE oid='auth.users'::regclass),'USAGE')"],
  ["AUTH_ID_NOT_NULL", "(SELECT attnotnull FROM pg_catalog.pg_attribute WHERE attrelid='auth.users'::regclass AND attname='id' AND attnum>0 AND NOT attisdropped)"],
  ["TEMP_REVOKE_AUTHORITY", "has_database_privilege(current_user,current_database(),'TEMPORARY WITH GRANT OPTION')"],
  ["NO_PUBLIC_SCHEMA_CREATE", "NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE a.grantee=0 AND a.privilege_type='CREATE')"],
  // Mirrors the existing strict no_user_functions guard, including non-invocable routines.
  // Do not mislabel every EXECUTE ACL as an exploitable function; review changes separately.
  ["PUBLIC_ROUTINES_CLEARED", "NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE' AND n.nspname NOT IN ('pg_catalog','information_schema'))"],
]);

export const provisioningAuditQuery = "SELECT " + provisioningChecks.map(([id, expression]) => `(${expression}) AS "${id}"`).join(", ");

export function failedProvisioningChecks(rows) {
  if (!Array.isArray(rows) || rows.length !== 1 || !rows[0] || typeof rows[0] !== "object") return ["PROVISIONING_RESULT_SHAPE"];
  return provisioningChecks.filter(([id]) => rows[0][id] !== true).map(([id]) => id);
}
