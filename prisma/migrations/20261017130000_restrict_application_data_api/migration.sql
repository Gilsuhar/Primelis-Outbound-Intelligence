-- PREPARED ONLY. Review against the isolated Preview database before applying.
-- Application tables are accessed through authenticated, actor-scoped server Prisma code.
-- Preserve unrelated Legacy tables, Auth schemas, existing policies and server-role privileges.
DO $migration$
DECLARE table_name text; api_role text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['User','Product','KnowledgeItem','Industry','Persona','Competitor','SourceDocument','Claim','CompetitorClaim','MessageExample','ProspectQuestion','Objection','CaseStudy','CaseStudyMetric','Sequence','SequenceStep','KnowledgeSubmission','ReviewDecision','InteractionOutcome','GeneratedDraft','Prospect','ProspectSource','ProspectFact','DraftVersion','AccountAssessment','SuppressionRecord','SuppressionImportBatch','SuppressionAudit','WebsiteResearchRun','CompanyEnrichmentRun','CompanyEnrichmentFinding','ContactEnrichmentResult','ProviderSyncAudit','IntegrationState','IntegrationAuditEvent','_CaseStudyIndustries','_CaseStudyPersonas','_CaseStudySources','_ClaimIndustries','_ClaimPersonas','_ClaimSources','_KnowledgeItemClaims','_KnowledgeItemIndustries','_KnowledgeItemPersonas','_KnowledgeItemSources','_SubmissionCompetitors','_SubmissionIndustries','_SubmissionPersonas','_SubmissionSources','_prisma_migrations']
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC', table_name);
      FOREACH api_role IN ARRAY ARRAY['anon','authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
          EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', table_name, api_role);
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END $migration$;
