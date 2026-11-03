# One-time administrative verification — Phase 4Q

Recommendation: use the existing trusted Preview administrator connection for one bounded schema
audit. Keep future application access separate and least-privileged. Do not provision
`recycler_preview_verify`, its 51 policies, or any of the blocked grants. No new service is needed.
The previous role proposal is retained for history but is not part of this execution plan.

## What changes, and what does not

`audit-admin.mjs` is an explicit operator-only path, not a fallback in `verify-only.mjs`. It requires
`PREVIEW_SETUP_APPROVAL=audit-admin:txfxfrlhtvzwgluhnbpw` and the separate acknowledgment
`PREVIEW_ADMIN_DIFF_APPROVAL=privileged-read-only-prisma-diff`. The existing restricted-role verifier
continues to reject administrator credentials. The local workflow candidate invokes the new path;
it is not published or authorized by the currently saved environment SHA. The application never
invokes it. No provider, authentication, eligibility or production configuration changes.

Mandatory checks remain: exact project/endpoint and project-specific login, pinned CA and strict
hostname validation, owner/repository/commit/environment/first-creation authorization, independently
recorded cluster fingerprint, expected database/session/effective identity, reviewed file hashes,
eleven completed migrations with matching names/checksums, exact 50-table inventory, RLS, denied
anon/authenticated table AND column access, no unexpected policies, zero application/Auth records,
and no runtime role provisioned yet. All checks fail closed. No migrations or repair operations run.

The one-time administrative audit owns fingerprint, migration-history, Auth count and security-catalog
inspection. The future application role needs none of pg_control_system(), auth.users, migration
history, role catalogs, PUBLIC privilege revocation or verification-specific policies. Application
grants/RLS and existing server authorization remain a separate review before runtime provisioning.

## Supported identity evidence

Supabase management metadata identifies the project reference, organization, region and endpoint.
These were verified in the preceding audit; no remote metadata was refreshed in this phase. Ordinary
catalogs identify database name, current/session role, tables and policies. Those are not unique
project identity: many Supabase projects use database postgres and role postgres; the pooler host is
shared. Neither a supplied project name nor a matching table inventory replaces the fingerprint.

Retain the independently recorded cluster fingerprint query using the already-authorized administrator.
No grant to another role is needed. The previous diagnostic proved that this administrator can read it.
If the fingerprint changes, stop for independent target review rather than updating it automatically.

## Two distinct connection guarantees

1. **Audit queries:** Prisma interactive transactions pin a backend. Each begins with SET TRANSACTION
   READ ONLY and connection-local SET LOCAL default_transaction_read_only=on. The identity query
   verifies both actual settings before history/count queries. Defaults are local to this transaction;
   the administrator's persistent role defaults are unchanged. SET LOCAL row_security=off is verified
   and makes PostgreSQL error if a count would be filtered by RLS; it does not grant bypass privileges
   or disable table RLS. Fixed SELECTs read catalogs/history/counts only, never application row contents.
   A fresh transaction repeats the checks after schema comparison. No role or policy creation is needed.
2. **Prisma diff:** the installed, frozen Prisma 5.22.0 CLI opens an independent connection with exactly
   the same validated URL and trusted CA. Its fixed command is `migrate diff --from-schema-datasource
   prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code`. The installed version's
   help explicitly documents diff as read-only to its datasources. There is no migration-directory
   source, shadow database, script output, db execute, deploy, reset, seed or shell command. Output is
   suppressed and classified: 0 match, 2 drift, other failure; never retried. Only a minimal child
   environment is passed; repository .env loading is rejected. The installed CLI version is checked.

The diff connection is **not server-enforced read-only by the audit transaction**. Its credential is
privileged. The guarantee here is the reviewed read-only CLI operation and trusted frozen dependencies,
not denied PostgreSQL write privileges, observed CLI transaction settings or startup options forwarded
by the pooler. No claim is made that the CLI has an explicit READ ONLY transaction. Approval must
expressly accept this bounded administrative trust model. This is a proposed change in verification
architecture, not a claim of equivalent privilege isolation. If every connection must be database-
enforced read-only, do not approve this path; that stronger requirement is not established here.

Prisma 5.22 has no supported caller transaction hook for this CLI command. A SELECT-only account could
describe public schema columns without Auth/cluster grants or row policies, but would still require
new role/grant provisioning and live catalog-visibility validation. It is unnecessary for this one-time
trusted audit and is not the proposed path. Do not turn an application login into an administrative
verifier. Schema diff covers Prisma-supported objects; separate catalog checks retain RLS/API checks.

No new application SELECT grants are issued. Reading COUNT via the existing administrator is limited
to proving the previously empty baseline; it does not require making all rows visible to another role.
The audit stops on permission errors rather than interpreting invisible rows as empty.

## Exact next approval and cloud execution preparation

Approve one administrative audit including the independently connected, privileged Prisma diff above.
The local workflow candidate reuses the existing environment-scoped PREVIEW_SETUP_DATABASE_URL and
retains all owner-only, exact-SHA/branch-creation, no-rerun and Vercel exclusion controls. Its diagnostic
step is replaced by the two commands below and the explicit approval values.
Pin this new commit in the environment SHA and its sole exact Branch rule. Existing setup branches and
failed runs must remain untouched. No extra role, policy, secret or infrastructure resource is needed.

```text
node scripts/preview/audit-admin.mjs --plan
node scripts/preview/audit-admin.mjs --audit-with-prisma-diff
```

Keep the existing approved endpoint/project variables and add only the nonsecret approval values
listed above in the reviewed workflow. Secret injection is confined to the audit step, never Vercel or
the application. Reconfirm project metadata and environment bindings before separately authorized
single-branch publication. Plan mode connects nowhere. Execution stops on any error and reports only
sanitized status/counts. No change to GitHub settings, workflow publication or execution was made here.

GO to review/approve this bounded administrative execution model. NO-GO to runtime provisioning or
deployment until live audit succeeds and application-specific grants/Auth configuration are reviewed.
The actual schema match remains unverified in this phase. No rollback SQL is needed for an audit;
failure requires diagnosis, never schema repair or initialization reruns.

## Local validation

397 focused tests across ten files (including 39 new administrative audit cases and workflow YAML/
authorization checks) and 184 security/authentication tests across eleven files passed, zero failures
or skips. TypeScript, ESLint and Prisma schema validation passed. The installed Prisma CLI help was
checked offline. No live database test, complete application suite or production build was run.
The eleven migration files, Prisma schema, lockfile, CA and Vercel configuration remain unchanged.

## References

- Installed Prisma 5.22.0: `node node_modules/prisma/build/index.js migrate diff --help` (checked offline).
- [Prisma separates diff generation from SQL execution](https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/generating-down-migrations)
- [PostgreSQL transaction scope](https://www.postgresql.org/docs/17/sql-set-transaction.html)
- [PostgreSQL row_security off errors on filtered reads](https://www.postgresql.org/docs/17/runtime-config-client.html#GUC-ROW-SECURITY)
- [Supabase connection and session-pooler guidance](https://supabase.com/docs/guides/database/connecting-to-postgres)
