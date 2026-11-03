-- REVIEW PROPOSAL ONLY: dedicated txfxfrlhtvzwgluhnbpw. Not a Prisma migration.
-- Run only after separate approval through a strict-TLS, identity-checked administrator session.
-- Leaves the new role NOLOGIN, without a password. No existing credential is modified.
BEGIN;
DO $guard$
BEGIN
  IF current_database() <> 'postgres' OR session_user <> 'postgres' OR current_user <> 'postgres'
     OR (SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(system_identifier::text,'UTF8')),'hex') FROM pg_catalog.pg_control_system())
        IS DISTINCT FROM 'a1073520e0b51853abdb5566448e35fd46a0be545c51b046e9ed98ab78ac843f' THEN
    RAISE EXCEPTION 'PREVIEW_SETUP_TARGET_REJECTED';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='recycler_preview_verify') THEN
    RAISE EXCEPTION 'PREVIEW_VERIFY_ROLE_ALREADY_EXISTS';
  END IF;
  IF EXISTS (WITH expected(name,checksum) AS (VALUES ('20260712152700_initial_postgresql_foundation','a0a931cdc216186149526de3e1d37466724174352263d718b330bc14d7e9661d'),
('20260713000100_imported_signal_review_workflow','ebc407790217b312f5c8e23d13ba3d6678494757eb270998256b2cfc1564a1e0'),
('20260713000200_reply_to_prospect_drafts','71b0d9757f9cebc7d9df4a6af93072718a6bf708071031d4cecd1172d018e385'),
('20260713000300_account_assessments','df2939a1a10f55eac311b266b2a07681411f70c682eb2a1beb6f2f52c98ccf81'),
('20260713000400_connected_research_foundation','bb5a3d6714f914cba79b963f561858ef0ff9760973ed395a39d876f9f4b59162'),
('20260713000500_company_contact_provider_foundation','8c5698e635ab5ee236cef7585d97b645fbfb2cf883072330e5096ab964773b57'),
('20260713000600_real_ai_provider_draft_versions','5085ed0c81d812de47498c6d0afb78fd3b15ce84fd358ebf7b61384fe3f8cd22'),
('20260713000700_private_preview_auth','2bf390d7aa5c91ffdf95152b43634552ca0204924176f539018877b256666cba'),
('20260823000100_prospect_memory_phase_1','665ac74aa7e8722a65a88051190ddc2e5da1a4ea89e6b83a0cdcf64745d91eae'),
('20261016000000_read_only_integration_sync','000664e36cdd18a1ed350efb7445f19b210f47ec10208eebb964d8336d2c1ff0'),
('20261017130000_restrict_application_data_api','50da5758109ffd4d55a9c9903eeaa1c9062246a16047e09bda69c938b171a0f3'))
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
        has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')))
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname='public' OR (schemaname='auth' AND tablename='users'))
    OR EXISTS (SELECT 1 FROM auth.users)
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='recycler_preview_app') THEN
    RAISE EXCEPTION 'PREVIEW_VERIFY_ROLE_PRECONDITIONS_FAILED';
  END IF;
  IF EXISTS (SELECT 1 FROM public."AccountAssessment") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."CaseStudy") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."CaseStudyMetric") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."Claim") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."CompanyEnrichmentFinding") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."CompanyEnrichmentRun") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."Competitor") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."CompetitorClaim") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."ContactEnrichmentResult") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."DraftVersion") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."GeneratedDraft") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."Industry") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."IntegrationAuditEvent") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."IntegrationState") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."InteractionOutcome") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."KnowledgeItem") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."KnowledgeSubmission") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."MessageExample") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."Objection") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."Persona") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."Product") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."Prospect") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."ProspectFact") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."ProspectQuestion") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."ProspectSource") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."ProviderSyncAudit") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."ReviewDecision") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."Sequence") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."SequenceStep") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."SourceDocument") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."SuppressionAudit") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."SuppressionImportBatch") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."SuppressionRecord") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."User") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."WebsiteResearchRun") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."_CaseStudyIndustries") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."_CaseStudyPersonas") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."_CaseStudySources") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."_ClaimIndustries") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."_ClaimPersonas") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."_ClaimSources") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."_KnowledgeItemClaims") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."_KnowledgeItemIndustries") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."_KnowledgeItemPersonas") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."_KnowledgeItemSources") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."_SubmissionCompetitors") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."_SubmissionIndustries") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."_SubmissionPersonas") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM public."_SubmissionSources") THEN RAISE EXCEPTION 'PREVIEW_SETUP_UNEXPECTED_DATA'; END IF;
END $guard$;
CREATE ROLE recycler_preview_verify NOLOGIN PASSWORD NULL NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT NOBYPASSRLS;
ALTER ROLE recycler_preview_verify SET default_transaction_read_only = on;
ALTER ROLE recycler_preview_verify SET row_security = on;
-- PUBLIC privileges apply even to NOINHERIT. Only this dedicated Preview is affected.
REVOKE TEMPORARY ON DATABASE postgres FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE postgres TO recycler_preview_verify;
GRANT USAGE ON SCHEMA public, auth TO recycler_preview_verify;
GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO recycler_preview_verify;
GRANT SELECT ON TABLE public."AccountAssessment" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."AccountAssessment" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."CaseStudy" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."CaseStudy" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."CaseStudyMetric" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."CaseStudyMetric" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."Claim" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."Claim" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."CompanyEnrichmentFinding" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."CompanyEnrichmentFinding" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."CompanyEnrichmentRun" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."CompanyEnrichmentRun" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."Competitor" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."Competitor" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."CompetitorClaim" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."CompetitorClaim" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."ContactEnrichmentResult" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."ContactEnrichmentResult" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."DraftVersion" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."DraftVersion" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."GeneratedDraft" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."GeneratedDraft" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."Industry" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."Industry" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."IntegrationAuditEvent" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."IntegrationAuditEvent" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."IntegrationState" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."IntegrationState" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."InteractionOutcome" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."InteractionOutcome" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."KnowledgeItem" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."KnowledgeItem" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."KnowledgeSubmission" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."KnowledgeSubmission" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."MessageExample" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."MessageExample" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."Objection" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."Objection" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."Persona" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."Persona" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."Product" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."Product" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."Prospect" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."Prospect" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."ProspectFact" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."ProspectFact" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."ProspectQuestion" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."ProspectQuestion" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."ProspectSource" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."ProspectSource" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."ProviderSyncAudit" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."ProviderSyncAudit" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."ReviewDecision" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."ReviewDecision" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."Sequence" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."Sequence" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."SequenceStep" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."SequenceStep" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."SourceDocument" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."SourceDocument" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."SuppressionAudit" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."SuppressionAudit" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."SuppressionImportBatch" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."SuppressionImportBatch" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."SuppressionRecord" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."SuppressionRecord" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."User" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."User" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."WebsiteResearchRun" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."WebsiteResearchRun" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."_CaseStudyIndustries" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."_CaseStudyIndustries" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."_CaseStudyPersonas" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."_CaseStudyPersonas" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."_CaseStudySources" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."_CaseStudySources" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."_ClaimIndustries" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."_ClaimIndustries" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."_ClaimPersonas" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."_ClaimPersonas" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."_ClaimSources" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."_ClaimSources" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."_KnowledgeItemClaims" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."_KnowledgeItemClaims" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."_KnowledgeItemIndustries" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."_KnowledgeItemIndustries" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."_KnowledgeItemPersonas" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."_KnowledgeItemPersonas" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."_KnowledgeItemSources" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."_KnowledgeItemSources" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."_SubmissionCompetitors" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."_SubmissionCompetitors" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."_SubmissionIndustries" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."_SubmissionIndustries" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."_SubmissionPersonas" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."_SubmissionPersonas" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."_SubmissionSources" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."_SubmissionSources" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE public."_prisma_migrations" TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON public."_prisma_migrations" AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
GRANT SELECT ON TABLE auth.users TO recycler_preview_verify;
CREATE POLICY recycler_preview_verify_select ON auth.users AS PERMISSIVE FOR SELECT TO recycler_preview_verify USING (true);
-- Verify effective privileges, including inherited PUBLIC permissions; never auto-revoke managed grants.
-- Any conflict aborts and rolls back ALL preceding statements. Review conflicts separately.
SET LOCAL ROLE recycler_preview_verify;
DO $privileges$
DECLARE checks record;
BEGIN
  SELECT   NOT (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls OR r.rolinherit) AS restricted_role,   NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=r.oid) AS no_memberships,   EXISTS (SELECT 1 FROM pg_catalog.pg_db_role_setting s WHERE s.setrole=r.oid AND s.setdatabase=0     AND 'default_transaction_read_only=on'=ANY(s.setconfig) AND 'row_security=on'=ANY(s.setconfig)) AS login_defaults,   NOT EXISTS (SELECT 1 FROM pg_catalog.pg_db_role_setting s WHERE s.setrole=r.oid AND s.setdatabase<>0) AS no_database_override,   NOT has_database_privilege(current_user, current_database(), 'CREATE,TEMPORARY') AS no_database_writes,   NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n WHERE has_schema_privilege(current_user,n.oid,'CREATE') OR n.nspowner=r.oid) AS no_schema_writes,   NOT EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datdba=r.oid) AS no_database_ownership,   NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c WHERE c.relowner=r.oid) AS no_relation_ownership,   NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.proowner=r.oid) AS no_function_ownership,   NOT EXISTS (SELECT 1 FROM pg_catalog.pg_shdepend d WHERE d.refclassid='pg_catalog.pg_authid'::regclass     AND d.refobjid=r.oid AND d.deptype='o') AS no_owned_objects,   NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c WHERE c.relkind IN ('r','p','v','m','f') AND     (has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR      has_any_column_privilege(current_user,c.oid,'INSERT,UPDATE,REFERENCES'))) AS no_table_writes,   NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c WHERE c.relkind='S' AND has_sequence_privilege(current_user,c.oid,'USAGE,UPDATE')) AS no_sequence_writes,   NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace     WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND has_function_privilege(current_user,p.oid,'EXECUTE')) AS no_user_functions,   current_setting('row_security')='on' AS row_security_on INTO checks FROM pg_catalog.pg_roles r WHERE r.rolname=current_user;
  IF checks.restricted_role IS DISTINCT FROM true OR checks.no_memberships IS DISTINCT FROM true OR checks.login_defaults IS DISTINCT FROM true OR checks.no_database_override IS DISTINCT FROM true OR checks.no_database_writes IS DISTINCT FROM true OR checks.no_schema_writes IS DISTINCT FROM true OR checks.no_database_ownership IS DISTINCT FROM true OR checks.no_relation_ownership IS DISTINCT FROM true OR checks.no_function_ownership IS DISTINCT FROM true OR checks.no_owned_objects IS DISTINCT FROM true OR checks.no_table_writes IS DISTINCT FROM true OR checks.no_sequence_writes IS DISTINCT FROM true OR checks.no_user_functions IS DISTINCT FROM true OR checks.row_security_on IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'PREVIEW_VERIFY_ROLE_PRIVILEGES_REJECTED';
  END IF;
END $privileges$;
RESET ROLE;
COMMIT;
-- No LOGIN/password activation, runtime role, Auth user, table alteration or application seed.
