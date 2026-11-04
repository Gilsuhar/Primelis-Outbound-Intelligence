import { approvedAuthUserId, approvedEmail } from "./bind-profile.mjs";
import { runtimeAccessQuery, runtimeAccessFailures } from "./runtime-access.mjs";

// Acceptance component for a separately authorized real runtime connection.
// No CLI, credential reader, client construction, activation or write capability.
// The caller MUST construct Prisma 5.22.0 with the application's runtimeDatabaseUrl
// guard and pinned CA, after the independent administrative fingerprint audit.
export const runtimeSessionQuery = `SELECT
  current_database()='postgres' AS database_match,
  session_user='recycler_preview_app' AND current_user='recycler_preview_app' AS role_match,
  current_setting('transaction_read_only')='on' AS transaction_read_only,
  current_setting('default_transaction_read_only')='on' AS default_read_only,
  EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolcanlogin AND NOT
    (rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls)) AS attributes,
  NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS memberships,
  NOT has_database_privilege(current_user,current_database(),'CREATE,TEMPORARY,CONNECT WITH GRANT OPTION') AS database_privileges,
  NOT EXISTS(SELECT 1 FROM pg_namespace WHERE has_schema_privilege(current_user,oid,'CREATE')) AS schema_privileges,
  NOT EXISTS(SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass
    AND refobjid=(SELECT oid FROM pg_roles WHERE rolname=current_user) AND deptype='o') AS ownership,
  NOT EXISTS(SELECT 1 FROM pg_class WHERE CASE WHEN relkind='S'
    THEN has_sequence_privilege(current_user,oid,'USAGE,SELECT,UPDATE') ELSE false END) AS sequences,
  NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND has_schema_privilege(current_user,n.oid,'USAGE')
    AND has_function_privilege(current_user,p.oid,'EXECUTE')) AS routines,
  (SELECT array_agg(a.attname::text ORDER BY a.attname COLLATE "C") FROM pg_attribute a
    WHERE a.attrelid='public."User"'::regclass AND a.attnum>0 AND NOT a.attisdropped
    AND has_column_privilege(current_user,a.attrelid,a.attnum,'SELECT'))=ARRAY['authUserId','email','id','name','role']::text[] AS profile_columns,
  NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."User"'::regclass AND a.attnum>0 AND NOT a.attisdropped
    AND has_column_privilege(current_user,a.attrelid,a.attnum,'SELECT WITH GRANT OPTION')) AS grant_options,
  NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND (NOT c.relrowsecurity
      OR has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
      OR has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
      OR has_any_column_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,REFERENCES')
      OR has_any_column_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))) AS rls_api`;

const fields = ["database_match", "role_match", "transaction_read_only", "default_read_only", "attributes", "memberships",
  "database_privileges", "schema_privileges", "ownership", "sequences", "routines", "profile_columns", "grant_options", "rls_api"];
const fail = code => { throw new Error("PREVIEW_RUNTIME_VERIFY_" + code); };
const select = Object.freeze({ id: true, authUserId: true, email: true, name: true, role: true });
const matches = row => row && row.id === "preview-" + approvedAuthUserId && row.authUserId === approvedAuthUserId &&
  row.email === approvedEmail && row.role === "SALES_USER" && typeof row.name === "string" &&
  Object.keys(row).length === 5 && Object.keys(row).every(key => Object.hasOwn(select, key));

export const deniedRuntimeReads = Object.freeze([
  'SELECT "createdAt" FROM public."User" LIMIT 0',
  'SELECT * FROM public."User" LIMIT 0',
  'SELECT id FROM public."GeneratedDraft" LIMIT 0',
  'SELECT id FROM auth.users LIMIT 0',
]);

export async function verifyRuntimePrisma(client) {
  try {
    await client.$transaction(async tx => {
      const rows = await tx.$queryRawUnsafe(runtimeSessionQuery);
      if (!Array.isArray(rows) || rows.length !== 1 || fields.some(field => rows[0]?.[field] !== true)) fail("SESSION");
      if (runtimeAccessFailures(await tx.$queryRawUnsafe(runtimeAccessQuery)).length) fail("PRIVILEGES");
      // Exact production authentication lookup shape, restricted to five columns.
      const profile = await tx.user.findFirst({ where: { OR: [{ authUserId: approvedAuthUserId },
        { email: { equals: approvedEmail, mode: "insensitive" } }] }, select });
      if (!matches(profile)) fail("PROFILE");
      const visible = await tx.user.findMany({ select });
      if (!Array.isArray(visible) || visible.length !== 1 || !matches(visible[0])) fail("VISIBLE_PROFILES");
      const unrelated = await tx.user.findFirst({ where: { OR: [{ authUserId: "00000000-0000-0000-0000-000000000000" },
        { email: { equals: "unapproved@example.invalid", mode: "insensitive" } }] }, select });
      if (unrelated !== null) fail("UNAUTHORIZED_PROFILE");
    }, { timeout: 15000, maxWait: 5000 });
    // Each permission-denied SELECT aborts its transaction. Never continue in it.
    for (const query of deniedRuntimeReads) {
      let denied = false;
      let probeStarted = false;
      try {
        await client.$transaction(async tx => {
          const rows = await tx.$queryRawUnsafe(runtimeSessionQuery);
          if (!Array.isArray(rows) || rows.length !== 1 || fields.some(field => rows[0]?.[field] !== true)) fail("SESSION");
          probeStarted = true;
          await tx.$queryRawUnsafe(query);
        }, { timeout: 15000, maxWait: 5000 });
      } catch (error) {
        if (probeStarted && error?.code === "P2010" && error?.meta?.code === "42501") denied = true;
        else throw error;
      }
      if (!denied) fail("DENIED_READ_SUCCEEDED");
    }
    return { status: "RUNTIME_PRISMA_VERIFIED", visibleProfiles: 1, allowedColumns: 5, deniedReads: deniedRuntimeReads.length,
      writePrivileges: "DENIED", readOnly: "VERIFIED" };
  } catch (error) {
    const code = /^PREVIEW_RUNTIME_VERIFY_(?:SESSION|PRIVILEGES|PROFILE|VISIBLE_PROFILES|UNAUTHORIZED_PROFILE|DENIED_READ_SUCCEEDED)$/.test(error?.message ?? "")
      ? error.message : "PREVIEW_RUNTIME_VERIFY_CONNECTION_OR_QUERY";
    // Prisma errors can include the query, host, username or connection details.
    throw new Error(code);
  }
}
