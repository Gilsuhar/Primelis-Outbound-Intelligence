# Phase 5G: corrected runtime-role execution candidate

Reviewed implementation: `eb3df284177b52724dbabaf08d1afd6d7bc91725`.
This final preparation adds only this record; no further runner, SQL or workflow changes.
The commit containing this record is the execution candidate. Its full SHA must be
used for both environment approval and the one-time branch suffix.

## Current read-only evidence (2026-11-04)

- Management metadata: agent-workforce-preview, txfxfrlhtvzwgluhnbpw, Primelis
  organization, us-west-2, ACTIVE_HEALTHY.
- The reviewed `runtimeAuditSql(false)` completed in BEGIN READ ONLY / ROLLBACK.
  Fingerprint, database/operator identity, 11 completed migration names/checksums,
  exact expected 50-table inventory, pinned schema baseline, RLS, denied API-role
  access, zero application/Auth rows, role absence, grant authority and effective
  PUBLIC privilege checks all passed. The returned digest was suppressed; the
  internal comparison was retained. Backend TLS was reported on this inspection
  connection, not assumed to describe every pooler session.
- recycler_preview_app remains absent. Together with the final-guard error before
  COMMIT in run 41866256759, this confirms the prior transaction rolled back.
- A SELECT-only evaluation across pg_class completed on all rows, including
  non-sequences, using the CASE-protected sequence privilege expression. No role
  was created or activated for this check.
- The credential-free pinned-CA TLS probe passed DNS, TCP, SSLRequest and strict
  certificate-chain/hostname verification against the approved Session Pooler.

## Correction and preserved boundaries

Both runtime-role.sql and the independent postcheck wrap has_sequence_privilege
inside a row-dependent CASE WHEN relkind='S'. Non-sequence OIDs cannot reach that
function. This uses neither a constant-expression exception nor an aggregate
inside CASE. USAGE/SELECT/UPDATE checks still cover every actual sequence.
See [PostgreSQL expression evaluation](https://www.postgresql.org/docs/17/sql-expressions.html#SYNTAX-EXPRESS-EVAL).

The transaction still creates only recycler_preview_app, NOLOGIN, with no password
or elevated attributes. Its only object reads are SELECT on User(id, authUserId,
email, name, role), plus required CONNECT/schema USAGE. RLS still denies rows until
a separately approved profile-specific policy exists. No outgoing memberships,
ownership, writes, sequence privileges or unexpected effective access are allowed.
The existing reviewed PUBLIC revocations and default-function-privilege restriction
are unchanged. The PostgreSQL-created incoming ADMIN-only grant to the creator is
allowed only with INHERIT and SET disabled; it grants the app no elevated membership.

The actual provisioning psql session must independently pass conninfo before SQL
release, with verify-full, the fingerprint-pinned CA and exact hostname/port. The
separate preliminary TLS probe is not a substitute for that execution-time gate.
Database fingerprint, schema baseline and all preflight/postcheck gates remain
mandatory. Failure still stops immediately without retry or automatic recovery.

All 11 migration files, aligned Prisma schema, dependency lockfile, workflow,
owner checks, CA configuration and root vercel.json are unchanged from 5923cef.
The exact setup-branch namespace matches git.deploymentEnabled=false; main does
not match. This is the supported Git deployment exclusion, not an Ignored Build
Step. See [Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration#git.deploymentenabled).
The previously verified project root/settings are relied upon; final publication
preflight must reconfirm saved approvals and absence of the new remote branch.

## Local validation

- Focused client/TLS/provisioning/workflow/identity: 363 passed, 0 failed, 0 skipped
  across 9 files.
- Security: 190 passed, 0 failed, 0 skipped across 12 files.
- TypeScript, ESLint, Prisma schema validation and actionlint 1.7.12 passed.
- No database write, workflow execution, role provisioning, publication or cloud
  configuration change was performed. The corrected role transaction remains
  unexecuted; these results do not claim provisioning success.

## Exact next configuration procedure (operator, not executed here)

In GitHub environment agent-workforce-preview-setup:

1. Set PREVIEW_SETUP_APPROVED_SHA to the full execution candidate SHA reported
   with this preparation.
2. Replace all deployment policies with one **Branch** rule:
   codex/preview-migration-txfxfrlhtvzwgluhnbpw- followed by that identical SHA.
3. Keep PREVIEW_SETUP_DATABASE_URL unchanged. Keep PREVIEW_SETUP_APPROVED_ENDPOINT
   equal to aws-1-us-west-2.pooler.supabase.com:5432.
4. Keep administrator bypass and required reviewers disabled. Owner identity,
   first-attempt branch creation and exact SHA are enforced by the reviewed job.
5. Request final read-only publication preflight. Publishing and provisioning
   require separate explicit approval; never update/recreate an old execution
   branch or rerun a failed job.

GO for final publication preflight after these metadata updates. Effective role
privileges must still be checked inside the future transaction and independently
afterward. No LOGIN, password, Auth user or application profile is authorized.
