# Phase 5F: confirmed failure and local correction

Run [41866256759](https://github.com/Gilsuhar/Primelis-Outbound-Intelligence/actions/runs/41866256759)
completed with failure on attempt 1 at commit `5923cef832b2a89640b4eafbd638b4ef1609e0f0`.
Do not rerun that job or update/recreate its published branch.

## Evidence and transaction state

- The published runner can return `PREVIEW_ROLE_CLIENT_FAILED` only after the
  actual-client `\conninfo` gate passed and SQL was released. The pinned libpq
  connection used verify-full, the reviewed CA, hostname validation and the
  approved Session Pooler endpoint. This failure was not a TLS-report parser error.
- Sanitized PostgreSQL logs for 2026-11-04 16:29:55–16:30:10 UTC identify one
  SQLSTATE `42809` (`wrong_object_type`), "not a sequence", in `DO $privileges$`,
  PL/pgSQL line 4 at IF. Only fixed categories/counts were returned; no relation
  names, usernames, raw SQL contexts or connection details were exposed.
- This is the final guard AFTER CREATE ROLE, ALTER ROLE, REVOKE and GRANT in the
  single transaction and BEFORE COMMIT. Writes were attempted and rolled back.
  It would be incorrect to report that no SQL transaction or write was attempted.
- Independent read-only inspection confirmed the role is absent. The prepared
  read-only preflight passed the pinned identity/fingerprint, schema baseline,
  all 11 completed migration names/checksums, expected 50 tables, RLS/API-role
  restrictions, zero application/Auth records, role absence, grant authority and
  effective PUBLIC checks. No role provisioning or repair was executed.

## Root cause and narrow correction

`relkind='S' AND has_sequence_privilege(...)` does not enforce evaluation order.
PostgreSQL evaluated the privilege function on a non-sequence OID. A separate
SELECT-only reproduction with an existing role reproduced the same error; the
CASE-protected form completed and still detected sequence privileges. No role
was created for this reproduction and no application rows were read.

Use `CASE WHEN relkind='S' THEN has_sequence_privilege(...) ELSE false END` in
both the transaction's final guard and the independent postcheck. The checked
privileges remain USAGE, SELECT and UPDATE on every sequence without a schema
exemption. All grants and revokes, target checks and TLS requirements remain
unchanged. Update only the reviewed SQL digest; retain the database baseline.

[PostgreSQL evaluation rules](https://www.postgresql.org/docs/17/sql-expressions.html#SYNTAX-EXPRESS-EVAL)
document that WHERE predicates can be reordered and CASE can constrain evaluation.

## Diagnostics

The pinned psql invocation now captures verbose errors privately for SQLSTATE
classification, with context display disabled. Stdout/stderr never reach logs.
The final output allows only fixed categories and phases plus a SQL-release
boolean. Categories distinguish DNS/TCP/timeout/authentication, certificate and
hostname validation, TLS handshake/evidence parsing, process/pipe/signal errors,
SQL object type/permission/syntax/read-only/guard failures and malformed results.
The three reviewed transaction guard exceptions are recognized as guard failures.
Unknown errors still fail closed. No retry or automatic recovery is introduced.

`UNKNOWN_CHECK_BEFORE_RETRY` remains conservative for unacknowledged execution:
SQL release alone cannot prove COMMIT or rollback. Independent state inspection
resolved this particular attempt as rolled back. Future failures require the same
inspection before any separately authorized attempt.

## Validation and next boundary

- Focused client/TLS/provisioning/owner/identity suites: 363 passed, 0 failed,
  0 skipped across 9 files (27 new regression cases).
- Security suites: 190 passed, 0 failed, 0 skipped across 12 files.
- TypeScript, ESLint, Prisma validation and actionlint 1.7.12 passed.
- Gitleaks 8.30.1 found zero findings in the nine changed publication files;
  the supplemental provider-pattern history scan also returned zero findings.
- SQL behavior was checked through read-only SELECTs on the approved project;
  provisioning/process tests remain mocked locally. The corrected transaction
  has not been executed. Successful provisioning is not claimed.
- The 11 migrations, Prisma schema, lockfile, workflow, owner guards, trusted CA
  and Vercel exclusion are unchanged from the published commit.

Ready for a fresh read-only preflight after local validation. A future execution
requires explicit approval of the new commit and matching environment SHA/sole
Branch rule, fresh role-absence/privilege checks and a new one-time branch. This
task does not update GitHub settings, publish a branch or authorize provisioning.
