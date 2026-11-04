# Restricted runtime LOGIN preparation (after successful profile binding)

Target only agent-workforce-preview / txfxfrlhtvzwgluhnbpw, Primelis, us-west-2.
The successful binding run was 41895356833 at 135991092d28c7bdcaa98a976d842f3f6208f280.
This document supersedes the completed Auth/profile steps in the Phase 5H runbook.
No credential generation, activation, cloud configuration or deployment is performed.

## Verified starting state

Read-only management inspection found ACTIVE_HEALTHY and all 15 post-binding checks
true: pinned identity/fingerprint, one approved confirmed nonanonymous email/password
Auth identity, one matching SALES_USER, exactly one intended SELECT policy, no other
application rows or user triggers, NOLOGIN/password-absent restricted runtime role,
exact memberships and five profile-column grants, unchanged schema baseline, 11
matching completed migrations, 50 tables, RLS and denied API-role access.
No migrations, roles, profiles or policies need recreation.

The literal SQL replacement and primary-error classification fixes remain required.
Use the existing pinned CA, libpq image/version, hostname/endpoint checks and owner /
repository / exact SHA / initial-branch / first-attempt GitHub authorization.
The administrator credential is privileged and remains setup-only.

## One recommended execution and delivery method

Reuse agent-workforce-preview-setup and its existing administrator secret. Prepare
one activation-only GitHub runner on the deployment-excluded setup namespace; do
not repurpose or rerun the published binding branch. No new infrastructure service.

Before any activation, the owner must approve one unique 32-random-byte database
password (256 bits before encoding), generated in an already trusted password manager
and retained there. Use a URL-safe ASCII encoding, distinct from the Auth-user and
administrator passwords. Do not generate it in chat, a workflow log, shell argument,
GitHub output, artifact, cache, commit, .env file or application build.

After separate approval, the owner enters the runtime-only connection URL into a
new environment-scoped GitHub Secret PREVIEW_RUNTIME_DATABASE_URL and, in a separately
approved Vercel configuration action, the exact application branch's sensitive
Preview PREVIEW_DATABASE_URL. Use the same retained value via secure secret-entry
interfaces; never recover it from logs or decrypt/copy administrator credentials.
No Vercel write token needs to be placed in GitHub. Do not activate an unretained
credential or an unapproved secret destination. GitHub cannot read back its secret.

Runtime connection fields (never a populated URL in documentation):

- Host aws-1-us-west-2.pooler.supabase.com; port 5432; database postgres.
- Username recycler_preview_app.txfxfrlhtvzwgluhnbpw, never postgres.
- Query sslmode=require&sslaccept=strict&connection_limit=1.
- Password is canonical unpadded base64url of exactly 32 random bytes (43 characters).
  Those characters need no percent encoding; reject encoded aliases or padding.
  Shape checks do not prove entropy or uniqueness: the owner's generation and retention
  attestation is mandatory. Never use the deliberately sequential unit-test fixture.
- The application guard validates the role/project/endpoint and adds the bundled,
  pinned Supabase CA as an absolute sslcert path. No operator-supplied CA override.

The new GitHub runtime Secret is a staging input, not the existing administrator
secret. Neither password nor URL may be emitted in diagnostics. Pass runtime data
only to the activation/acceptance step, never dependency installation, build or
artifact steps. Use private ephemeral files where a client requires them, with
cleanup on every outcome; keep the environment token out of database containers.

## Implemented guarded activation protocol (not executed)

1. Reconfirm the exact project/owner/commit/branch/environment approval, management
   health and SSL Enforcement. Verify administrator authority without broader grants.
2. Validate the runtime URL against the fixed fields above, secret presence and
   credential retention/delivery approval before opening a write-capable session.
3. Use the pinned client and actual-connection conninfo gate with verify-full, CA,
   hostname, TLS >=1.2 and approved endpoint. Run activationAuditSql("preflight") as
   the fresh read-only preflight on that same connection, preserving all 15 existing
   binding checks and adding role-alteration authority (16 checks).
4. In one explicit transaction, recheck target identity, NOLOGIN/password absence
   and exact grants/binding. Set transaction-local password_encryption=scram-sha-256.
   Use psql's supported `\password recycler_preview_app` facility so libpq encrypts
   the password client-side. Then execute only `ALTER ROLE recycler_preview_app LOGIN`.
   Assert LOGIN, SCRAM password presence (boolean only), all non-login attributes,
   memberships, five column grants and effective restrictions before COMMIT.
   No GRANT, RLS change, profile mutation or ownership operation is allowed.
5. On any failure before COMMIT, disconnect/ROLLBACK. Never retry. An uncertain
   commit acknowledgement requires independent read-only state inspection.
6. Re-run an independent administrator expected-delta audit: only this role's LOGIN
   bit and password presence may differ; schema, history, profiles, policy, ACLs,
   memberships and all other role attributes must match. Do not run the old NOLOGIN
   postcheck unchanged and mistake the authorized state change for drift.
7. In a separately approved subsequent read-only acceptance operation, connect using
   ONLY the runtime credential and run the prepared Prisma acceptance
   component. No administrator fallback, SET ROLE impersonation or new grants.
   Failure leaves readiness NO-GO; rollback/deactivation requires owner approval.

`activate-runtime-login.mjs` now implements plan/activation modes. It invokes the
existing GitHub authorization, endpoint, pinned CA and preliminary TLS checks. It
requires the digest-pinned PostgreSQL 17.11 client before any SQL session. Only
`activation-session.mjs` receives the private runtime password.

The fixed SQL file contains no password. With no TTY, stdin carries only three
explicit gate responses and the two C-locale native password prompt responses.
The empty-text `\prompt` in file mode flushes stdout and reads stdin separately
from the command file. The first gate releases SQL only after actual-client TLS;
the second follows the complete live preflight; the third permits COMMIT only
after repeated in-transaction guards and matching schema/privilege digests.
PostgreSQL's native `\password` encrypts client-side; there is no custom SCRAM code.
Password and LOGIN changes share one transaction. The fixed file cannot reach
COMMIT following ON_ERROR_STOP, missing input or failed gates. A disconnected
uncommitted transaction rolls back. A lost COMMIT acknowledgement remains UNKNOWN;
do not replay it. Cleanup removes the container and private temporary directory.

The administrator pgpass and public CA are private 0600 files in a 0700 ephemeral
directory mounted read-only. The runtime password is never put in a file, argument,
Docker environment, output, artifact or cache. Raw process output is kept private,
bounded, classified and discarded. Debug output remains prohibited. The trusted
GitHub runner necessarily holds the environment secret and password in memory;
JavaScript strings do not provide guaranteed zeroization. Treat runner/admin access
as privileged. This preparation has used synthetic inputs only, not a live password.

Before COMMIT, all 16 checks run again; after COMMIT a separate actual-client-TLS
connection runs the fixed read-only postcheck. Only the approved role's LOGIN bit
is normalized for digest comparison, with the actual expected bit and SCRAM presence
independently required in every phase. Other roles, memberships, ACLs, role defaults,
profile/policy identity, RLS, fingerprint, baseline and 11 checksums remain guarded.
This does not prove successful runtime password login or real Prisma compatibility;
those remain the subsequent acceptance step, not a reason to broaden permissions.
Local validation covers deterministic mocked process transcripts and fixed SQL,
including fragmented/incorrect prompts, EOF, TLS failures and withheld COMMIT.
The Windows preparation host has no Docker/psql executable available; it has not
executed the pinned Linux client. Its first live use remains subject to the exact
version check, strict transcript gates and fail-closed timeout, with no retry.

## Real Prisma acceptance, prepared but not executed

scripts/preview/verify-runtime-prisma.mjs is a non-CLI acceptance component. Its
caller must create the pinned Prisma 5.22.0 client with runtimeDatabaseUrl from the
existing application, and disconnect in finally. The independent administrator
audit supplies project fingerprint evidence; do not grant pg_control_system,
pg_authid or auth.users access to the runtime account.

The component checks each transaction's database/session/effective role, read-only
settings, role attributes, memberships, ownership, schema/database permissions,
sequences, routines, five columns, grant options and RLS/API restrictions. It then
runs the actual application findFirst shape (UUID OR case-insensitive email), verifies
the exact SALES_USER and that the only visible profile is the approved one. A lookup
for an unrelated synthetic identity must return null. No test users are inserted.

Unauthorized column, whole-User-table, GeneratedDraft and auth.users SELECT probes
use LIMIT 0 and must fail with Prisma P2010 / PostgreSQL 42501. Each probe gets its
own verified transaction because a permission error aborts the transaction. Network,
TLS or unknown errors never count as successful denial. INSERT/UPDATE/DELETE/DDL
denial is checked through effective PostgreSQL privileges; no write is attempted as
a test. Existing exact policy inspection is required because a one-row database alone
cannot prove filtering of hypothetical other users. The shared role can read the one
approved profile; server-validated Supabase Auth and UUID/email/role binding remain
independent access controls.

Read-only connection defaults are checked, but they do not replace grants: a login
can normally change its session defaults. Database ACLs, ownership and RLS provide
the write/row boundary. Every Prisma transaction checks its own session; settings
from the administrator or another pooled connection are never assumed to carry over.

Local mocked acceptance tests prove fail-closed control flow only. Actual runtime
password authentication, pooler role behavior, Prisma/RLS lookup, certificate trust
and denial results remain unverified until separately authorized live activation.

## Vercel findings and exact branch-specific requirements

Application branch proposed for the existing project:
codex/preview-runtime-login-preparation-20261104. It is NOT a setup-excluded branch;
do not publish it before isolation and deployment approval. A future activation
workflow must instead use the existing excluded setup namespace.

Read-only Vercel metadata confirms project prj_sicQocH4juE1Nr5gGpSA61mThxBT, Node 24.x
and Vercel Authentication enabled for all_except_custom_domains. Protection must
still be tested on the eventual exact vercel.app URL; no custom domain or bypass.
The connector omits deployment hook/production-branch details, so their earlier
operator verification must be refreshed before application publication.

Current inherited risks: generic Preview DATABASE_URL, DIRECT_URL and
PREVIEW_DATABASE_URL; shared Production/Preview OPENAI_API_KEY, OPENAI_MODEL,
AI_PROVIDER, NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_SUPABASE_URL and
NEXT_PUBLIC_SUPABASE_ANON_KEY. Other branch overrides are for
feature/agent-workforce-foundation, including HubSpot and Preview bindings; they
do not isolate this new branch. Values were not decrypted; their resource identities
must not be inferred from variable names. Production-only bindings stay untouched.

All following bindings must be scoped to Preview plus the exact application branch:

| Variable | Required value |
| --- | --- |
| PREVIEW_APPROVED_BRANCH | codex/preview-runtime-login-preparation-20261104 |
| PREVIEW_APPROVED_VERCEL_PROJECT_ID | prj_sicQocH4juE1Nr5gGpSA61mThxBT |
| PREVIEW_APPROVED_SUPABASE_PROJECT_REF | txfxfrlhtvzwgluhnbpw |
| NEXT_PUBLIC_PREVIEW_SUPABASE_PROJECT_REF | txfxfrlhtvzwgluhnbpw |
| NEXT_PUBLIC_PREVIEW_SUPABASE_URL | https://txfxfrlhtvzwgluhnbpw.supabase.co |
| NEXT_PUBLIC_PREVIEW_SUPABASE_PUBLISHABLE_KEY | Dedicated project's public publishable key |
| PREVIEW_APPROVED_DATABASE_ROLE | recycler_preview_app |
| PREVIEW_APPROVED_DATABASE_ENDPOINT | aws-1-us-west-2.pooler.supabase.com:5432 |
| PREVIEW_DATABASE_URL | Restricted runtime URL, sensitive Secret |
| NEXT_PUBLIC_VERCEL_ENV | preview |
| DATABASE_URL, DIRECT_URL | Explicit empty branch overrides |
| NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Explicit empty branch overrides |
| OPENAI_API_KEY, OPENAI_MODEL, AI_PROVIDER, NEXT_PUBLIC_APP_URL | Explicit empty branch overrides |

Verify effective branch resolution. If empty overrides do not mask inherited values,
stop rather than deploying with them. Reinventory for additional provider, worker,
cron, CRM, service-role and local-login secrets; none belong in this runtime.
Never inject PREVIEW_SETUP_DATABASE_URL or administrator credentials into Vercel.
Do not spoof VERCEL_ENV, VERCEL_PROJECT_ID or VERCEL_GIT_COMMIT_REF.

The existing centralized default-deny policy blocks CRM resource operations, sends,
enrollment, OAuth refresh, workers, schedules, paid providers and agents. Missing
runtime credentials and Production fallback fail closed. Preserve role checks,
secure session cookies and synthetic-only routes; postinstall is Prisma generate,
not migrate. Exact HTTPS origin/callback settings await the real protected hostname;
no wildcard or invented redirect URL. No browser/login readiness is claimed yet.

## Decision and smallest next action

The activation-only implementation is ready for a separately approved execution
candidate after local validation. Actual activation/publication remains unauthorized.
No Production bindings, Auth users, migrations or schema changes are needed.

### Manual secret staging and publication prerequisites (not performed)

1. After separate credential-staging approval, the owner uses the existing trusted
   password manager's cryptographic generator to create 32 random bytes, encoded
   as 43-character unpadded base64url. Retain the credential and complete runtime URL
   privately there, distinct from administrator and Auth passwords. Do not put it
   in terminal arguments, history, screenshots, chat or repository files.
2. In repository Settings → Environments → agent-workforce-preview-setup, add only
   the environment Secret `PREVIEW_RUNTIME_DATABASE_URL` through the masked secret
   entry interface. Construct it privately from the fields above. Leave the existing
   `PREVIEW_SETUP_DATABASE_URL` and endpoint unchanged. GitHub cannot read it back.
3. Set environment Variable `PREVIEW_RUNTIME_CREDENTIAL_ATTESTATION` to exactly
   `unique-random-32-bytes-retained` only after generation, uniqueness and retention
   are confirmed. This attestation is nonsecret; it cannot mathematically prove
   entropy. Do not stage test fixtures. No runner generates or rotates a credential.
4. For the finally reviewed execution commit, replace `PREVIEW_SETUP_APPROVED_SHA`
   with its full SHA and retain exactly one Branch rule named
   `codex/preview-migration-txfxfrlhtvzwgluhnbpw-<full-reviewed-SHA>`.
   Keep administrator bypass disabled, owner-only creation guards, first attempt,
   and the setup-branch Vercel exclusion. Do not update/recreate a published branch.
5. Obtain final metadata/readiness preflight and explicit publication/activation
   approval. The workflow executes only `activate-runtime-login.mjs --plan` then
   `activate-runtime-login.mjs --activate-runtime-login`. No ordinary branch push,
   tag, update, force push, rerun, dispatch or schedule authorizes activation.
6. After successful activation and real runtime/Prisma acceptance, separately approve
   copying the retained runtime URL into the exact application branch's sensitive
   Vercel Preview `PREVIEW_DATABASE_URL`. Resolve inherited secrets first. Never put
   the administrator URL in Vercel. No Vercel write credential is needed by this job.

No automatic retry, credential replacement, NOLOGIN recovery or other database
change follows a failure. An uncertain commit or failed postcheck requires a new
read-only diagnosis and separate owner approval for any remediation.

Sources: [psql password handling and transactions](https://www.postgresql.org/docs/17/app-psql.html),
[PostgreSQL password authentication](https://www.postgresql.org/docs/17/auth-password.html),
[Vercel branch environment scoping](https://vercel.com/docs/environment-variables/manage-across-environments),
[Vercel sensitive variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables).

## Historical preparation validation (e77a29b)

The final activation candidate review and staging procedure are recorded separately
in [runtime-login-final-candidate.md](runtime-login-final-candidate.md). The table below
records the earlier acceptance-component preparation, not the current activation run.

| Suite/check | Result |
| --- | --- |
| runtime-login | 500 passed, 0 failed, 0 skipped; includes 31 new acceptance-control tests |
| auth-preview | 122 passed, 0 failed, 0 skipped |
| security | 212 passed, 0 failed, 0 skipped |
| Recycler/integrations/daily focused | 525 passed, 0 failed, 10 existing opt-in browser tests skipped |
| TypeScript / ESLint / Prisma validation / actionlint | Passed |
| Next.js production build | Passed with credentials stripped and external networking blocked |
| Provider-pattern scan | 818 intended files; zero findings |
| Gitleaks | Exit 1; nine unchanged, previously reviewed generic-key false positives; zero confirmed secrets |

Suites overlap; do not sum them as unique tests. Initial TypeScript validation caught
the tuple shape in a new test fixture, corrected without weakening its assertion.
The initial build was blocked by sandbox EPERM creating a .next directory; the same
offline validation wrapper passed with filesystem escalation, without source changes.
Gitleaks findings remain approved UUIDs, migration checksums, prose and synthetic
request identifiers; no scanner rules or allowlists changed. No runtime password,
database login, cloud resource write or live Prisma session was created by validation.
