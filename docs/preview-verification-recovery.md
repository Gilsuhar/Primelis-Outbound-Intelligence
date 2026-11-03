# Preview post-migration verification recovery

Target: `txfxfrlhtvzwgluhnbpw` only. Published initialization commit:
`812e1c474531c8d17304745c56783aaf59199825`. Failed run: 41693631072.
The 11 migrations are already applied; no initialization, retry, reset or seed is permitted.

## Findings

The published `setup.mjs` wraps `verifyInitializedSchema()` and the subsequent Prisma diff in one
catch and emits only `PREVIEW_SETUP_APPLIED_VERIFICATION_FAILED`. Possible failing operations are:
1. Migration-history SELECT, name/order/checksum/completion/rollback/step-count validation.
2. Table/RLS/API-privilege SELECT and exact expected-table comparison.
3. Auth-user/runtime-role/policy counts and zero-data checks across all application tables.
4. Prisma process launch, schema/config/connection introspection, or a nonempty schema diff.

The diff direction and flags are valid for the pinned Prisma 5.22.0: live datasource -> reviewed
datamodel, `--exit-code`. It needs no shadow database. Exit 0 means no differences, exit 2 means
differences, and exit 1 means command/engine failure. The old code discarded stderr and collapsed
all nonzero statuses, process errors and timeouts to the same code; its caller masked that code again.
The old run cannot tell us which stage failed or recover its discarded stderr/exit status.
Reference: https://github.com/prisma/prisma/blob/5.22.0/packages/migrate/src/commands/MigrateDiff.ts

Read-only management SQL verified names, checksums, all 50 tables, RLS/API denial and empty application
data. Schema-only catalog queries were compared with SQL generated offline by the actual pinned
Prisma CLI from the unchanged model. No generated SQL was executed. The catalog contains 400 application
columns, 13 enums, 114 non-primary indexes and 107 constraints. The generated model has 400 columns,
13 enums, 114 non-primary indexes and 106 constraints. Confirmed discrepancies:

| Object | Applied migrations / actual database | Prisma model's generated definition |
| --- | --- | --- |
| `IntegrationState_userId_fkey` | ON UPDATE NO ACTION (implicit) | ON UPDATE CASCADE |
| `IntegrationAuditEvent_userId_fkey` | ON UPDATE NO ACTION (implicit) | ON UPDATE CASCADE |
| ProspectFact source composite FK | Name `ProspectFact_sourceId_fkey` | Name `ProspectFact_sourceId_prospectId_fkey` |
| GeneratedDraft `retrievedKnowledgeIds`, `sourceIds` | Empty-array defaults | No database default |
| IntegrationState provider check | Restricts provider to HUBSPOT/OUTREACH | Not represented by Prisma schema |

The ProspectFact relationship columns, references and cascade behavior match; its discrepancy is
only the constraint name. The catalog also requires NOT NULL on five array columns where Prisma's
generated DDL omits it; Prisma's list handling may normalize that difference. Do not label unsupported
CHECK/RLS features as drift that Prisma must detect. The two integration FK update actions and array
defaults are real catalog/model differences. No schema, migration or data was changed to hide them.
These findings do not prove the old process reached diff or returned exit 2. The full live Prisma diff
remains unexecuted because no local `PREVIEW_SETUP_DATABASE_URL` is available and GitHub cannot reveal
an environment secret. Catalog comparison is evidence of mismatch, not a substitute for engine diff.

## Local verifier correction

- `verification-errors.mjs` preserves a fixed stage/category for history, RLS, unexpected objects,
  counts and database-query failures without emitting raw exception strings or SQL data.
- `schema-diff.mjs` invokes only `migrate diff` with fixed arguments; no deploy/reset/seed/script,
  shadow database, shell, output file, retry or recovery. stdout/stderr stay in memory and are never
  emitted. Only allowlisted Prisma error codes become authentication, connectivity, permission, TLS
  or configuration categories. Exit 2 alone means schema drift; process errors/timeouts stay distinct.
- `verify-only.mjs` is independent of initialization, accepts only `--plan` or `--verify-only`, and
  requires `PREVIEW_SETUP_APPROVAL=verify:txfxfrlhtvzwgluhnbpw`. Initialization still requires
  `initialize:` approval and an empty database; verification approval cannot authorize initialization.
- Existing endpoint, CA, project fingerprint, repository/owner/CI guards and migration manifest are
  reused. Runtime verification connections set `default_transaction_read_only=on` through a fixed
  internal startup option and verify `transaction_read_only=on` before catalog inspection. Diff
  receives the same internal read-only option and strict pinned-CA URL. If the pooler rejects or drops
  this startup option, verification fails closed; this new connection option has not been tested live.
- The verification-only history comparison uses the reviewed LF migration bytes, so a Windows CRLF
  checkout cannot falsely reject the already-applied Linux migration checksums. Migrations themselves
  remain unchanged. RLS and denied API privileges remain mandatory independently of Prisma diff.

## Safe procedure (not executed)

Use a separately reviewed, explicitly authorized verification-only runner with secure injection of the
existing Preview environment secret. Do not download/read that secret or paste it into arguments/chat.
Keep the same approved project reference/name and endpoint, but set the non-secret operation approval
to `verify:txfxfrlhtvzwgluhnbpw`. Retain exact owner/commit/environment checks for any GitHub runner;
never clear CI/GitHub variables to evade them. This change adds no workflow or cloud executor. The old
setup workflow still contains initialization and MUST NOT be rerun for verification.

```sh
node scripts/preview/verify-only.mjs --plan
node scripts/preview/verify-only.mjs --verify-only
```

Required secure inputs: `PREVIEW_SETUP_DATABASE_URL`, `PREVIEW_SETUP_APPROVED_PROJECT_REF`,
`PREVIEW_SETUP_PROJECT_NAME`, `PREVIEW_SETUP_APPROVED_ENDPOINT`, `PREVIEW_SETUP_APPROVAL`, and existing
owner/commit approval metadata if running on GitHub. Do not set fallback `DATABASE_URL`/`DIRECT_URL`.
The script generates strict CA/read-only connection options internally. No secret update is required.

Success is only `EXISTING_SCHEMA_VERIFIED` after history, security, empty-data and engine-diff checks
all pass. Any failure stops without modification. Given the confirmed model/catalog mismatch, do not
advance to Auth/runtime-role provisioning or deployment. Next request: authorize a verification-only
cloud invocation and review intended schema semantics. Any later schema reconciliation needs a separate
approval; never edit the 11 applied migrations or weaken assertions to obtain a pass.

## Local validation

224 focused runner/TLS/recovery/publication-pattern tests passed, with zero failures/skips; the separate
Preview security/authentication suite passed 184 tests with zero failures/skips. Tests include actual
offline Prisma 5.22 CLI exits 0/1/2, initialized-database rejection, missing/bad history, RLS/API privileges,
read-only enforcement and rejected write-oriented CLI arguments. TypeScript, ESLint and Prisma schema
validation passed. Production build passed after an initial Windows EPERM directory-creation error was
resolved by running the same offline validation wrapper with elevated filesystem access. No DB was used
for the build or tests. The reviewed migration/schema/lockfile manifest still validates all 13 hashes.
