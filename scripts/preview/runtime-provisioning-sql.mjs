import { readFileSync } from "node:fs";
import { reviewedFiles } from "./verification.mjs";
import { runtimeAccessQuery } from "./runtime-access.mjs";
const target = JSON.parse(readFileSync(new URL("./verified-target.json", import.meta.url)));
const quote = value => `'${value.replaceAll("'", "''")}'`;
const guard = (name, condition) => `IF (${condition}) IS DISTINCT FROM true THEN RAISE EXCEPTION 'PREVIEW_ROLE_${name}'; END IF;`;

// Fixed, catalog/count-only checks. No caller SQL, identifiers or database values are interpolated.
// The checks execute in READ ONLY transactions. The role transaction is a separate reviewed file.
export function runtimeAuditSql(after = false) {
  return auditSql(after, null);
}

// Separate expected-delta audit; never reuses the role-creation or zero-Auth-user path.
export function bindingAuditSql(after = false) {
  return auditSql(true, after);
}

// Fixed activation phases. Preserve the existing binding/role audit outputs unchanged.
export function activationAuditSql(phase) {
  if (!["preflight", "before-password", "before-commit", "postcheck"].includes(phase))
    throw new Error("PREVIEW_ACTIVATION_PHASE");
  return auditSql(true, true, phase);
}

function auditSql(after, bindingAfter, activation = null) {
  const active = activation === "before-commit" || activation === "postcheck";
  const writable = activation === "before-password" || activation === "before-commit";
  const binding = bindingAfter !== null;
  const files = reviewedFiles(target.migrations, path => Buffer.from(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n")));
  const history = target.migrations.map(name => `(${quote(name)},${quote(files.hashes[`prisma/migrations/${name}/migration.sql`])})`).join(",");
  const checks = [
    ["IDENTITY", `current_database()='postgres' AND session_user='postgres' AND current_user='postgres'
      AND (SELECT NOT rolsuper FROM pg_roles WHERE rolname=current_user)
      AND (SELECT encode(sha256(convert_to(system_identifier::text,'UTF8')),'hex') FROM pg_control_system())=${quote(target.clusterFingerprint)}`],
    [writable ? "ACTIVATION_TRANSACTION" : "READ_ONLY", writable
      ? "current_setting('transaction_read_only')='off' AND current_setting('row_security')='off'"
      : "current_setting('transaction_read_only')='on' AND current_setting('default_transaction_read_only')='on' AND current_setting('row_security')='off'"],
    // pg_stat_ssl describes the pooler-to-backend leg, not the libpq-to-pooler leg.
    // Actual client TLS is gated by psql's local conninfo before any SQL is released.
    ["HISTORY", `(SELECT count(*) FROM public._prisma_migrations)=11 AND NOT EXISTS (
      SELECT 1 FROM public._prisma_migrations m FULL JOIN (VALUES ${history}) expected(name,checksum)
      ON m.migration_name=expected.name WHERE m.migration_name IS NULL OR expected.name IS NULL OR m.checksum IS DISTINCT FROM expected.checksum
      OR m.finished_at IS NULL OR m.rolled_back_at IS NOT NULL OR m.applied_steps_count IS DISTINCT FROM 1)`],
    ["TABLES", `(SELECT array_agg(c.relname::text ORDER BY c.relname COLLATE "C") FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p'))=ARRAY[${files.tables.map(quote).join(",")}]::text[]`],
    ["RLS_API", `NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND
      (NOT c.relrowsecurity OR has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
      OR has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
      OR has_any_column_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,REFERENCES')
      OR has_any_column_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,REFERENCES')))`],
    ["EMPTY_DATA", `NOT EXISTS(SELECT 1 FROM auth.users) AND ${files.tables.filter(n => n !== "_prisma_migrations").map(n => `NOT EXISTS(SELECT 1 FROM public."${n}")`).join(" AND ")}`],
    ["POLICIES", "NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public')"],
  ];
  if (!after) checks.push(
    ["ROLE_EXISTS", "NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='recycler_preview_app')"],
    ["GRANT_AUTHORITY", `current_setting('server_version_num')::int BETWEEN 170000 AND 179999 AND (SELECT rolcreaterole FROM pg_roles WHERE rolname=current_user)
      AND has_database_privilege(current_user,'postgres','TEMPORARY WITH GRANT OPTION')
      AND has_database_privilege(current_user,'postgres','CONNECT WITH GRANT OPTION')
      AND has_schema_privilege(current_user,'public','CREATE WITH GRANT OPTION')
      AND has_schema_privilege(current_user,'public','USAGE WITH GRANT OPTION')
      AND ${["id", "authUserId", "email", "name", "role"].map(n => `has_column_privilege(current_user,'public."User"',${quote(n)},'SELECT WITH GRANT OPTION')`).join(" AND ")}
      AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','w')
      AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
      AND NOT has_function_privilege(current_user,p.oid,'EXECUTE WITH GRANT OPTION'))`],
    // Required for a boolean-only, independent password-absence check after CREATE ROLE.
    ["PASSWORD_AUDIT_AUTHORITY", "has_column_privilege(current_user,'pg_catalog.pg_authid','rolpassword','SELECT') AND has_column_privilege(current_user,'pg_catalog.pg_authid','rolname','SELECT')"],
    ["PUBLIC_ACCESS", `NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner))) a
      WHERE a.grantee=0 AND c.relkind IN ('r','p','v','m','f','S') AND n.nspname NOT IN ('pg_catalog','information_schema')
      AND (c.relkind='S' OR n.nspname='public' OR EXISTS(SELECT 1 FROM aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) s WHERE s.grantee=0 AND s.privilege_type='USAGE')))
      AND NOT EXISTS(SELECT 1 FROM pg_attribute col JOIN pg_class c ON c.oid=col.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      CROSS JOIN LATERAL aclexplode(col.attacl) a WHERE a.grantee=0 AND col.attnum>0 AND NOT col.attisdropped
      AND n.nspname NOT IN ('pg_catalog','information_schema') AND (n.nspname='public' OR EXISTS(SELECT 1 FROM aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) s WHERE s.grantee=0 AND s.privilege_type='USAGE')))
      AND NOT EXISTS(SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE a.grantee=0 AND a.privilege_type='CREATE' AND n.nspname<>'public')
      AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      WHERE a.grantee=0 AND a.privilege_type='EXECUTE' AND n.nspname NOT IN ('pg_catalog','information_schema')
      AND (n.nspname='public' OR EXISTS(SELECT 1 FROM aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) s WHERE s.grantee=0 AND s.privilege_type='USAGE'))
      AND NOT(n.nspname='public' AND p.prokind IN ('f','w') AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')))`],
  );
  else checks.push(
    ["ATTRIBUTES", `EXISTS(SELECT 1 FROM pg_roles r WHERE rolname='recycler_preview_app' AND NOT
      (${active ? "NOT rolcanlogin" : "rolcanlogin"} OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls))
      AND (SELECT ${active ? "rolpassword IS NOT NULL AND split_part(rolpassword,'$',1)='SCRAM-SHA-256'" : "rolpassword IS NULL"} FROM pg_authid WHERE rolname='recycler_preview_app')
      AND EXISTS(SELECT 1 FROM pg_db_role_setting s JOIN pg_roles r ON r.oid=s.setrole WHERE r.rolname='recycler_preview_app'
      AND s.setdatabase=0 AND s.setconfig=ARRAY['default_transaction_read_only=on'])
      AND NOT EXISTS(SELECT 1 FROM pg_db_role_setting s JOIN pg_roles r ON r.oid=s.setrole WHERE r.rolname='recycler_preview_app' AND s.setdatabase<>0)`],
    ["MEMBERSHIPS", `NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='recycler_preview_app'))
      AND (SELECT count(*) FROM pg_auth_members WHERE roleid=(SELECT oid FROM pg_roles WHERE rolname='recycler_preview_app'))=1
      AND EXISTS(SELECT 1 FROM pg_auth_members WHERE roleid=(SELECT oid FROM pg_roles WHERE rolname='recycler_preview_app')
      AND member=(SELECT oid FROM pg_roles WHERE rolname='postgres') AND grantor=10 AND admin_option AND NOT inherit_option AND NOT set_option)`],
    ["PROFILE_COLUMNS", `(SELECT array_agg(a.attname::text ORDER BY a.attname COLLATE "C") FROM pg_attribute a WHERE a.attrelid='public."User"'::regclass
      AND a.attnum>0 AND NOT a.attisdropped AND has_column_privilege('recycler_preview_app',a.attrelid,a.attnum,'SELECT'))=ARRAY['authUserId','email','id','name','role']::text[]
      AND NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."User"'::regclass AND a.attnum>0 AND NOT a.attisdropped
      AND has_column_privilege('recycler_preview_app',a.attrelid,a.attnum,'SELECT WITH GRANT OPTION'))`],
    ["EFFECTIVE_ACCESS", `NOT EXISTS(SELECT 1 FROM (${runtimeAccessQuery}) access WHERE memberships OR (schema_usage AND (table_read OR object_write OR unexpected_column_read)))
      AND has_database_privilege('recycler_preview_app','postgres','CONNECT') AND has_schema_privilege('recycler_preview_app','public','USAGE')
      AND NOT has_database_privilege('recycler_preview_app','postgres','CREATE,TEMPORARY,CONNECT WITH GRANT OPTION')
      AND NOT EXISTS(SELECT 1 FROM pg_namespace WHERE has_schema_privilege('recycler_preview_app',oid,'CREATE'))
      AND NOT EXISTS(SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=(SELECT oid FROM pg_roles WHERE rolname='recycler_preview_app') AND deptype='o')
      AND NOT EXISTS(SELECT 1 FROM pg_class WHERE CASE WHEN relkind='S' THEN has_sequence_privilege('recycler_preview_app',oid,'USAGE,SELECT,UPDATE') ELSE false END)
      AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema')
      AND has_schema_privilege('recycler_preview_app',n.oid,'USAGE') AND has_function_privilege('recycler_preview_app',p.oid,'EXECUTE'))`],
  );
  const manifest = JSON.parse(readFileSync(new URL("./runtime-role-manifest.json", import.meta.url)));
  if (!/^[a-f0-9]{64}$/.test(manifest.schemaBaselineSha256)) throw new Error("PREVIEW_ROLE_REVIEWED_FILES_CHANGED");
  // The approved baseline had no temporary schemas. Subsequent read-only diagnosis
  // proved that removing only pg_temp_/pg_toast_temp_ entries reproduces it exactly.
  // No persistent schemas, grants, objects or application differences are filtered.
  const snapshot = binding ? schemaSnapshotQuery.replace("WHERE n.nspname<>'public'",
    // A string replacement interprets $' as the source suffix, corrupting SQL.
    () => "WHERE n.nspname<>'public' AND n.nspname !~ '^pg_(toast_)?temp_[0-9]+$'") : schemaSnapshotQuery;
  if (binding) {
    const identity = JSON.parse(readFileSync(new URL("./profile-binding-manifest.json", import.meta.url)));
    const id = quote(identity.authUserId), email = quote(identity.email);
    const policy = quote(`preview_${identity.authUserId.replaceAll("-", "")}`);
    const expression = quote(`(("authUserId" = ${id}::text) AND (email = ${email}::text) AND (role = 'SALES_USER'::public."UserRole"))`);
    checks.splice(checks.findIndex(([name]) => name === "EMPTY_DATA"), 2,
      ["AUTH_IDENTITY", `(SELECT count(*) FROM auth.users)=1 AND EXISTS(SELECT 1 FROM auth.users
        WHERE id=${id}::uuid AND email=${email} AND email_confirmed_at IS NOT NULL AND is_anonymous IS FALSE
        AND coalesce(length(encrypted_password)>0,false))
        AND (SELECT count(*) FROM auth.identities)=1 AND EXISTS(SELECT 1 FROM auth.identities
        WHERE user_id=${id}::uuid AND provider='email' AND lower(trim(identity_data->>'email'))=${email})`],
      ["EMPTY_DATA", files.tables.filter(n => !["_prisma_migrations", "User"].includes(n)).map(n => `NOT EXISTS(SELECT 1 FROM public."${n}")`).join(" AND ")],
      ["BINDING_PROFILE", bindingAfter ? `(SELECT count(*) FROM public."User")=1 AND EXISTS(SELECT 1 FROM public."User"
        WHERE id=${quote(`preview-${identity.authUserId}`)} AND "authUserId"=${id} AND email=${email}
        AND name='Preview reviewer' AND role='SALES_USER')` : `NOT EXISTS(SELECT 1 FROM public."User")`],
      ["POLICIES", bindingAfter ? `(SELECT count(*) FROM pg_policies WHERE schemaname='public')=1
        AND EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public."User"'::regclass AND polname=${policy}
        AND polcmd='r' AND polpermissive AND polroles=ARRAY[(SELECT oid FROM pg_roles WHERE rolname='recycler_preview_app')]
        AND polwithcheck IS NULL AND pg_get_expr(polqual,polrelid)=${expression})` : `NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public')`],
      ["BINDING_TRIGGERS", `NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid IN ('public."User"'::regclass,'auth.users'::regclass) AND NOT tgisinternal)`],
    );
    if (!bindingAfter) checks.push(["BINDING_AUTHORITY", `has_table_privilege(current_user,'public."User"','INSERT')
      AND (SELECT pg_has_role(current_user,relowner,'USAGE') FROM pg_class WHERE oid='public."User"'::regclass)`]);
  }
  checks.push(["SCHEMA_BASELINE", `(${snapshot})=${quote(manifest.schemaBaselineSha256)}`]);
  if (activation) checks.push(["ACTIVATION_AUTHORITY", "(SELECT rolcreaterole FROM pg_roles WHERE rolname=current_user)"]);
  // Normalize only the explicitly authorized LOGIN bit. ATTRIBUTES independently
  // requires its phase-specific value; every other grant/role setting stays hashed.
  const privileges = activation ? privilegeSnapshotQuery.replace("r.rolname,r.rolcanlogin,",
    () => "r.rolname,CASE WHEN r.rolname='recycler_preview_app' THEN false ELSE r.rolcanlogin END,") : privilegeSnapshotQuery;
  const begin = activation === "before-commit" ? "" : writable ? "BEGIN;\n" : "BEGIN READ ONLY;\nSET LOCAL default_transaction_read_only=on;\n";
  const evidence = activation === "before-password" ? "" : `
SELECT json_build_object('status','${activation ? active ? "POSTCHECK_PASSED" : "PREFLIGHT_PASSED" : binding ? bindingAfter ? "POSTCHECK_PASSED" : "PREFLIGHT_PASSED" : after ? "POSTCHECK_PASSED" : "PREFLIGHT_PASSED"}', 'schema', (${snapshot}),
  ${binding ? `'privileges', (${privileges}),` : ""}
  'backendTls', (SELECT CASE WHEN count(*)<>1 THEN 'UNKNOWN' WHEN bool_and(ssl) THEN 'REPORTED_TLS'
    WHEN bool_and(NOT ssl) THEN 'REPORTED_NO_TLS' ELSE 'UNKNOWN' END FROM pg_stat_ssl WHERE pid=pg_backend_pid()));`;
  return `${begin}SET LOCAL row_security=off;
SET LOCAL search_path=pg_catalog;
DO $audit$ BEGIN
${checks.map(([name, condition]) => guard(name, condition)).join("\n")}
END $audit$;${evidence}${writable ? "" : "\nROLLBACK;"}`;
}

// Compare effective grants and role settings before/after, including public ACLs
// deliberately omitted by the original role-provisioning schema baseline.
const privilegeSnapshotQuery = `SELECT encode(sha256(convert_to(coalesce(string_agg(value,E'\\n' ORDER BY value COLLATE "C"),''),'UTF8')),'hex') FROM (
  SELECT row(n.oid,n.nspowner,n.nspacl)::text AS value FROM pg_namespace n WHERE n.nspname !~ '^pg_(toast_)?temp_[0-9]+$'
  UNION ALL SELECT row(c.oid,c.relowner,c.relacl,a.attnum,a.attacl)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 WHERE n.nspname !~ '^pg_(toast_)?temp_[0-9]+$'
  UNION ALL SELECT row(p.oid,p.proowner,p.proacl)::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname !~ '^pg_(toast_)?temp_[0-9]+$'
  UNION ALL SELECT row(d.oid,d.datdba,d.datacl)::text FROM pg_database d
  UNION ALL SELECT row(d.oid,d.defaclrole,d.defaclnamespace,d.defaclobjtype,d.defaclacl)::text FROM pg_default_acl d
  UNION ALL SELECT row(r.oid,r.rolname,r.rolcanlogin,r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolinherit,r.rolreplication,r.rolbypassrls)::text FROM pg_roles r
  UNION ALL SELECT row(m.roleid,m.member,m.grantor,m.admin_option,m.inherit_option,m.set_option)::text FROM pg_auth_members m
  UNION ALL SELECT row(s.setdatabase,s.setrole,s.setconfig)::text FROM pg_db_role_setting s
) privileges`;

const schemaSnapshotQuery = `
  SELECT encode(sha256(convert_to(coalesce(string_agg(value,E'\\n' ORDER BY value COLLATE "C"),''),'UTF8')),'hex') FROM (
    SELECT row(c.oid,c.relname,c.relkind,c.relowner,c.relrowsecurity,c.relforcerowsecurity,a.attnum,a.attname,a.atttypid,a.atttypmod,a.attnotnull,pg_get_expr(d.adbin,d.adrelid))::text AS value
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='public'
    UNION ALL SELECT row(c.oid,c.conname,pg_get_constraintdef(c.oid))::text FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public'
    UNION ALL SELECT row(i.indexrelid,pg_get_indexdef(i.indexrelid))::text FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
    UNION ALL SELECT row(t.oid,t.typname,e.enumsortorder,e.enumlabel)::text FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace LEFT JOIN pg_enum e ON e.enumtypid=t.oid WHERE n.nspname='public'
    UNION ALL SELECT row(t.oid,pg_get_triggerdef(t.oid))::text FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
    UNION ALL SELECT row(n.oid,n.nspowner,n.nspacl)::text FROM pg_namespace n WHERE n.nspname<>'public'
    UNION ALL SELECT row(c.oid,c.relacl,a.attnum,a.attacl)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 WHERE n.nspname IN ('auth','extensions')
    UNION ALL SELECT row(p.oid,p.proacl)::text FROM pg_proc p WHERE EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
    UNION ALL SELECT row(r.oid,r.rolname,r.rolcanlogin,r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolinherit,r.rolreplication,r.rolbypassrls)::text FROM pg_roles r WHERE r.rolname<>'recycler_preview_app'
    UNION ALL SELECT row(m.roleid,m.member,m.grantor,m.admin_option,m.inherit_option,m.set_option)::text FROM pg_auth_members m WHERE m.roleid NOT IN (SELECT oid FROM pg_roles WHERE rolname='recycler_preview_app') AND m.member NOT IN (SELECT oid FROM pg_roles WHERE rolname='recycler_preview_app')
  ) metadata`;
