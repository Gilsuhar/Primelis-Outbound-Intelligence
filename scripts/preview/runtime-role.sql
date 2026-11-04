-- Prepared only. Execute as an administrator on the approved NEW project after the 11 migrations.
-- Requires an empty, dedicated database. Never apply to either legacy project or Production.
BEGIN;
-- Verified management target: txfxfrlhtvzwgluhnbpw / Primelis / us-west-2.
-- A caller-supplied project setting is NOT identity evidence. This non-secret digest
-- was read independently from that project's pg_control_system on 2026-11-03.
DO $target$
BEGIN
  IF current_database() <> 'postgres' OR session_user <> 'postgres' OR current_user <> 'postgres'
    OR (SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(system_identifier::text, 'UTF8')), 'hex')
        FROM pg_catalog.pg_control_system()) IS DISTINCT FROM
       'a1073520e0b51853abdb5566448e35fd46a0be545c51b046e9ed98ab78ac843f' THEN
    RAISE EXCEPTION 'PREVIEW_SETUP_TARGET_REJECTED';
  END IF;
  IF (SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 11
    OR EXISTS (SELECT 1 FROM public._prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL)
    OR NOT EXISTS (SELECT 1 FROM public._prisma_migrations
      WHERE migration_name = '20261017130000_restrict_application_data_api' AND finished_at IS NOT NULL) THEN
    RAISE EXCEPTION 'PREVIEW_SETUP_MIGRATIONS_INCOMPLETE';
  END IF;
END $target$;
-- Existing role or unexpected PUBLIC grants must never be silently adopted.
CREATE ROLE recycler_preview_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
ALTER ROLE recycler_preview_app SET default_transaction_read_only = on;
-- PUBLIC privileges are inherited even by NOINHERIT roles. Dedicated-project change only.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE TEMPORARY ON DATABASE postgres FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM recycler_preview_app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM recycler_preview_app;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, recycler_preview_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
GRANT CONNECT ON DATABASE postgres TO recycler_preview_app;
GRANT USAGE ON SCHEMA public TO recycler_preview_app;
GRANT SELECT (id, "authUserId", email, name, role) ON public."User" TO recycler_preview_app;
-- RLS is already enabled by the reviewed migrations; never change the verified schema here.
DO $privileges$
DECLARE app_oid oid := (SELECT oid FROM pg_roles WHERE rolname='recycler_preview_app');
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE oid=app_oid AND
      (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls OR rolreplication))
    OR EXISTS (SELECT 1 FROM pg_auth_members WHERE member=app_oid OR roleid=app_oid)
    OR EXISTS (SELECT 1 FROM pg_database WHERE datdba=app_oid)
    OR has_database_privilege('recycler_preview_app','postgres','CREATE,TEMPORARY')
    OR has_database_privilege('recycler_preview_app','postgres','CONNECT WITH GRANT OPTION')
    OR EXISTS (SELECT 1 FROM pg_namespace WHERE nspowner=app_oid OR has_schema_privilege('recycler_preview_app',oid,'CREATE'))
    OR EXISTS (SELECT 1 FROM pg_class WHERE relowner=app_oid)
    OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public."User"'::regclass AND relrowsecurity)
    OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND c.relkind IN ('r','p','v','m','f')
        AND (has_table_privilege('recycler_preview_app',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          OR has_any_column_privilege('recycler_preview_app',c.oid,'INSERT,UPDATE,REFERENCES')))
    OR EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND c.relkind IN ('r','p','v','m','f')
        AND a.attnum>0 AND NOT a.attisdropped AND has_column_privilege('recycler_preview_app',c.oid,a.attnum,'SELECT')
        AND NOT (c.oid='public."User"'::regclass AND a.attname IN ('id','authUserId','email','name','role')))
    OR EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public."User"'::regclass
      AND a.attnum>0 AND NOT a.attisdropped
      AND has_column_privilege('recycler_preview_app',a.attrelid,a.attnum,'SELECT WITH GRANT OPTION'))
    OR EXISTS (SELECT 1 FROM pg_class c WHERE c.relkind='S'
      AND has_sequence_privilege('recycler_preview_app',c.oid,'USAGE,SELECT,UPDATE'))
    OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname NOT IN ('pg_catalog','information_schema')
        AND has_schema_privilege('recycler_preview_app',n.oid,'USAGE')
        AND has_function_privilege('recycler_preview_app',p.oid,'EXECUTE')) THEN
    RAISE EXCEPTION 'PREVIEW_RUNTIME_EFFECTIVE_PRIVILEGES_REJECTED';
  END IF;
END $privileges$;
-- No permissive policy here: separate approved-user binding creates a row-specific policy.
-- Keep NOLOGIN until password setup and effective-privilege checks are separately approved.
COMMIT;
