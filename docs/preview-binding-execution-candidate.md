# Corrected SALES_USER binding candidate (Phase 5P)

Prepared from reviewed fix commit 689308270bdc7a13d2adfa351d0a0513bbf9c97d.
This preparation changes documentation only. No cloud settings, database objects,
credentials, workflows or remote branches are changed or executed.

Target: agent-workforce-preview / txfxfrlhtvzwgluhnbpw / Primelis / us-west-2.
Approved identity remains the pinned UUID/email in profile-binding-manifest.json.

## Reverified boundaries

- Literal callback substitution preserves the numeric temporary-schema regex,
  without JavaScript replacement-string expansion or duplicated SQL.
- Primary PostgreSQL errors are classified by their actual SQLSTATE/message;
  echoed guard names cannot turn parser errors into baseline rejections.
- The baseline digest, all 11 migrations, Prisma schema, dependency lockfile and
  original bind-test-user.sql are unchanged from the published reviewed candidate.
- Fresh management metadata reports ACTIVE_HEALTHY. SELECT-only inspection inside
  a read-only transaction evaluated all 16 generated preflight conditions as true.
  The corrected snapshot expressions parsed on PostgreSQL and matched the existing
  baseline under the fixed pg_catalog search path and C-collation ordering.
- Exactly one approved confirmed nonanonymous email/password Auth identity, zero
  profiles/public policies, zero other application rows, restricted NOLOGIN role
  without password, five profile-column grants, 11 matching migrations, 50 tables,
  RLS and denied API-role access were confirmed. Fingerprint/identity checks passed.
- Management inspection does not replace execution-time actual-client TLS checks.
  The pinned psql client still requires verify-full, the trusted CA and approved
  hostname/port, then verified conninfo before SQL is released on each connection.
- The same SQL session performs fresh read-only preflight before binding. A failed
  check terminates psql with ON_ERROR_STOP before the write transaction is reached.
- Only one plain SALES_USER INSERT and one identity/role-scoped SELECT policy are
  permitted in the unchanged atomic transaction. No overwrite, Auth write, grant,
  password, LOGIN, migration, reset, seed, email or external-provider operation.
- Failure before COMMIT rolls back both changes. Independent read-only postchecks
  run on another strictly validated client connection; an uncertain COMMIT result
  or postcheck failure requires investigation, never automatic retry or recovery.
- Owner ID/name, exact repository, approved SHA, initial branch creation, first
  attempt, no force/update, environment and branch-policy checks remain mandatory.
- Root vercel.json still disables Git deployments only for the existing dedicated
  setup namespace. No Production or Vercel configuration was changed.

## Environment preparation and next authorization

Validation rerun for this preparation: focused suite 459 passed / 0 failed /
0 skipped (9 files); security suite 212 passed / 0 failed / 0 skipped (13 files,
overlapping coverage). TypeScript, ESLint, Prisma validation and actionlint passed.
Provider-pattern scan: 814 intended files, zero findings. Full-tree Gitleaks:
exit 1, nine previously reviewed generic-api-key false positives (approved UUIDs,
migration checksum literals, prose and synthetic test request identifiers), zero
confirmed secrets. No scanner exclusion or allowlist was added.

Use the final commit of this preparation as the execution SHA. Set
PREVIEW_SETUP_APPROVED_SHA to that exact 40-character commit, and replace all old
deployment rules with one Branch rule named:

    codex/preview-migration-txfxfrlhtvzwgluhnbpw-<exact-final-SHA>

Keep PREVIEW_SETUP_DATABASE_URL unchanged in agent-workforce-preview-setup.
Keep PREVIEW_SETUP_APPROVED_ENDPOINT as aws-1-us-west-2.pooler.supabase.com:5432.
Keep administrator bypass disabled and the reviewed owner-operated configuration.
No settings were applied by this preparation.

After the operator saves those changes, perform final read-only publication
preflight: exact SHA/rule, secret presence, endpoint, owner, branch absence and
deployment exclusion. Only separate owner authorization may publish the exact new
branch once. Do not rerun or modify any previous failed branch or workflow.

Execution must repeat the live checks: today's read-only evidence is not a promise
that the database cannot change. Keep concurrent administrative operations stopped
between preflight and binding. Runtime LOGIN remains outside this authorization.
