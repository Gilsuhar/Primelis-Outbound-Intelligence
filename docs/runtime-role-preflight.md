# Runtime role correction and strict transport — Phase 5B

Target remains `txfxfrlhtvzwgluhnbpw` (Primelis, us-west-2). No provisioning is performed by this change.
The previous read-only preflight found PUBLIC SELECT on extensions.pg_stat_statements and
extensions.pg_stat_statements_info, but no PUBLIC USAGE on their schema. No role was created.

## Corrected checks

The SQL transaction now requires BOTH `has_schema_privilege(role, schema_oid, 'USAGE')` and an
unexpected object privilege to reject table/view and column access. Routine checks already
used this combination. These PostgreSQL functions evaluate effective privileges including PUBLIC
and inherited grants, not just direct ACL entries. No schema or extension name is exempted.
If another grant supplies schema USAGE, the corresponding object access is rejected. All memberships
remain independently forbidden, including memberships that could allow SET ROLE despite NOINHERIT.
Ownership, schema CREATE, database CREATE/TEMP, column grant options, role attributes and RLS checks
remain mandatory. MAINTAIN is now explicitly included in the PostgreSQL 17 write/maintenance check.
Sequence ACLs remain unconditionally rejected because sequence functions can accept OID/regclass
arguments without resolving a schema-qualified name; the view-specific correction does not relax them.

The prepared independent `runtime-access.mjs` SELECT reports schema access separately from table,
column and write privileges and memberships. Its classifier emits fixed failed-condition identifiers
only. It is a supplemental table/column audit, not a replacement for the complete transaction checks
of attributes, owners, memberships, routines, sequences, RLS and API roles. It must run inside the
existing identity-verified administrative read-only transaction after provisioning. No CLI or workflow
invokes it automatically. Tests use mocked catalog rows; no SQL was executed for these tests.

Routine revocation in public now enumerates only non-extension-owned functions. It never alters
extension membership, extension object ACLs or system-schema permissions. If an extension in public
exposes unsafe callable access, the final guard aborts instead of changing that extension's grants.
Redundant blanket table/sequence revokes from the newly created role were removed: CREATE ROLE
already refuses an existing role, and effective inherited access is checked before COMMIT.
The role still starts NOLOGIN with no password, only CONNECT, public USAGE and SELECT on User's
id/authUserId/email/name/role columns. No Auth user, profile, table, RLS policy or migration is created.

## Strict TLS execution plan

Do not use the management SQL connector for provisioning while its database certificate-validation
policy cannot be independently established. `pg_stat_ssl.ssl=true` proves encryption only.

Reuse the trusted operator runtime and existing `PREVIEW_SETUP_DATABASE_URL` secret injection; do
not retrieve the GitHub secret or create a replacement secret. The GitHub-hosted option requires a
separately reviewed update to the existing owner-authorized one-time workflow before publication.
No workflow, environment setting or execution branch is changed in this phase.

Before any future transaction:

1. Verify the exact reviewed commit and role SQL hash, management project identity, endpoint
   `aws-1-us-west-2.pooler.supabase.com:5432`, project-specific administrator username and postgres
   database. Keep both legacy references rejected. Refuse ambient DATABASE_URL/DIRECT_URL, service
   overrides, unreviewed PGOPTIONS, dotenv files or insecure TLS parameters.
2. Run the existing `node scripts/preview/diagnose-tls.mjs --pinned-ca` from that execution runtime.
   It sends only a PostgreSQL SSLRequest, never a password or SQL. It validates the pinned public CA,
   its validity/self-signature, the server certificate chain and exact hostname. Require VERIFIED and
   CHAIN_AND_HOSTNAME_VERIFIED; stop on any error. No automatic retry.
3. Keep the actual SQL connection independently strict. For a reviewed psql/libpq runner, derive
   PGHOST/PGPORT/PGDATABASE/PGUSER from the already validated URL in memory. Supply the existing
   password through a private temporary PGPASSFILE, never an argument or log. Pin PGSSLMODE=verify-full
   and PGSSLROOTCERT to the exact verified bundled CA; clear inherited PG environment overrides.
   Do not set hostaddr or use allow/prefer/require-only TLS. Check the runner's installed psql version
   before approval and retain `-X --no-password --set=ON_ERROR_STOP=1`. Remove the temporary secret file
   in finally, without printing its contents. No credential transfer to Vercel or repository files.
4. Re-run read-only fingerprint/operator/role-absence/grant-authority checks, 11 migration checksums,
   schema comparison and RLS/API/data checks over that strict connection. The corrected effective
   PUBLIC-access check must include schema USAGE. A schema comparison subprocess needs its own strict
   CA configuration; the existing pinned Prisma diff path provides it via sslcert/sslaccept=strict.
   Its privileged connection's read-only limitation remains explicit.
5. Only with new execution approval, run exactly the reviewed runtime-role.sql once using
   `psql -X --no-password --set=ON_ERROR_STOP=1 --file=scripts/preview/runtime-role.sql` in that sanitized
   environment. No URL/password arguments. Its own BEGIN/COMMIT and fingerprint guard must remain
   intact; do not nest it in another transaction. No reset, seed, migration or automatic retry.
6. Independently verify role attributes, memberships, owners, exact five columns, effective object
   access, RLS/API denial, unchanged migrations/schema and no new Auth/application data using fixed
   read-only queries. Preserve NOLOGIN and absent password. Stop on any discrepancy.

A successful preliminary probe does not secure a separate connection: the actual psql or Prisma
connection must enforce its own chain and hostname validation. A local probe does not prove a future
GitHub runner's connectivity. No secret-bearing provisioning runner was implemented or run here.

On 4 November 2026 the existing credential-free probe was actually run once locally against the
approved pooler and returned VERIFIED / CHAIN_AND_HOSTNAME_VERIFIED (DNS resolved, TCP connected,
PostgreSQL SSLRequest accepted). No credentials, PostgreSQL startup packet or SQL were sent.
This is independent chain/hostname/CA evidence for that probe, not an assertion about the opaque
management connector or any later credentialed execution channel.

## Decision boundary

Ready for another read-only preflight after local validation. Provisioning remains blocked until a
trusted credential-injected execution path is reviewed/available and its live checks pass. The existing
administrative-audit workflow cannot create this role; do not rerun or repurpose a published setup
branch. LOGIN activation, password creation, Auth/profile binding and Vercel remain separate approvals.

## Local validation

- Focused role/access/TLS/identity tests: 157 passed, 0 failed, 0 skipped (6 files).
- Security suite: 190 passed, 0 failed, 0 skipped (12 files).
- TypeScript, ESLint and Prisma schema validation passed.
- Gitleaks and supplemental provider-pattern scan: 0 findings in the 7 changed/new files.
- The 11 migrations, Prisma schema and dependency lockfile remain byte-identical to the Phase 5 base.
- SQL semantics are covered by static contracts and mocked catalog evidence, not a provisioned role.
  No role transaction, live database query, migration or cloud configuration change ran in Phase 5B.
- The single live operation was the credential-free TLS handshake described above.

References: [PostgreSQL 17 privilege inquiries](https://www.postgresql.org/docs/17/functions-info.html),
[libpq TLS verification](https://www.postgresql.org/docs/17/libpq-ssl.html).
