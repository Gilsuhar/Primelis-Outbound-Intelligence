# Verification role audit — Phase 4P

The [Phase 4Q administrative audit plan](preview-administrative-audit.md) supersedes this provisioning
proposal as the recommended next step. Preserve this blocked proposal for history; do not execute it.

Decision: **NO-GO for provisioning**. This is a local proposal, not an executed database change.
Target: dedicated `agent-workforce-preview`, `txfxfrlhtvzwgluhnbpw`, Primelis, us-west-2.

## Read-only evidence

Eight SELECT-only management queries inspected catalogs and privilege booleans on 2026-11-03.
The database name and independently pinned cluster fingerprint matched. The verifier role does not
exist. All 50 public tables have RLS; anon/authenticated have neither table nor column grants.
No application records, Auth records, passwords or connection strings were retrieved in this audit.
This management connection does not prove Session Pooler behavior for the future verifier login.

The fixed `provisioningAuditQuery` returned these failed identifiers:

| Condition | Verified blocker |
| --- | --- |
| IDENTITY_GRANT_AUTHORITY | postgres cannot grant EXECUTE on pg_control_system(), owned by the managed administrator. |
| AUTH_SCHEMA_GRANT_AUTHORITY | postgres lacks grant authority for USAGE on auth. |
| AUTH_POLICY_AUTHORITY | postgres cannot act as auth.users owner to create its SELECT policy. SELECT grant authority does not confer ownership. |
| PUBLIC_ROUTINES_CLEARED | 98 non-system routines have PUBLIC EXECUTE, incompatible with the existing strict no_user_functions check. |

CREATE ROLE authority, Auth ID column grant authority, non-null Auth ID, TEMP revoke authority and
absence of PUBLIC schema CREATE passed. These booleans describe current authority, not permission
to execute changes. The generated SQL now checks all nine conditions before any role creation.

## Inherited privileges and data exposure

NOINHERIT does not remove PUBLIC privileges. PUBLIC currently has CONNECT/TEMP on the database and
USAGE on public, pg_catalog and information_schema. No PUBLIC schema CREATE was found. The proposal
must revoke PUBLIC TEMP to prevent temporary-object creation; that affects every role in this Preview
database and needs explicit approval. The redundant PUBLIC CREATE revocation was removed in favor of
a fail-closed prerequisite. No managed routine grants are revoked by this proposal.

The 98 routine ACLs comprise auth (4), extensions (54), graphql_public (1), public (1), realtime (18)
and storage (20). Most schemas currently lack PUBLIC USAGE. An EXECUTE ACL alone is not proof of an
exploitable call. The public SECURITY DEFINER routine is an event-trigger function, not an ordinary
callable data-access endpoint. The four Auth helpers are stable invoker functions. Nevertheless, the
existing guard rejects all these ACLs conservatively; this audit does not relax it or add an allowlist.
PUBLIC also has SELECT ACLs on two extension views, currently behind a schema without PUBLIC USAGE.

Future-object risk: postgres's public-schema table defaults grant anon/authenticated/service_role
MAINTAIN, REFERENCES, TRIGGER and TRUNCATE. These do not affect the existing denied tables, but future
DDL must address them; RLS does not protect TRUNCATE. No explicit PUBLIC default ACL entry is not proof
that PostgreSQL's built-in routine EXECUTE default is revoked. The proposal grants no future objects.

## Minimum privileges for the current combined verifier

| Resource | Required privilege and reason |
| --- | --- |
| postgres database | CONNECT only; no CREATE or TEMP |
| public and auth schemas | USAGE only; no CREATE or ownership |
| pg_catalog.pg_control_system() | EXECUTE for independently pinned cluster identity |
| Exactly 50 reviewed public tables | SELECT on all columns for Prisma introspection, migration checksums and truthful empty-data counts |
| auth.users | SELECT(id) only, with verified NOT NULL, for count(id); no email, password or profile columns |
| The 51 counted relations | SELECT-only policies scoped exclusively to recycler_preview_verify; no write policies or BYPASSRLS |

No sequence privileges are needed: the reviewed public schema has no sequences. No role membership,
grant option, ownership, superuser, CREATEDB, CREATEROLE, REPLICATION, BYPASSRLS or data/schema write
privilege is needed. The proposal creates NOLOGIN/passwordless and checks effective ACLs before commit.

Prisma 5.22 reads information_schema.columns. Limiting public grants to one column would hide other
columns and invalidate the schema comparison. Catalog access alone is insufficient for that path.
Full SELECT plus the scoped policies would let this credential read application rows if populated,
even though our runner only reads migration metadata and counts. Use only this empty dedicated project;
the current verifier rejects any application/Auth rows, including synthetic rows. Later synthetic
demonstrations require separate scope review. Do not retain an activated verification credential for
real customer data. A metadata-only diff role with no row policies cannot also prove truthful counts.

## Independent connections and enforcement

The query client opens an explicit READ ONLY transaction, verifies actual transaction/default settings,
identity, fingerprint, exact effective role, role attributes, ownership, memberships and effective ACLs.
The separate Prisma diff subprocess receives only the restricted-role URL and pinned CA. An independent
audit precedes it. There is no administrator fallback: PREVIEW_SETUP_DATABASE_URL injection is rejected.
Role login defaults apply to fresh backends; transaction settings on the audit client do not transfer
to the schema engine. Mutable read-only defaults are additional protection, not a permission boundary.
Denied writes/ownership/membership and routine checks provide the privilege boundary.

Prisma exposes no hook to inspect its own backend's transaction flag. The actual pooler login defaults,
catalog visibility and schema diff still need a separately approved live test after safe provisioning.
No migration, reset, seed or initializer is part of this verification path. TLS chain/hostname checks,
target identity, history/checksums and RLS remain mandatory. API column grants are now checked as well
as table grants. Auth access wider than its non-null ID is now rejected by the runtime privilege check.

## Separately approvable procedure — blocked, do not execute yet

1. Obtain a supported, narrowly scoped Supabase path for the three missing grant/policy authorities.
   Do not grant managed administrator roles or substitute a different fingerprint. Separately review
   routine reachability and the conservative guard; do not broadly revoke managed PUBLIC routine ACLs.
   If these cannot be resolved without broadening authority, keep provisioning blocked.
2. Review the resulting exact SQL and rerun the catalog-only audit. Require all prerequisites to pass.
   Capture baseline ACLs/policies for rollback. Confirm target fingerprint and strict TLS again.
3. Separately authorize one transaction executing only the reviewed role proposal on this target:
   NOLOGIN role/defaults, narrow grants, 51 SELECT policies and Preview-only PUBLIC TEMP revocation.
   Any failure must roll back the whole transaction. No migrations or application data changes.
4. Inspect resulting memberships, ownership, defaults, effective grants, policies and API denial before
   any login activation. Activation, secure dedicated secret injection and a fresh restricted-login
   verification run require separate authorization; never reuse the administrator secret.
5. Rollback, if later authorized: disable any activated login and remove its secret, drop only the 51
   named role policies, revoke explicit grants/defaults, then drop only this role. No CASCADE/DROP OWNED.
   Restore PUBLIC TEMP only from captured baseline and with approval. No table/history changes.

The current SQL deliberately stops at grant-authority checks. Do not attempt it to discover blockers.

## Local validation

358 focused tests across nine files and 184 security/authentication tests across eleven files passed,
with zero failures or skips. TypeScript, ESLint and Prisma schema validation passed. The generated SQL
matched its generator; SQL policy tests cover fail-closed prerequisites, exact grants and API column
privileges. These are local static/mocked checks, not a PostgreSQL role-provisioning execution test.

All eleven migrations, Prisma schema, lockfile, workflow and Vercel configuration are unchanged.
Gitleaks found no staged-diff findings. Scanning complete contents of all nine changed files reported
two generic-key matches, both independently matched to reviewed migration checksums, not credentials.
The supplemental provider-pattern scanner found zero findings. No exclusions were added. No production
build or complete application test suite was required or run for this focused audit.

## Sources

- [Prisma 5.22 PostgreSQL introspection](https://github.com/prisma/prisma-engines/blob/5.22.0/schema-engine/sql-schema-describer/src/postgres.rs)
- [PostgreSQL column visibility](https://www.postgresql.org/docs/17/infoschema-columns.html)
- [Policy ownership and RLS](https://www.postgresql.org/docs/17/sql-createpolicy.html)
- [PUBLIC and grant authority](https://www.postgresql.org/docs/17/sql-grant.html)
- [Global and per-schema default privileges](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html)
