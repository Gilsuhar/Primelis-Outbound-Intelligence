-- NOT EXECUTED. Requires separately reviewed final approval.json and its exact hash.
\set expected_database ci_acceptance_pilot
\ir target-guard.sql
\if :{?approval_sha256}
\else
DO $$ BEGIN RAISE EXCEPTION 'CI_FINAL_MANIFEST_HASH_REQUIRED'; END $$;
\endif
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(hashtextextended('ci-pilot-initialize-20261019',0));
SELECT set_config('ci.approval_sha256', :'approval_sha256', true);
DO $$
DECLARE
  approval_hash TEXT := current_setting('ci.approval_sha256');
  expected TEXT;
  previous TEXT;
BEGIN
  IF approval_hash !~ '^[a-f0-9]{64}$' OR approval_hash = repeat('0',64)
     OR approval_hash = repeat('a',64) THEN
    RAISE EXCEPTION 'CI_FINAL_MANIFEST_HASH_INVALID';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ci_acceptance_app' AND NOT rolcanlogin)
     OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public."GeneratedDraft"'::regclass
       AND relrowsecurity AND relforcerowsecurity)
  THEN RAISE EXCEPTION 'CI_MARKER_SETUP_NOT_LOCKED'; END IF;
  -- Byte-for-byte JSON.stringify order; no jsonb reordering or added whitespace.
  expected := '{"profile":"GITHUB_ACTIONS_SIMULATED","projectId":"snowy-art-90934943",'
    || '"cohort":"pilot-20261019","actor":"ci-fixture-pilot-20261019","approvalHash":"'
    || approval_hash || '"}';
  SELECT "draftContent" INTO previous FROM public."GeneratedDraft"
    WHERE id='ci-identity-pilot-20261019';
  IF FOUND THEN
    IF previous IS DISTINCT FROM expected OR NOT EXISTS (
      SELECT 1 FROM public."GeneratedDraft" WHERE id='ci-identity-pilot-20261019'
      AND "userId"='ci-fixture-pilot-20261019' AND workflow='CI_ACCEPTANCE_IDENTITY_V1'
      AND "draftStatus"='DRAFT' AND "retrievedKnowledgeIds"='{}' AND "sourceIds"='{}') THEN
      RAISE EXCEPTION 'CI_EXISTING_IDENTITY_MISMATCH';
    END IF;
    -- Matching rerun is a no-op. Never overwrite an existing approval marker.
  ELSE
    INSERT INTO public."GeneratedDraft"
      (id,"userId",workflow,"draftContent","retrievedKnowledgeIds","sourceIds","draftStatus","updatedAt")
    VALUES ('ci-identity-pilot-20261019','ci-fixture-pilot-20261019','CI_ACCEPTANCE_IDENTITY_V1',
      expected,'{}','{}','DRAFT',CURRENT_TIMESTAMP);
  END IF;
END $$;
COMMIT;
