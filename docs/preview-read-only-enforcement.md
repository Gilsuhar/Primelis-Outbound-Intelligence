# Read-only enforcement correction (Phase 4O)

Historical implementation report. The subsequent [Phase 4P audit](preview-verification-role-audit.md)
supersedes the unverified grant assumptions and provisioning steps below: live grant-authority and
PUBLIC-routine blockers were confirmed. Do not execute the role proposal. Auth SELECT is now ID-only,
and PUBLIC CREATE is checked rather than revoked; PUBLIC TEMP revocation remains proposed.

Local implementation only. No database or GitHub settings have been changed. Do not rerun initialization,
the diagnostic run 41717191903, or any previously published branch. The eleven migrations, Prisma model,
lockfile, target fingerprint, CA, workflow and Vercel exclusion are unchanged.

## Evidence and root cause

The approved diagnostic confirmed both TRANSACTION_READ_ONLY and DEFAULT_TRANSACTION_READ_ONLY failed;
all other identity checks passed. The defect was relying on a URL startup option as enforcement.
Prisma 5.22 parses `options` and passes it to its PostgreSQL driver. Current upstream Supavisor constructs
its own backend startup option set without arbitrary client GUCs. This supports the pooler explanation,
but does not identify the managed pooler's deployed version. Do not attribute this to missing Prisma
support or claim that a new login's behavior has already been tested.

- [Pinned Prisma 5.22 URL parser](https://github.com/prisma/prisma-engines/blob/5.22.0/quaint/src/connector/postgres/url.rs)
- [Pinned Prisma driver](https://github.com/prisma/prisma-engines/blob/5.22.0/quaint/src/connector/postgres/native/mod.rs)
- [Supavisor backend startup](https://github.com/supabase/supavisor/blob/main/lib/supavisor/db_handler.ex)
- [PostgreSQL transaction modes](https://www.postgresql.org/docs/17/sql-set-transaction.html)
- [PostgreSQL role login defaults](https://www.postgresql.org/docs/17/sql-alterrole.html)

Changing a single session cannot secure a separate schema-engine connection. PostgreSQL applies role
defaults at backend login, not on SET ROLE, and role/database-specific overrides take precedence.
Defaults are mutable configuration, not a privilege boundary. Read-only transactions and restrictive
database privileges are both required; no privileged administrator fallback remains in the full verifier.

## Implemented query path

`verify-only.mjs` requires a separate `PREVIEW_VERIFY_DATABASE_URL` for the exact role
`recycler_preview_verify` and approval `verify-readonly:txfxfrlhtvzwgluhnbpw`. It rejects an injected
`PREVIEW_SETUP_DATABASE_URL`, missing credentials, administrator usernames, arbitrary options and other
targets. Cloud execution retains all existing owner/SHA/creation/environment checks. No application
configuration or authentication path consumes this credential.

Every verification query runs on Prisma 5.22's interactive transaction connection. The first explicit
command is `SET TRANSACTION READ ONLY`. Then the fixed identity SELECT requires both transaction_read_only
and default_transaction_read_only to be on, along with the original database/fingerprint/superuser checks
and the exact new login/effective role. The code never sets a session default to conceal a missing
server-side default. A separate catalog SELECT checks role defaults, absence of database overrides,
memberships, ownership, CREATE/TEMP, table/column/sequence write privileges, callable non-system routines,
and row_security. Failure stops before history, data or schema inspection.

Only a read interface is passed to the existing history/RLS/count verifier. No raw execution, model
mutation, transaction control, migration, reset or seed dependency is passed. The approved SQL remains
fixed code; this is not a general SQL execution service. Transaction control is connection-local and
performs no persistent schema/data writes. No transaction retry is added.

## Separate Prisma diff connection

`runSchemaDiff` independently opens and audits a fresh restricted-role transaction before starting its
fixed `migrate diff --from-schema-datasource ... --to-schema-datamodel ... --exit-code` subprocess.
Both DATABASE_URL and DIRECT_URL point to the identical restricted login and pinned CA. No administrator,
production environment, arbitrary startup option, shadow database or executable SQL output is passed.
The child process receives only a minimal environment and has a timeout; no retry or recovery exists.

The audited transaction is **not** the schema engine's session. Per-session SETs are not claimed to carry
over. Protection of the engine's independently opened backends comes from the verified server-side role
defaults and effective privileges, not from that audit transaction. PostgreSQL applies those defaults at
each new login; table/schema write permissions remain denied even if a client changes a transaction mode.
The pinned [schema connector](https://github.com/prisma/prisma-engines/blob/5.22.0/schema-engine/connectors/sql-schema-connector/src/flavour/postgres/connection.rs)
uses the same native TLS connector. No READ WRITE override is provided by this execution path.

Prisma 5.22's CLI does not expose a hook to run our identity SELECT inside its own session. We do not claim
an in-process observation of that session's settings. Managed-pooler behavior for the proposed fresh login,
permissions to read identity catalogs, and actual schema-engine compatibility still need controlled live
validation after separately approved role provisioning. If the audit sees a stale/writable backend,
missing defaults or unsafe grants, the diff subprocess is never launched. Do not reuse existing pooled
administrator sessions or globally change postgres defaults as a workaround.

## Role proposal, not provisioning

[verification-role.sql](../scripts/preview/verification-role.sql) is generated deterministically from the
reviewed migrations and manifest by a local-only module. No workflow references or executes it. It first
checks the pinned fingerprint, administrator identity, exact eleven history names/checksums/statuses,
expected table inventory, RLS/API restrictions, absence of data/Auth users/policies/runtime role, and
absence of an existing verifier role. Failures abort the transaction; there is no IF NOT EXISTS reuse.

The proposal creates a NOLOGIN, passwordless, NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOREPLICATION/NOINHERIT/
NOBYPASSRLS role. It configures role-level default_transaction_read_only=on and row_security=on, grants
only CONNECT, required schema USAGE, the identity function and SELECT on the 50 reviewed tables plus
auth.users. It also revokes PUBLIC TEMP on this dedicated database and PUBLIC CREATE on public.
Those two PUBLIC revocations affect all roles in this Preview project and require explicit review.

Because RLS otherwise hides rows, it proposes one SELECT-only policy per required relation, scoped only to
the verification role. The full verifier requires all 51 exact policies (name, role, SELECT, true predicate,
no WITH CHECK), retains mandatory public-table RLS and denied anon/authenticated grants, and still rejects
any unexpected data or history mismatch. Neither BYPASSRLS nor SECURITY DEFINER is introduced.

The SQL checks effective grants as the new role before commit. PUBLIC privileges cannot be removed merely
by revoking them from that role. Existing callable non-system functions or other inherited privileges can
therefore block provisioning. The proposal intentionally aborts rather than revoking managed Supabase
grants broadly. Those actual grants and the operator's ability to grant pg_control_system access are
unverified; a narrow read-only catalog audit must resolve them before approving execution of this SQL.
No password activation or LOGIN change is included. No Auth user or application runtime role is created.

Rollback, if provisioning is later approved: disable any separately activated verifier login and remove
its secret first; under the same identity guard, drop only the 51 named role-specific policies, revoke
the proposal's explicit grants/defaults, then drop this role. Never use DROP OWNED or CASCADE. Restore
PUBLIC TEMP/CREATE only if the captured pre-change ACLs show they existed and separate approval covers
restoration. No application table or migration record is changed by role setup or rollback.

## Minimum next step and boundaries

1. Approve a read-only catalog audit of this dedicated Preview for the proposed role's effective PUBLIC
   privileges and administrator grant authority. Do not apply the proposal blindly or suppress failures.
2. Review the exact SQL and any concrete ACL blockers. Separately approve role/policy provisioning,
   secure login activation and a dedicated environment-scoped PREVIEW_VERIFY_DATABASE_URL. Retain the
   administrator setup secret separately; never copy it into the verification secret.
3. After provisioning, authorize a fresh restricted-login read-only verification candidate. Only then
   change the workflow from diagnostic-only to the full verifier and pin its new SHA/branch. This local
   commit deliberately prepares no new execution branch and leaves the existing workflow untouched.

Cloud verification is **NO-GO until those prerequisites are met**. Mocked tests cannot prove live role
grants, managed-pooler defaults, or the actual Prisma diff result. No remote test was performed here.

## Local validation

340 focused tests (8 files) and 184 security/authentication tests (11 files) passed, with zero failures
or skips. After final connection-validation ordering/cleanup edits, the 96 affected tests passed again.
TypeScript, ESLint and Prisma schema validation passed. Gitleaks reported two generic-key matches in
the SQL proposal; both were verified as exact migration SHA-256 values from the existing reviewed
manifest, not credentials. No scanner exclusion was added. The supplemental provider-pattern scan
found zero findings across all 18 changed files. The SQL proposal was generated and inspected locally,
not executed against PostgreSQL. No production build or complete application test suite was rerun.
