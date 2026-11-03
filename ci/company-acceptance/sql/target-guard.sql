-- REVIEWED PROPOSAL ONLY. Run through psql -X only after separate execution approval.
-- Metadata assertions must come from a fresh authenticated Neon read, never guesses.
\set ON_ERROR_STOP on
\set ECHO none
\if :{?execution_approval}
\else
DO $$ BEGIN RAISE EXCEPTION 'CI_EXECUTION_APPROVAL_REQUIRED'; END $$;
\endif
\if :{?verified_org}
\else
DO $$ BEGIN RAISE EXCEPTION 'CI_VERIFIED_ORG_REQUIRED'; END $$;
\endif
\if :{?verified_project}
\else
DO $$ BEGIN RAISE EXCEPTION 'CI_VERIFIED_PROJECT_REQUIRED'; END $$;
\endif
\if :{?verified_branch}
\else
DO $$ BEGIN RAISE EXCEPTION 'CI_VERIFIED_BRANCH_REQUIRED'; END $$;
\endif
\getenv ci_sslmode PGSSLMODE
\if :{?ci_sslmode}
\else
DO $$ BEGIN RAISE EXCEPTION 'CI_VERIFY_FULL_REQUIRED'; END $$;
\endif
-- Set only by the reviewed initializer after checking this same psql session's
-- client-side conninfo with verify-full. This is an operator boundary, not a
-- server-verifiable attestation; never invoke these scripts directly.
\if :{?ci_client_tls_verified}
\else
DO $$ BEGIN RAISE EXCEPTION 'CI_CLIENT_TLS_REQUIRED'; END $$;
\endif
SELECT
  :'execution_approval' = 'INITIALIZE_SNOWY_ART_PILOT'
  AND :'verified_org' = 'org-shy-brook-84467702'
  AND :'verified_project' = 'snowy-art-90934943'
  AND :'verified_branch' = 'br-empty-breeze-b51o9q71'
  AND :'HOST' = 'ep-green-silence-b5lbunar.c-7.us-east-2.aws.neon.tech'
  AND :'PORT' = '5432'
  AND :'ci_sslmode' = 'verify-full'
  AND current_database() = :'expected_database'
  AND session_user = 'neondb_owner' AND current_user = session_user
  AND :'ci_client_tls_verified' = 'PSQL_VERIFY_FULL_SAME_SESSION'
  AND current_setting('server_version_num')::int BETWEEN 180000 AND 189999
  AS ci_target_ok \gset
\if :ci_target_ok
\else
DO $$ BEGIN RAISE EXCEPTION 'CI_SQL_TARGET_DENIED'; END $$;
\endif
-- HOST/TLS bind the connection. Project/branch assertions are NOT server attestation;
-- the executing operator must independently verify endpoint ownership immediately first.
