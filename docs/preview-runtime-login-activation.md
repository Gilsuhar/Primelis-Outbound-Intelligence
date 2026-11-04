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
- Password URL-encoded once; verify decoded value matches the retained credential.
- The application guard validates the role/project/endpoint and adds the bundled,
  pinned Supabase CA as an absolute sslcert path. No operator-supplied CA override.

The new GitHub runtime Secret is a staging input, not the existing administrator
secret. Neither password nor URL may be emitted in diagnostics. Pass runtime data
only to the activation/acceptance step, never dependency installation, build or
artifact steps. Use private ephemeral files where a client requires them, with
cleanup on every outcome; keep the environment token out of database containers.

## Guarded activation protocol (not executed; transport adapter still required)

1. Reconfirm the exact project/owner/commit/branch/environment approval, management
   health and SSL Enforcement. Verify administrator authority without broader grants.
2. Validate the runtime URL against the fixed fields above, secret presence and
   credential retention/delivery approval before opening a write-capable session.
3. Use the pinned client and actual-connection conninfo gate with verify-full, CA,
   hostname, TLS >=1.2 and approved endpoint. Run bindingAuditSql(true) as the fresh
   read-only preflight on that same connection, including all 15 existing checks.
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
7. Connect using ONLY the runtime credential and run the prepared Prisma acceptance
   component. No administrator fallback, SET ROLE impersonation or new grants.
   Failure leaves readiness NO-GO; rollback/deactivation requires owner approval.

The existing runTlsSession feeds SQL through stdin, so blindly appending password
lines to it is unsafe. The activation-only adapter must keep fixed SQL input separate
from the private password prompt stream, retain the actual-client TLS gate, and test
prompt/EOF/error/rollback handling with the pinned psql before publication. This
adapter and activation-only workflow are not yet implemented or claimed executable.
Do not implement new SCRAM cryptography merely to avoid this supported client path.

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

Current database state is ready for guarded activation preparation. Actual LOGIN
activation remains NO-GO until the retained runtime credential/destinations are
approved and staged, and the small activation-only psql adapter/workflow described
above is implemented and validated. Do not activate merely because local tests pass.
The next owner approval should cover runtime-only credential staging in the existing
GitHub environment and the exact Vercel Preview branch configuration, not deployment.
No Production bindings, Auth users or schema changes are needed.

Sources: [psql password handling and transactions](https://www.postgresql.org/docs/17/app-psql.html),
[PostgreSQL password authentication](https://www.postgresql.org/docs/17/auth-password.html),
[Vercel branch environment scoping](https://vercel.com/docs/environment-variables/manage-across-environments),
[Vercel sensitive variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables).

## Validation performed locally

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
