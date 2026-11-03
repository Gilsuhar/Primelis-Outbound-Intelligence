# Preview model alignment and verification-only execution

Target: `txfxfrlhtvzwgluhnbpw` only. The eleven migrations are already applied.
This revision changes the Prisma model, not the database or migration SQL. No forward migration is required
for the five identified discrepancies. It does not claim that a credentialed live Prisma diff has passed.

## Intended behavior and correction

| Difference | Authoritative migration | Decision and effect |
| --- | --- | --- |
| IntegrationState and IntegrationAuditEvent user FKs | `20261016000000_read_only_integration_sync` | The inline REFERENCES clauses omit ON UPDATE, which means NO ACTION. Add explicit `onUpdate: NoAction` to both Prisma relations. Keep ON DELETE CASCADE. This is functional: changing a referenced User primary key is rejected instead of propagating to integration state/audit ownership. User IDs are stable generated keys; login updates `authUserId`/email, not `id`. No application requirement to rename User IDs was found. Preserve the existing restriction. |
| ProspectFact source composite FK name | `20260823000100_prospect_memory_phase_1` | Add `map: "ProspectFact_sourceId_fkey"`. Cosmetic naming mismatch only: both columns, referenced composite key and delete/update cascades remain identical. The same-prospect source boundary is preserved. |
| GeneratedDraft retrievedKnowledgeIds/sourceIds defaults | `20260713000200_reply_to_prospect_drafts` | Add `@default([])` to both lists. The migration explicitly supplied empty defaults, backfilled nulls and set NOT NULL. This is functional when a writer omits a list: the DB supplies an empty list. Read adapters already convert values to string arrays. The model now documents this behavior; explicit list values are unchanged. |

Only the reviewed schema hash changes in `reviewed-files.json`. All eleven SQL hashes and the dependency
lockfile hash remain fixed. Offline tests run the actual pinned Prisma 5.22 engine and check generated
definitions against those migration semantics. They never execute generated SQL.

Prisma does not express the IntegrationState provider CHECK or RLS. Preserve them. Raw catalog/list
nullability comparisons are not a replacement for Prisma's engine diff; no filter was added to suppress
differences. Full live verification must still pass. The earlier schema-only catalog evidence is recorded
in [verification recovery](preview-verification-recovery.md).

## Independent verifier review

`verify-only.mjs` accepts only `--plan` and `--verify-only`, and requires `verify:` operation approval.
It imports plan validation, but the initializer's CLI entry point cannot execute on import. It calls no
migration, reset, seed, role or Auth provisioning code. All database statements are SELECTs. Fixed startup
options request read-only sessions; the identity query requires `transaction_read_only=on` before inspecting
the schema. The diff subprocess receives the same read-only configuration. The existing administrator
secret is not a least-privilege role: the restriction is enforced by the verification path and session
settings. If the session pooler drops/rejects startup options, stop; do not remove the read-only check.

Both connections retain pinned Supabase CA trust, strict certificate/hostname validation, exact endpoint,
project identity and database fingerprint guards. Diff exit 2 means drift; exit 1/process errors retain
sanitized command/error categories. History/checksum, exact tables, RLS, denied API-role privileges,
zero application records/Auth users/runtime roles/policies remain mandatory. No diff filtering or retry.

## Minimum cloud execution path — not published or executed

The existing `.github/workflows/preview-database-setup.yml` is now verification-only in this revision.
It retains its path and the deployment-excluded `codex/preview-migration-txfxfrlhtvzwgluhnbpw-*` namespace
to reuse the proven owner-authorized branch-creation trigger and existing Vercel exclusion. Despite that
historical branch prefix, the job runs only:

```sh
node scripts/preview/verify-only.mjs --plan
node scripts/preview/verify-only.mjs --verify-only
```

It still requires Gilsuhar/user ID 79252537, the exact repository, first run attempt, a newly created
SHA-named branch (zero before-SHA; no update/deletion/force push), matching workflow SHA and environment
approval metadata. All actions are pinned, permissions read-only, dependencies frozen/lifecycle-disabled,
and the secret is injected only into the final step. No new infrastructure or default-branch edit.

After separately approving this candidate, an operator must:

1. Set environment `agent-workforce-preview-setup` variable `PREVIEW_SETUP_APPROVED_SHA` to the reviewed
   new commit SHA. Replace its deployment policy with exactly one Branch rule:
   `codex/preview-migration-txfxfrlhtvzwgluhnbpw-<new-reviewed-SHA>`. Remove old rules; do not alter old refs.
2. Retain `PREVIEW_SETUP_APPROVED_ENDPOINT=aws-1-us-west-2.pooler.supabase.com:5432`, the existing
   environment-scoped `PREVIEW_SETUP_DATABASE_URL` secret, disabled reviewers and disabled admin bypass.
   No secret value, certificate parameter or credential update is needed.
3. Perform a read-only preflight against the saved metadata, clean commit, owner identity, absent new
   branch and deployment automation. Obtain explicit authorization for publication/execution.
4. Publish only that new branch, once, from this clean local repository. Never rerun run 41693631072 or
   recreate/update any previous setup branch. Stop on failure; no retry or initializer fallback.
5. Require `EXISTING_SCHEMA_VERIFIED` with 11 matching migrations, 50 tables, verified checksums/RLS,
   denied API access, zero unexpected data/objects and an empty Prisma diff before the next setup phase.

The new read-only startup option and the complete credentialed Prisma diff remain untested against the
pooler. The local environment has no setup connection secret; do not retrieve it from GitHub or request
it in chat. Verification therefore needs the separately approved GitHub run above. Auth provisioning,
runtime role setup and Vercel deployment each remain outside this change.

## Local validation

- Focused model/migration/runner/TLS/verifier/publication tests: 231 passed, 0 failed, 0 skipped (6 files).
- Preview execution-security/authentication tests: 184 passed, 0 failed, 0 skipped (11 files).
- Prisma 5.22 validation and local client generation, TypeScript, ESLint, production build and actionlint passed.
- Gitleaks and supplemental provider-pattern scan: zero findings across all nine changed files.
- All eleven applied migration files and the dependency lockfile are unchanged from published commit
  `812e1c474531c8d17304745c56783aaf59199825`.

The first focused run had one new comparison failure (quoted versus unquoted lowercase SQL identifier);
the expected migration spelling was corrected. Initial TypeScript validation exposed a pre-existing
parameterized CLI test passing individual characters rather than argument arrays. Its case wrapper was
fixed, preserving all three prohibited-input cases and making the assertion exercise the intended CLI
arguments. Final focused tests, TypeScript and lint passed after these corrections. No test was skipped.
Build/tests ran with the existing offline guard; no live database/provider operations occurred.
