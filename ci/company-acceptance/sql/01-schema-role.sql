-- NOT EXECUTED. Connect explicitly to ci_acceptance_pilot after approved phase 00.
\set expected_database ci_acceptance_pilot
\ir target-guard.sql
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(hashtextextended('ci-pilot-initialize-20261019',0));
DO $$ BEGIN
  IF (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database())
       <> 'neondb_owner'
     OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ci_acceptance_app')
     OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname NOT IN ('pg_catalog','information_schema')
         AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'
         AND c.relkind IN ('r','p','v','m','f','S'))
     OR EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace)
     OR EXISTS (SELECT 1 FROM pg_type WHERE typnamespace='public'::regnamespace)
  THEN RAISE EXCEPTION 'CI_INITIALIZATION_TARGET_NOT_EMPTY'; END IF;
END $$;

-- SQL-created role: never use Neon API/CLI role creation (may grant neon_superuser).
CREATE ROLE ci_acceptance_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 1;
REVOKE ALL ON DATABASE ci_acceptance_pilot FROM PUBLIC;
GRANT CONNECT ON DATABASE ci_acceptance_pilot TO ci_acceptance_app;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO ci_acceptance_app;

CREATE TYPE public."GeneratedDraftStatus" AS ENUM ('DRAFT','SUBMITTED_FOR_REVIEW','ARCHIVED');
CREATE TABLE public."User" (id TEXT PRIMARY KEY);
CREATE TABLE public."GeneratedDraft" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES public."User"(id),
  workflow TEXT NOT NULL,
  "draftContent" TEXT NOT NULL,
  "retrievedKnowledgeIds" TEXT[] NOT NULL,
  "sourceIds" TEXT[] NOT NULL,
  "draftStatus" public."GeneratedDraftStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
-- Explicit ownership; runtime cannot alter schema, policies or privileges.
ALTER TYPE public."GeneratedDraftStatus" OWNER TO neondb_owner;
ALTER TABLE public."User" OWNER TO neondb_owner;
ALTER TABLE public."GeneratedDraft" OWNER TO neondb_owner;
REVOKE ALL ON TABLE public."User", public."GeneratedDraft" FROM PUBLIC;
REVOKE ALL ON TYPE public."GeneratedDraftStatus" FROM PUBLIC;
GRANT USAGE ON TYPE public."GeneratedDraftStatus" TO ci_acceptance_app;
GRANT SELECT, INSERT, UPDATE ON TABLE public."GeneratedDraft" TO ci_acceptance_app;
INSERT INTO public."User"(id) VALUES ('ci-fixture-pilot-20261019');

CREATE POLICY ci_select ON public."GeneratedDraft" FOR SELECT TO ci_acceptance_app
USING ("userId"='ci-fixture-pilot-20261019' AND (
  (id='company-queue-56cedcf2b42d6b2604a08c233a3095aa6d60803648f054baa58740a066896852' AND workflow='COMPANY_QUEUE_V1')
  OR (id='ci-audit-pilot-20261019' AND workflow='CI_ACCEPTANCE_AUDIT_V1')
  OR (id='ci-identity-pilot-20261019' AND workflow='CI_ACCEPTANCE_IDENTITY_V1')
));
CREATE POLICY ci_insert ON public."GeneratedDraft" FOR INSERT TO ci_acceptance_app
WITH CHECK ("userId"='ci-fixture-pilot-20261019' AND (
  (id='company-queue-56cedcf2b42d6b2604a08c233a3095aa6d60803648f054baa58740a066896852' AND workflow='COMPANY_QUEUE_V1')
  OR (id='ci-audit-pilot-20261019' AND workflow='CI_ACCEPTANCE_AUDIT_V1')
));
CREATE POLICY ci_update ON public."GeneratedDraft" FOR UPDATE TO ci_acceptance_app
USING ("userId"='ci-fixture-pilot-20261019' AND (
  (id='company-queue-56cedcf2b42d6b2604a08c233a3095aa6d60803648f054baa58740a066896852' AND workflow='COMPANY_QUEUE_V1')
  OR (id='ci-audit-pilot-20261019' AND workflow='CI_ACCEPTANCE_AUDIT_V1')
))
WITH CHECK ("userId"='ci-fixture-pilot-20261019' AND (
  (id='company-queue-56cedcf2b42d6b2604a08c233a3095aa6d60803648f054baa58740a066896852' AND workflow='COMPANY_QUEUE_V1')
  OR (id='ci-audit-pilot-20261019' AND workflow='CI_ACCEPTANCE_AUDIT_V1')
));
-- Explicit administrator-only identity access permits phase 02 under forced RLS.
-- Runtime has no membership in this owner role; it cannot use either policy.
CREATE POLICY ci_owner_identity_select ON public."GeneratedDraft" FOR SELECT TO neondb_owner
USING ("userId"='ci-fixture-pilot-20261019' AND id='ci-identity-pilot-20261019'
  AND workflow='CI_ACCEPTANCE_IDENTITY_V1');
CREATE POLICY ci_owner_identity_insert ON public."GeneratedDraft" FOR INSERT TO neondb_owner
WITH CHECK ("userId"='ci-fixture-pilot-20261019' AND id='ci-identity-pilot-20261019'
  AND workflow='CI_ACCEPTANCE_IDENTITY_V1');
ALTER TABLE public."GeneratedDraft" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."GeneratedDraft" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ci_acceptance_app' AND
      (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls))
     OR EXISTS (SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='ci_acceptance_app'))
     OR has_database_privilege('ci_acceptance_app',current_database(),'CREATE')
     OR has_database_privilege('ci_acceptance_app',current_database(),'TEMP')
     OR has_schema_privilege('ci_acceptance_app','public','CREATE')
     OR has_table_privilege('ci_acceptance_app','public."GeneratedDraft"','DELETE')
     OR has_table_privilege('ci_acceptance_app','public."GeneratedDraft"','TRUNCATE')
     OR has_table_privilege('ci_acceptance_app','public."User"','SELECT')
  THEN RAISE EXCEPTION 'CI_ROLE_PRIVILEGES_INVALID'; END IF;
END $$;
COMMIT;
-- Phase 02 and private credential/login activation remain separate. No password here.
