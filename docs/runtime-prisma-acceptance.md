# Restricted runtime Prisma acceptance

This is a read-only acceptance run for the already activated `recycler_preview_app`
role in `txfxfrlhtvzwgluhnbpw`. It must never rerun activation. Local mocks and a
successful activation do not prove that the real restricted Prisma connection works.
Publishing or executing this workflow requires separate explicit owner approval.

## Execution boundary

The existing `.github/workflows/preview-database-setup.yml` now invokes only:

```text
node scripts/preview/accept-runtime-prisma.mjs --plan
node scripts/preview/accept-runtime-prisma.mjs --accept-runtime-prisma
```

Owner ID, repository ID, exact approved commit, exact SHA-named branch creation,
first attempt and environment checks are unchanged. Normal pushes, updates, force
pushes, tags and reruns cannot authorize acceptance. The existing root `vercel.json`
excludes this setup-branch namespace from Git deployments. Do not rerun a failed job
or update/recreate a published execution branch.

Before credentials are injected, the workflow installs the frozen dependencies with
lifecycle scripts disabled, generates Prisma 5.22.0, and bundles the real application
`runtimeDatabaseUrl` guard. It uses esbuild already present in the frozen dependency
graph. The bundle is an ignored Node-only file, with no secrets or source map. Removing
the framework's `server-only` build marker does not remove any URL, identity or TLS guard.
No application server, install hook, migration or seed is started.

## Connections and checks

1. The parent validates both staged URLs without displaying them and verifies GitHub
   authorization. It rejects administrator password reuse, unapproved endpoints,
   override variables, `.env` files and missing credential attestation.
2. The existing pinned PostgreSQL client uses the administrator secret only for a
   fixed, already-active-role audit. Actual-client `\conninfo`, `verify-full`, the
   reviewed CA and hostname validation are mandatory. The audit runs inside
   `BEGIN READ ONLY` and ends with `ROLLBACK`. It verifies the independent cluster
   fingerprint, eleven migration names/checksums, fifty tables, schema baseline,
   one approved Auth user/profile/policy, LOGIN role attributes, restricted effective
   privileges, RLS and denied API-role access.
3. A separate Node process receives only the restricted runtime URL, attestation and
   approval context. It receives no administrator URL, GitHub token, provider secrets,
   Prisma engine override or TLS override. The real application URL guard adds the
   same fingerprint-checked CA to `sslmode=require&sslaccept=strict` for Prisma.
   No administrator credential fallback exists.
4. Prisma uses interactive transactions and checks both session and effective role,
   `transaction_read_only` and `default_transaction_read_only` before each transaction's
   profile or denial query. These checks verify the role's existing server-side defaults;
   a writable session fails closed. No startup parameter is treated as sufficient proof.
5. The approved five-column `user.findFirst` lookup matches the application's lookup
   shape. Exactly one approved SALES_USER profile must be visible. An unrelated identity
   must return null. Four fixed unauthorized `SELECT ... LIMIT 0` probes must return
   PostgreSQL permission denial; each has its own transaction. A permission failure in
   the session guard cannot masquerade as a successful denial probe.
6. Effective catalog privileges establish that INSERT, UPDATE, DELETE, schema creation,
   ownership, sequence access and elevated memberships are absent. This run deliberately
   does not attempt DML, DDL or role changes, even with an intended rollback. Those
   denials are catalog-based evidence, not claims of live write-attempt tests.
7. A new independent administrative read-only connection repeats the audit. Schema
   and privilege hashes must match the first audit. Any mismatch stops the run.

The administrator credential remains privileged; read-only transaction checks and
fixed reviewed audit SQL constrain its use. It is never used to construct Prisma or
given to the runtime child. The restricted role cannot read the administrative cluster
fingerprint; that independent evidence is checked before and after against the same
approved endpoint/project. TLS trust, URL/project identity and runtime-role checks
remain mandatory on the restricted connection itself.

Only fixed status/count/error categories reach logs. Raw Prisma errors, rows, subprocess
output, connection URLs and credentials remain private. There are no artifacts. A failure
does not cause a retry or recovery operation; diagnose it read-only under separate approval.

## Required GitHub environment settings

Use the existing `agent-workforce-preview-setup` environment. Do not restage or rotate
either credential for this task.

- Keep secrets `PREVIEW_SETUP_DATABASE_URL` and `PREVIEW_RUNTIME_DATABASE_URL`.
- Keep `PREVIEW_RUNTIME_CREDENTIAL_ATTESTATION=unique-random-32-bytes-retained`.
- Keep `PREVIEW_SETUP_APPROVED_ENDPOINT=aws-1-us-west-2.pooler.supabase.com:5432`.
- Replace `PREVIEW_SETUP_APPROVED_SHA` with the reviewed acceptance commit SHA.
- Replace all deployment rules with one **Branch** rule:
  `codex/preview-migration-txfxfrlhtvzwgluhnbpw-<reviewed-acceptance-SHA>`.
- Keep administrator bypass disabled and owner-only workflow guards intact.
- Debug logging must remain disabled. No new credentials, reviewers or infrastructure
  are needed. Secret existence alone does not prove successful runtime authentication.

After the settings are saved, perform an authenticated read-only final preflight:
owner Gilsuhar ID 79252537, exact clean candidate, environment metadata, sole Branch
rule, branch absent remotely and deployment exclusion. Then request explicit publication
approval. Publish only the exact reviewed SHA to that one absent branch, with no force
option and no other refs. Monitor the single resulting Actions attempt; stop on failure.

The final report must distinguish real execution from mocked validation. Only
`RUNTIME_ACCEPTANCE_VERIFIED` with its independent postchecks justifies proceeding to
separately approved Vercel Preview configuration. This acceptance does not test Supabase
password sign-in or browser sessions; those remain protected Preview smoke-test requirements.

## Local preparation validation

- Runtime/acceptance/TLS/provisioning suite: 683 passed, zero failed or skipped,
  including 73 new execution-wrapper tests and the denial-probe regression.
- Security suite: 212 passed, zero failed or skipped.
- Authentication suite: 122 passed, zero failed or skipped. Suites overlap.
- TypeScript, ESLint, Prisma validation, actionlint, Prisma 5.22.0 generation and
  standalone application-guard bundling passed.
- Provider-pattern scan: 834 intended files, zero findings. Gitleaks returned exit 1
  for the same nine previously reviewed generic-key false positives, all in files
  unchanged from `f1d70c942ca50712000da57fb61f7fc3aeefc926`; zero new or confirmed secrets.
- Eleven migrations, aligned Prisma schema, dependency lockfile and Vercel exclusion
  are unchanged from the activated candidate. No product code was modified.

Initial validation caught test/declaration type mismatches, a lint naming issue and
standalone dependency resolution that the test runner masked. These were corrected,
including a permanent standalone CLI test. No production build or live database test
is claimed for this runner-only change. GitHub metadata confirms activation run
41905981124 completed successfully on attempt 1 and both staged secret names exist;
the secret values were not read, and live acceptance remains separately authorized.
