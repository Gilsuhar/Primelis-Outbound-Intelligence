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
CREATE ROLE recycler_preview_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
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
ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
-- No permissive policy here: separate approved-user binding creates a row-specific policy.
-- Keep NOLOGIN until password setup and effective-privilege checks are separately approved.
COMMIT;
