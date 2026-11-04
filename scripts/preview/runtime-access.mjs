// Independent SELECT-only evidence check for the future post-provisioning audit.
// Caller must supply an identity-verified administrative read-only transaction.
// Object flags include PostgreSQL PUBLIC/inherited ACLs; never infer them from direct grants.
export const runtimeAccessQuery = "SELECT " +
  "has_schema_privilege('recycler_preview_app',n.oid,'USAGE') AS schema_usage, " +
  "has_table_privilege('recycler_preview_app',c.oid,'SELECT') AS table_read, " +
  "(has_table_privilege('recycler_preview_app',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') " +
  "OR has_any_column_privilege('recycler_preview_app',c.oid,'INSERT,UPDATE,REFERENCES')) AS object_write, " +
  "EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped " +
  "AND has_column_privilege('recycler_preview_app',c.oid,a.attnum,'SELECT') " +
  "AND NOT(c.oid='public.\"User\"'::regclass AND a.attname IN ('id','authUserId','email','name','role'))) AS unexpected_column_read, " +
  "EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='recycler_preview_app') " +
  "OR roleid=(SELECT oid FROM pg_roles WHERE rolname='recycler_preview_app')) AS memberships " +
  "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace " +
  "WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND c.relkind IN ('r','p','v','m','f')";

/** Accept only complete boolean catalog evidence; no names/data/ACL values in reports. */
export function runtimeAccessFailures(rows) {
  const fields = ["schema_usage", "table_read", "object_write", "unexpected_column_read", "memberships"];
  if (!Array.isArray(rows) || rows.length === 0 || rows.some(row =>
    !row || fields.some(field => typeof row[field] !== "boolean"))) return ["ACCESS_EVIDENCE_INCOMPLETE"];
  const failed = new Set();
  for (const row of rows) {
    if (row.memberships) failed.add("ROLE_MEMBERSHIPS");
    if (row.schema_usage && (row.table_read || row.unexpected_column_read)) failed.add("UNEXPECTED_EFFECTIVE_READ");
    if (row.schema_usage && row.object_write) failed.add("UNEXPECTED_EFFECTIVE_WRITE");
  }
  return [...failed];
}

export async function inspectRuntimeAccess(reader) {
  return runtimeAccessFailures(await reader.$queryRawUnsafe(runtimeAccessQuery));
}
