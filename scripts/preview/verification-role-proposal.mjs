// LOCAL SQL GENERATION ONLY. No database client, CLI execution path or secret input.
import { readFileSync } from "node:fs";
import { reviewedFiles } from "./verification.mjs";
import { privilegeFields, privilegeQuery } from "./read-only-context.mjs";
import { provisioningChecks } from "./role-provisioning-checks.mjs";
const target = JSON.parse(readFileSync(new URL("./verified-target.json", import.meta.url), "utf8"));
const files = reviewedFiles(target.migrations, path => Buffer.from(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n")));

export function verificationRoleProposal() {
  const expected = target.migrations.map(name => `('${name}','${files.hashes[`prisma/migrations/${name}/migration.sql`]}')`).join(",\n");
  const relations = files.tables.map(name => `public."${name}"`);
  return `-- REVIEW PROPOSAL ONLY: dedicated txfxfrlhtvzwgluhnbpw. Not a Prisma migration.
-- Run only after separate approval through a strict-TLS, identity-checked administrator session.
-- Leaves the new role NOLOGIN, without a password. No existing credential is modified.
BEGIN;
DO $guard$
BEGIN
  IF current_database() <> 'postgres' OR session_user <> 'postgres' OR current_user <> 'postgres'
     OR (SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(system_identifier::text,'UTF8')),'hex') FROM pg_catalog.pg_control_system())
        IS DISTINCT FROM '${target.clusterFingerprint}' THEN
    RAISE EXCEPTION 'PREVIEW_SETUP_TARGET_REJECTED';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='recycler_preview_verify') THEN
    RAISE EXCEPTION 'PREVIEW_VERIFY_ROLE_ALREADY_EXISTS';
  END IF;
${provisioningChecks.map(([id, expression]) => `  IF (${expression}) IS DISTINCT FROM true THEN RAISE EXCEPTION 'PREVIEW_VERIFY_${id}'; END IF;`).join("\n")}
  IF EXISTS (WITH expected(name,checksum) AS (VALUES ${expected})
    SELECT 1 FROM expected e FULL JOIN public._prisma_migrations m ON m.migration_name=e.name
    WHERE e.name IS NULL OR m.migration_name IS NULL OR e.checksum<>m.checksum OR m.finished_at IS NULL
      OR m.rolled_back_at IS NOT NULL OR m.applied_steps_count<>1)
    OR (SELECT count(*) FROM public._prisma_migrations)<>11 THEN
    RAISE EXCEPTION 'PREVIEW_SETUP_HISTORY_VERIFICATION_FAILED';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p'))<>50
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p') AND (NOT c.relrowsecurity OR
        has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR
        has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR
        has_any_column_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,REFERENCES') OR
        has_any_column_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,REFERENCES')))
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname='public' OR (schemaname='auth' AND tablename='users'))
    OR EXISTS (SELECT 1 FROM auth.users)
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='recycler_preview_app') THEN
    RAISE EXCEPTION 'PREVIEW_VERIFY_ROLE_PRECONDITIONS_FAILED';
  END IF;
${relations.filter(r => r !== 'public."_prisma_migrations"').map(r => `  IF EXISTS (SELECT 1 FROM ${r}) THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;`).join("\n")}
END $guard$;
CREATE ROLE recycler_preview_verify NOLOGIN PASSWORD NULL NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT NOBYPASSRLS;
ALTER ROLE recycler_preview_verify SET default_transaction_read_only = on;
ALTER ROLE recycler_preview_verify SET row_security = on;
-- PUBLIC privileges apply even to NOINHERIT. Only this dedicated Preview is affected.
REVOKE TEMPORARY ON DATABASE postgres FROM PUBLIC;
GRANT CONNECT ON DATABASE postgres TO recycler_preview_verify;
GRANT USAGE ON SCHEMA public, auth TO recycler_preview_verify;
GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO recycler_preview_verify;
${relations.map(r => `GRANT SELECT ON TABLE ${r} TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON ${r} AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);`).join("\n")}
-- Auth is outside Prisma's public schema comparison. Counting its non-null ID needs no PII columns.
GRANT SELECT (id) ON TABLE auth.users TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON auth.users AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
-- Verify effective privileges, including inherited PUBLIC permissions; never auto-revoke managed grants.
-- Any conflict aborts and rolls back ALL preceding statements. Review conflicts separately.
SET LOCAL ROLE recycler_preview_verify;
DO $privileges$
DECLARE checks record;
BEGIN
  ${privilegeQuery.replace("FROM pg_catalog.pg_roles r WHERE", "INTO checks FROM pg_catalog.pg_roles r WHERE")};
  IF ${privilegeFields.map(key => `checks.${key} IS DISTINCT FROM true`).join(" OR ")} THEN
    RAISE EXCEPTION 'PREVIEW_VERIFY_ROLE_PRIVILEGES_REJECTED';
  END IF;
END $privileges$;
RESET ROLE;
COMMIT;
-- No LOGIN/password activation, runtime role, Auth user, table alteration or application seed.
`;
}
