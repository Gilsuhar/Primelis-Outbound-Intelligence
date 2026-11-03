-- NOT EXECUTED. Separate approval must explicitly include creating this database.
-- Connect to the verified empty neondb, using explicit PGHOST/PGPORT/PGUSER and
-- PGSSLMODE=verify-full. Never pass a connection URI that overrides these settings.
\set expected_database neondb
\ir target-guard.sql
SELECT pg_advisory_lock(hashtextextended('ci-pilot-initialize-20261019',0));
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_database WHERE datname='ci_acceptance_pilot')
     OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ci_acceptance_app')
     OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname NOT IN ('pg_catalog','information_schema')
         AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'
         AND c.relkind IN ('r','p','v','m','f')) THEN
    RAISE EXCEPTION 'CI_INITIALIZATION_TARGET_NOT_EMPTY';
  END IF;
END $$;
-- CREATE DATABASE cannot be transactional. If later initialization fails, keep the
-- new database for inspection; never automatically drop/reset/recreate it.
CREATE DATABASE ci_acceptance_pilot OWNER neondb_owner TEMPLATE template0;
REVOKE ALL ON DATABASE ci_acceptance_pilot FROM PUBLIC;
SELECT pg_advisory_unlock(hashtextextended('ci-pilot-initialize-20261019',0));
-- No schema, data or privileges in neondb or any other database are altered.
