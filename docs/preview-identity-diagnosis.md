# Preview identity diagnosis (Phase 4M)

Target: `txfxfrlhtvzwgluhnbpw` only. Failed verification run: 41713003598 at published commit
`e70aaca60389f76274da4b609b775ec334a5fa88`. This is a local diagnostic revision, not an execution candidate.
Do not rerun that workflow, update its branch, or initialize the database again.

## What is and is not established

The published `verify-only.mjs` checked one row, database name, session user, pinned cluster fingerprint
and `transaction_read_only`. Any mismatch emitted the same `PREVIEW_SETUP_TARGET_REJECTED`. Plan and TLS
completed and the identity query returned, but the error contains none of the compared values. The exact
failed condition cannot be recovered locally. History, RLS and Prisma diff were never reached.

The new `identity.mjs` factors that fixed SELECT and validation into a shared helper. The original checks
remain mandatory. It additionally checks `current_user`, the session/effective roles' superuser flags and
`default_transaction_read_only`. There is no alternate accepted pooler identity or fingerprint override.

| Failed identifier | Required observation |
| --- | --- |
| IDENTITY_RESULT_COUNT | Exactly one result row |
| IDENTITY_ROW_SHAPE | A non-null object row |
| DATABASE_NAME | The approved database name |
| SESSION_USER | The originally approved PostgreSQL login role |
| CLUSTER_FINGERPRINT | Exact independently recorded fingerprint in verified-target.json |
| TRANSACTION_READ_ONLY | Current transaction reports on |
| EFFECTIVE_ROLE | The originally approved role is also the permission-checking role |
| SESSION_ROLE_NOT_SUPERUSER / EFFECTIVE_ROLE_NOT_SUPERUSER | Both catalog flags are explicitly false |
| DEFAULT_TRANSACTION_READ_ONLY | New transactions on this connection default to read-only |

Only the first five original conditions (result count, name, session user, fingerprint, transaction flag)
can explain the historical gate. The new checks provide additional evidence; do not retroactively attribute
the old failure to one of them. Missing/unknown values fail closed. Mixed identity/read-only failures retain
all failed identifiers; exclusively read-only failures have READ_ONLY stage and PREVIEW_SETUP_READ_ONLY_REJECTED.

## Session pooler and privilege interpretation

- PostgreSQL distinguishes `session_user` (connection identity) from `current_user` (effective permission
  context). SET ROLE and SECURITY DEFINER execution can change the latter. Checking only the login role is
  insufficient; removing it and checking only the effective role would also discard useful evidence.
  [PostgreSQL 17 session information](https://www.postgresql.org/docs/17/functions-info.html).
- The pooler URL's project suffix is a routing identifier, not proof that the database role has that suffix.
  Supavisor's backend startup uses its resolved database user; its tenant suffix is used for inter-pooler
  proxy routing. No reviewed evidence establishes that this managed session legitimately reports a different
  session role. Keep both role requirements; reject a platform service identity or a role switch pending
  evidence and separate review. [Supavisor backend source](https://github.com/supabase/supavisor/blob/main/lib/supavisor/db_handler.ex).
- A concrete compatibility lead: current upstream DbHandler constructs backend options from search_path and
  proxy-specific fields; it does not forward arbitrary client GUCs such as default_transaction_read_only.
  StartupOptions parsing alone does not prove forwarding. The deployed managed pooler version/configuration
  is unknown, so this is a supported hypothesis, not confirmation of the failed run's values.
- `transaction_read_only` describes this transaction; `default_transaction_read_only` controls later ones.
  Requiring both prevents a single read-only transaction being mistaken for a read-only session.
  [PostgreSQL 17 connection defaults](https://www.postgresql.org/docs/17/runtime-config-client.html).
- Supabase's customer administrator role is not a PostgreSQL superuser, but it is still privileged. This
  diagnostic does not turn the existing administrator credential into a least-privilege credential and does
  not claim to reject every legitimate administrative grant. It rejects unapproved role identities and
  superuser elevation; fixed SELECT-only code and read-only checks constrain this operation. RLS/anon and
  authenticated privileges remain separately verified in the full verifier.
  [Supabase role limitations](https://supabase.com/docs/guides/database/postgres/roles-superuser).

## Diagnostic boundary

`diagnose-identity.mjs --diagnose-identity` reuses setupPlan's exact target, endpoint, username format, TLS
query-parameter, manifest and CI owner/SHA/branch/environment checks. It performs the existing strict CA and
hostname probe, then uses Prisma 5.22 with the same pinned CA and read-only startup option as the failed run.
It sends exactly one fixed SELECT, disconnects and stops. No SET, set_config, role change, retry, session repair,
history query, application data query, schema diff, initializer, migration or seed is invoked.

Successful output is `[]`, meaning identity/session checks only. Failure output is an array of allowlisted
condition identifiers. Returned database values, usernames, fingerprint, connection strings, SQL errors,
passwords and tokens are never printed. Query/TLS/configuration errors have fixed sanitized identifiers.
No exception from disconnect can reveal its raw message or mask an earlier condition failure.

The full verifier reuses the same stricter identity helper and emits the allowlisted failed conditions in
its sanitized report. Only after all identity/session checks pass can its existing history, RLS, empty-data
and schema-diff checks run. No workflow or migration file changed in this revision.

## Next action — separate approval required

Authorize one identity-only probe through the same session pooler and pinned Prisma client, using a trusted
operator-controlled runtime with secure injection of PREVIEW_SETUP_DATABASE_URL and the existing non-secret
project/name/endpoint inputs; operation approval remains `verify:txfxfrlhtvzwgluhnbpw`. Never put the URL in
arguments, chat, source files or logs. The command, only after that approval, is:

```sh
node scripts/preview/diagnose-identity.mjs --diagnose-identity
```

GitHub-held secrets cannot be read back into a local process. If secure operator-side injection is unavailable,
an explicitly approved diagnostic-only cloud invocation must be arranged separately, retaining the existing
owner/commit/environment guards. Do not unset CI variables to evade them. This revision prepares no setup
branch, environment update or remote invocation. Management-API SQL is not a substitute: it uses a different
connection path and cannot establish the Session Pooler session's role/read-only behavior.

If only read-only conditions fail, review a connection-local solution that demonstrably covers every actual
Prisma verifier and schema-engine connection, or use a compatible approved direct endpoint with strict TLS.
Setting one Prisma session read-only cannot secure the separate migrate-diff subprocess. Do not silently
accept off, globally alter a role/database, change credentials, or force a pooler reconnect as a workaround.
If any identity/role/fingerprint condition fails, stop and investigate that condition; do not expand allowlists.

After a supported correction, a new separately authorized full verification-only execution is required.
Auth/runtime-role provisioning and deployment remain blocked until EXISTING_SCHEMA_VERIFIED. The eleven
applied migration files, model, reviewed manifest, lockfile and workflow remain unchanged.

## Local validation

280 focused tests passed (7 files), including 49 identity-diagnostic cases; 184 Preview security/authentication
tests passed (11 files). Both suites had zero failures and skips. TypeScript, ESLint and Prisma validation
passed. Gitleaks and supplemental provider-pattern scans found zero findings across the ten changed files.
Validation used the existing offline network guard and mocked identity responses. No credentialed diagnostic,
remote database call, workflow execution, push or infrastructure change was performed for Phase 4M.
