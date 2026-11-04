# One-time Preview runtime role — Phase 5D

Phase 5D correction prepared locally only. Previous run 41856706050 stopped before role creation;
the role remained absent and the independently checked database state was unchanged.
This supersedes the execution proposal in runtime-role-preflight.md; the application remains
unchanged. Target: txfxfrlhtvzwgluhnbpw / Primelis (ernouvntcojrxlahtbcr), us-west-2.

## One execution method

Reuse `.github/workflows/preview-database-setup.yml`, environment
`agent-workforce-preview-setup`, and its existing `PREVIEW_SETUP_DATABASE_URL` secret.
The owner deliberately creates one new SHA-named branch; the workflow runs on that creation only.
There is no ordinary-push migration trigger, dispatch input, schedule, retry or new cloud service.
The owner must approve the final commit and transaction before publication.

The workflow keeps the existing immutable repository/owner IDs, actor and triggering-actor checks,
exact SHA/branch checks, first-attempt/creation-only checks and environment API validation.
The existing `vercel.json` excludes this exact setup namespace from native Vercel Git deployments.
Before publication recheck external webhooks/custom deployment automation; that cannot be proved
by local code or by vercel.json alone. Do not publish the normal release branch.

The workflow uses Node 24.22.1 and an official PostgreSQL 17.11 Debian client image pinned to the
linux/amd64 manifest digest in `runtime-role-manifest.json`. Public Docker Hub tag metadata and the
official Dockerfile were inspected on 2026-11-04. `psql --version` must match the pinned version.
The image is pulled before secret injection. Its entrypoint is overridden with the absolute psql
binary: no PostgreSQL server, initdb or image initialization script is started. No package lifecycle
scripts, application dependencies or Prisma commands are required in this workflow.

The only secret-bearing commands are:

```sh
node scripts/preview/provision-runtime-role.mjs --plan
node scripts/preview/provision-runtime-role.mjs --provision-nologin-role
```

## Actual SQL connection and authorization

The runner requires the approved endpoint `aws-1-us-west-2.pooler.supabase.com:5432`, the exact
project-specific administrator username, database postgres, approved SHA and one matching Branch
rule. Both legacy projects and application/Production URL fallbacks are rejected. The existing
stored URL retains `sslmode=require&sslaccept=strict`; it is validated, not passed directly to libpq.

The pinned Supabase CA is verified for fingerprint, self-signature and validity. The existing TLS
probe checks certificate chain and hostname. Independently, **every actual psql connection** uses
`PGSSLMODE=verify-full`, the same verified `PGSSLROOTCERT`, TLS >=1.2 and GSS encryption disabled
so it cannot silently replace TLS. No hostaddr, service, client-selected options or Docker context
is inherited. The child receives no GitHub token or unrelated provider credentials.

Before releasing any SQL, `psql-tls-session.mjs` sends only `\conninfo` and a fixed `\echo`
marker to the actual pinned psql process. It validates its live libpq connection report against
the approved database/user/host/port and requires TLS 1.2/1.3, a cipher, compression off and
strict transport settings. LC_ALL=C fixes the reviewed PostgreSQL 17 output format. Unknown,
missing, duplicate or malformed evidence, process errors and timeout fail closed. Only then is
the fixed SQL released to that same process/connection. Both APPLY and independent VERIFY use
this gate. Raw connection identity and stderr remain private; only fixed outcomes are logged.
The existing independent CA/hostname probe remains mandatory. Successful libpq verify-full
enforces chain and hostname validation; conninfo additionally proves TLS is active on that client.

The decoded database password is held in a private 0600 temporary PGPASSFILE inside a 0700
directory, mounted read-only into the client. It is never a command argument, Docker environment
value, console output or artifact. Password-file escaping and newline/NUL rejection are enforced.
Cleanup removes the file; a timed-out client container is terminated. Raw stdout/stderr are never
printed. The administrator credential remains privileged; its use is restricted by the reviewed
runner and fixed SQL, not by least-privilege administrator grants.

## Transaction and checks

`runtime-provisioning-sql.mjs` constructs fixed catalog/count checks from the reviewed migration
manifest. No caller-provided SQL is accepted. Preflight runs in BEGIN READ ONLY with verified
read-only settings and row_security=off (error on filtered counts; not a bypass). It requires:

- The independently pinned cluster fingerprint, database, session and effective operator identity.
- Independently verified client-to-pooler TLS (before SQL), PostgreSQL 17 and exact 11 completed
  migration names/checksums. Backend TLS is reported separately, as described below.
- The 50 expected public tables, RLS enabled, zero anon/authenticated table/column access,
  zero application rows/Auth users/public policies and no existing runtime role.
- Actual grant authority for the role transaction, prospective effective PUBLIC access (including
  schema USAGE), and column-level authority to independently check password absence in pg_authid.
  If password metadata is unavailable, stop before CREATE ROLE; do not add system grants.

The same psql session then executes the hash-pinned `runtime-role.sql` exactly once. It contains
its own BEGIN/COMMIT and target/privilege checks. It creates only recycler_preview_app, NOLOGIN
and without a password. Grants remain CONNECT, public USAGE and SELECT on User's
id/authUserId/email/name/role only. Existing reviewed PUBLIC hardening remains: revoke public
CREATE, database TEMP, executable non-extension public functions and the operator's default
public function EXECUTE. No extension/system permission, table definition or RLS policy is changed.

A separate verify-full connection performs independent read-only postchecks: password absence,
NOLOGIN/role attributes/defaults/memberships/ownership, exact five columns with no grant option,
effective reads/writes/sequences/routines, unchanged 11 checksums, RLS/API denial and empty data.
Before/after catalog digests compare public definitions, constraints, indexes, enum types, triggers,
Auth/extension ACLs and unrelated role attributes/memberships against the independently observed
read-only baseline pinned in runtime-role-manifest.json. Drift stops before the first write; the
same baseline is required after provisioning. No schema diff or migration is rerun;
the previously successful Prisma alignment audit remains the schema baseline, while these checks
verify expected tables/history and that this transaction has not changed definitions.

Any error stops psql with ON_ERROR_STOP. A failure inside the role transaction rolls back on
disconnect. A lost COMMIT acknowledgement is UNKNOWN, not proof of rollback. A postcheck failure
is APPLIED_VERIFICATION_FAILED; neither case triggers reset, retry, DROP ROLE or automatic recovery.
An independently approved read-only inspection must resolve it first. No LOGIN, password, Auth
binding, profile or application RLS policy is created. Profile rows remain inaccessible under RLS
until separately approved user binding.

## PostgreSQL 17 creator membership correction requiring review

PostgreSQL automatically grants a newly created role back to a non-superuser creator as
ADMIN TRUE, SET FALSE, INHERIT FALSE, granted by bootstrap superuser OID 10. The old guard rejected
that normal catalog row. It is not a grant of postgres privileges to the application role.

The local SQL sets `createrole_self_grant=''` to prevent optional SET/INHERIT grants. It permits
only that exact incoming creator grant to postgres; all outgoing memberships, other members,
other grantors and SET/INHERIT-enabled grants remain forbidden. Independent postchecks require
exactly that one creator grant. No new GRANT membership statement is added. This preserves the
runtime role's lack of inherited/elevated privileges; it does not claim zero pg_auth_members rows.
The administrator retains the PostgreSQL-standard ability to administer the role. Review this
specific correction with the execution commit; do not silently relax it at execution time.

## Owner steps after review (not performed)

1. Approve this exact commit, SQL hash, creator-grant distinction and one role-provisioning run.
2. In the existing environment replace PREVIEW_SETUP_APPROVED_SHA with the final local SHA.
   Replace deployment rules with one **Branch** rule:
   `codex/preview-migration-txfxfrlhtvzwgluhnbpw-<FINAL_SHA>`.
   Keep the existing secret and endpoint unchanged; admin bypass remains disabled, reviewers
   remain disabled under the accepted owner-only model. No tag rules or old branch rules.
3. Read-only final preflight: verify owner Gilsuhar/79252537, clean exact commit, absent remote
   execution branch, environment metadata, project/organization and deployment automation.
4. With separate explicit publication approval, create only that remote branch from the exact
   commit, once. Do not push the release branch or update an earlier setup branch. Monitor the
   one run; stop on failure and do not rerun it.

## Validation limits and decision

### Corrected TLS assertion and remaining trust boundary

The old `pg_stat_ssl.ssl` guard intended to establish secure transport for the provisioning
client. PostgreSQL documents that view as per-backend SSL state. Supabase documents that
Supavisor sits between clients and PostgreSQL and maintains separate backend connections.
Consequently the SQL boolean measures the pooler-to-PostgreSQL leg, not the client's libpq
connection to the pooler. Run 41856706050 proved this assertion did not return true; the old
error did not distinguish false from a missing/null row. It is not evidence of a failed client
certificate check. No new remote probe has been run during Phase 5D.

The replacement is a fail-closed same-client conninfo gate plus unchanged verify-full/CA trust,
not an unconditional true assertion. SQL still observes backend TLS independently as
REPORTED_TLS, REPORTED_NO_TLS or UNKNOWN (including missing/ambiguous rows), in each audit result.
A false value means PostgreSQL reports no native SSL on that backend; it does not establish
whether an infrastructure tunnel protects the intermediate network. No such tunnel is assumed.
Even a true backend flag alone does not prove pooler certificate or hostname validation.

This patch intentionally stops using backend SSL as a client-TLS requirement. Backend transport
assurance remains a separate provider/configuration question. Review this distinction explicitly
before authorizing a new provisioning attempt; if independently verified encryption on both legs
is required, provisioning remains blocked until Supabase supplies that evidence or an approved
verified direct connection is available. Do not silently interpret the new client proof as
end-to-end TLS. No role SQL, system permissions or remote configuration changes are proposed.

Official references:
- [PostgreSQL backend SSL statistics](https://www.postgresql.org/docs/17/monitoring-stats.html#MONITORING-PG-STAT-SSL-VIEW)
- [Supabase client and backend connections](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits)
- [libpq verify-full](https://www.postgresql.org/docs/17/libpq-ssl.html)
- [psql conninfo](https://www.postgresql.org/docs/17/app-psql.html)
- [PostgreSQL 17 conninfo implementation](https://github.com/postgres/postgres/blob/REL_17_STABLE/src/bin/psql/command.c)

The following Phase 5C observations are historical, not new Phase 5D executions:

Local tests mock provider/process responses and statically check SQL contracts. Two read-only
management-connector operations ran on 2026-11-04: a boolean-only identity/permission query and
the prepared preflight in BEGIN READ ONLY / ROLLBACK. Identity, role absence, grant authority,
password-audit access, 11 completed migration checksums, expected tables, effective PUBLIC access,
RLS/API denial and empty application/Auth data all passed. Its catalog digest supplies the pinned
baseline. No password value was selected; no role SQL was executed. This connector evidence does
not prove certificate validation for the future psql connection.

The Linux client image has not run on this Windows host. The previous Actions run did validate
its version and reach SQL preflight, but the new same-connection gate has only local mocked tests.
Live privileges and the baseline must still be rechecked on the
strict-TLS psql connection immediately before provisioning. This is ready for final preflight,
not a claim of completed or authorized provisioning. No new system grants are authorized if a
prerequisite fails.

Sources: [PostgreSQL 17 creator grant behavior](https://www.postgresql.org/docs/17/role-attributes.html),
[libpq strict TLS](https://www.postgresql.org/docs/17/libpq-ssl.html),
[official PostgreSQL client image source](https://github.com/docker-library/postgres/blob/master/17/bookworm/Dockerfile).

## Recorded Phase 5C local validation (before this correction)

- Focused runtime-role/owner/workflow/TLS/identity suites: 308 passed, 0 failed, 0 skipped.
- Security suite: 190 passed, 0 failed, 0 skipped.
- TypeScript, ESLint, Prisma validation and actionlint 1.7.12 passed.
- Gitleaks 8.30.1: zero findings in the 16 reviewed publication files.
- The 11 migrations, Prisma schema, dependency lockfile and Vercel configuration are unchanged.
- The role transaction and Linux client were not executed; post-provisioning checks are mocked/static until approval.

## Phase 5D local validation

- Focused role/client-TLS/owner/workflow/identity suites: 336 passed, 0 failed, 0 skipped (9 files).
- Security suite: 190 passed, 0 failed, 0 skipped (12 files).
- TypeScript, ESLint, Prisma validation and actionlint passed.
- Gitleaks and provider-pattern scanning: zero findings in the nine changed/new publication files.
- All 11 migrations, Prisma schema, lockfile, role SQL/hash manifest, workflow and vercel.json unchanged.
- Initial validation caught unsupported test matcher syntax and a test type error; both were
  corrected and affected checks rerun successfully without weakening assertions.
- No new live connection, workflow, publication or database operation. Same-client gating is
  mocked locally; live pooler/backend transport remains an execution-time observation.
- GO for fresh read-only preflight. New publication/provisioning needs separate approval of
  the exact commit and documented backend-transport boundary, with fresh environment SHA/branch
  metadata. Never rerun 41856706050 or update its published execution branch.
