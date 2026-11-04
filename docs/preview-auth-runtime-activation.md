# Phase 5H — Preview Auth and runtime activation preparation

Prepared branch: `codex/preview-auth-runtime-preparation-20261104`.
Base: `fa686407fdca251e7578623fa5a36ff741463d8b`, including the protected product release
and corrected runtime-role guards. Never publish this ordinary application branch until
its Preview bindings and deployment protection have been verified. Publication could
trigger Vercel Preview; the setup-branch exclusion does not cover this branch.

## Verified state and scope

Target only agent-workforce-preview / txfxfrlhtvzwgluhnbpw / Primelis / us-west-2.
Run 41872164986 applied and independently verified recycler_preview_app. A subsequent
read-only postcheck still passed: NOLOGIN, password absent, restricted attributes,
reviewed membership, five profile-column grants, no unexpected effective access,
11 matching completed migration checksums, expected 50 tables, pinned schema/fingerprint,
RLS and denied anon/authenticated access, zero application rows/Auth users.

Do not run setup.mjs, migrate deploy, seeds, runtime-role.sql or the provisioning
workflow again. The role already exists. No role, credential, user, profile or policy
was created or changed during this preparation.

Current Vercel metadata: project prj_sicQocH4juE1Nr5gGpSA61mThxBT, team
team_fcZKXkjbajRXQu1WmH2djn8n, Node 24.x, Vercel Authentication enabled for
all_except_custom_domains. Actual protection must be tested on the eventual vercel.app
Preview URL; do not use an unprotected custom domain. No secret values were decrypted.
Generic Preview DATABASE_URL, DIRECT_URL and PREVIEW_DATABASE_URL exist. Auth URL/key,
OPENAI_API_KEY, AI_PROVIDER, OPENAI_MODEL and NEXT_PUBLIC_APP_URL have shared
Production/Preview bindings. Existing branch overrides belong to
feature/agent-workforce-foundation, not this branch. Their resource identity is unverified.
The connected Supabase tools do not expose Auth configuration here; signup/anonymous/
provider settings must be checked through the dedicated project's authorized dashboard
before the separately approved Auth settings action. Do not infer safe settings from
zero users.

## Recommended order: separately approved operations

1. **Next action: Preview Auth configuration only.** On the exact project, disable
   public signup and anonymous sign-in, retain email/password, and verify no external
   provider or email-based onboarding is needed. Preserve Production and Google OAuth
   settings elsewhere. Record only setting names/booleans. No users or DB activation yet.
2. Approve one precise test email belonging to the operator/reviewer. Confirm ownership
   out of band. Create exactly one nonanonymous, confirmed user through Supabase Admin
   createUser with a unique strong password and email_confirm=true. Use the existing
   trusted admin context; never invite, signUp, send recovery email or import Production
   users. Read back the exact Auth UUID, normalized email and confirmation state; return
   match booleans, not tokens or personal data. Do not create the profile in this action.
3. Bind the approved identity using the reviewed `scripts/preview/bind-test-user.sql`
   on a strict-TLS trusted admin session, after a fresh identity/role/privilege preflight.
   Supply `preview.approved_auth_user_id` and `preview.approved_email` securely to that
   session; do not put them in a public workflow, SQL log or command history. Require
   exactly one matching Auth user, no existing application profiles and no public RLS
   policies before execution. The file checks the pinned cluster, inactive restricted
   role and confirmed UUID/email, inserts exactly one SALES_USER and creates one
   SELECT policy restricted to that UUID/email/role. No upsert, Auth write or API-role
   grant. On any failure, roll back and inspect; do not retry automatically.
4. Separately approve secure runtime password creation, LOGIN activation and real-role
   verification described below. Do not use the already-published NOLOGIN workflow.
5. Separately approve branch-specific Vercel configuration, then its read-only preflight.
   Publish/deploy only after a further explicit approval. No live integrations.

No test email or exact HTTPS Preview origin has been approved in this preparation.
These are concrete inputs required before the corresponding operations. Never request
passwords or database connection strings in chat.

## Runtime activation requirements and execution boundary

- Keep role recycler_preview_app and every existing privilege unchanged. No grants,
  memberships, ownership, migrations or RLS alterations in the activation operation.
- Use one newly generated 32-random-byte credential (at least 256 bits before encoding),
  distinct from the administrator and Auth-user passwords. Generate only after approval
  in the trusted operator runtime; never in a command argument, transcript or source.
- Reuse the reviewed pinned PostgreSQL client, CA pin/validity, verify-full, hostname
  check and conninfo gate on the actual connection to
  aws-1-us-west-2.pooler.supabase.com:5432. Verify management target and pinned cluster
  independently with the administrator connection before role changes.
- A new reviewed activation-only execution wrapper is required: the existing runner
  intentionally supports NOLOGIN creation only. It must preserve owner/exact SHA,
  first-attempt authorization and private output handling; accept no arbitrary SQL.
  Its fixed transaction may change only this role's password and LOGIN attribute after
  rechecking the one approved binding and all effective grants. Use a correctly tested
  client-side SCRAM-SHA-256 verifier (or psql's supported password facility), not raw
  interpolated plaintext SQL. Do not grant permissions to make a failed test pass.
- Treat password/verifier, runtime URL, pgpass and refresh/session tokens as secrets.
  The administrator credential remains in the existing setup-only environment and
  never enters Vercel. Runtime connection data is persisted only in the approved
  branch-specific Preview Secret; any temporary operator material must remain private,
  in memory or a 0600 ephemeral file with cleanup. Do not create a new secret store.
  Credential creation/activation and Vercel secret delivery each require approval;
  arrange the secure delivery path first rather than leaving an active orphan credential.
- No activation wrapper or credential has been executed or created in this phase.
  Credential transport/client-side SCRAM must be reviewed and tested before activation;
  successful administrator connectivity is not proof of runtime connectivity.

## Mandatory real runtime-connection acceptance

Connect through Session Pooler port 5432 as recycler_preview_app.txfxfrlhtvzwgluhnbpw
to database postgres using only the new credential. Use the same pinned CA in both
libpq and Prisma 5.22.0. The application accepts sslmode=require&sslaccept=strict and
adds the pinned bundled sslcert path; use connection_limit=1 for the first demonstration.
No administrator URL, DIRECT_URL fallback or operator-supplied CA path is permitted.

The trusted admin audit checks the cluster fingerprint and password/attribute state.
The runtime account must not be granted pg_control_system, pg_authid or auth.users
access merely to repeat that audit. Its independent session checks ordinary catalogs:
session_user/current_user match the runtime role, no elevated attributes or outgoing
memberships, expected read-only default, no schema/database ownership, no CREATE/TEMP,
no table writes or grant options, exactly five profile columns, no sequence access
(CASE guards) and no unexpected effective routine/schema/object access. Report only
condition names/booleans. Expected incoming creator ADMIN membership has INHERIT/SET
disabled; do not incorrectly classify it as an outgoing privilege.

Run the actual Prisma profile lookup shape from src/lib/auth/server.ts: where Auth
UUID OR normalized email, selecting only id, authUserId, email, name, role. Confirm one
approved SALES_USER result, no result for an unrelated UUID/email, and failure for a
disallowed column/whole-table SELECT. Use SELECT and catalog permission queries for
negative write tests; do not attempt INSERT/UPDATE/DDL as a test. The existing server
requires both UUID and email to match and never binds or updates a profile in Preview.
Column-level SELECT is sufficient for the five-field lookup; no timestamp columns or
whole-table grant should be added. Live Prisma/RLS compatibility remains unverified
until this actual runtime login is authorized and succeeds.

After profile creation the old zero-data/zero-policy postcheck must intentionally fail.
Use an exact expected-delta audit: one authorized Auth UUID, one matching SALES_USER,
one exact SELECT-only policy for recycler_preview_app, zero other application records,
unchanged 11 migration checksums/table definitions/RLS/API restrictions and no extra
roles/grants. Do not rewrite migrations or broaden the old zero-data checks to hide data.

## Auth URLs and session boundaries

Use only the actual exact HTTPS branch URL once Vercel resolves it. Supabase Site URL
must equal that origin; allowed callback must equal `<approved HTTPS origin>/auth/callback`.
Do not guess the hostname or allow wildcard vercel.app, localhost or Production redirects.
The first demonstration uses password login, which does not require OAuth redirects;
callback configuration alone does not authorize Google or email flows.

Preview now explicitly sets Secure, HttpOnly, SameSite=Lax, host-only cookies in server
actions, middleware refresh and callback responses. It retains SDK expiry/removal behavior.
getUser validates the dedicated Auth session server-side; exact UUID/email and application
role enforce access. User metadata cannot authorize a role. No local-login bypass on Vercel.
Preview Google initiation, recovery sends and password mutation remain unavailable.
A same-origin HTTPS-only POST /auth/signout clears the current session; cross-origin/
missing-origin requests fail before Auth I/O. Production login/logout behavior is unchanged.

Preview GET access is limited to login/callback and synthetic Recycler; root/dashboard
entry redirects to the protected Recycler. Other pages and all resource APIs are denied.
Business POSTs remain blocked. Synthetic CSV is generated in the existing client flow;
it performs no provider or database write. Navigation reflects this server-side restriction.

## Branch-specific Vercel plan (not applied)

All values below target Preview + codex/preview-auth-runtime-preparation-20261104 only.
Do not change Production targets, unrelated Preview branches or global project settings.

| Name | Required value/source |
|---|---|
| PREVIEW_APPROVED_BRANCH | codex/preview-auth-runtime-preparation-20261104 |
| PREVIEW_APPROVED_VERCEL_PROJECT_ID | prj_sicQocH4juE1Nr5gGpSA61mThxBT |
| PREVIEW_APPROVED_SUPABASE_PROJECT_REF | txfxfrlhtvzwgluhnbpw |
| NEXT_PUBLIC_PREVIEW_SUPABASE_PROJECT_REF | txfxfrlhtvzwgluhnbpw |
| NEXT_PUBLIC_PREVIEW_SUPABASE_URL | https://txfxfrlhtvzwgluhnbpw.supabase.co |
| NEXT_PUBLIC_PREVIEW_SUPABASE_PUBLISHABLE_KEY | Dedicated project's public publishable key, securely configured |
| PREVIEW_APPROVED_DATABASE_ROLE | recycler_preview_app |
| PREVIEW_APPROVED_DATABASE_ENDPOINT | aws-1-us-west-2.pooler.supabase.com:5432 |
| PREVIEW_DATABASE_URL | Branch-specific Secret containing only the runtime-role connection |
| NEXT_PUBLIC_VERCEL_ENV | preview, consistent with actual platform VERCEL_ENV |
| DATABASE_URL, DIRECT_URL | Explicit empty branch overrides; no inherited value |
| NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Explicit empty branch overrides; no Production Auth values in bundle |
| OPENAI_API_KEY, OPENAI_MODEL, AI_PROVIDER, NEXT_PUBLIC_APP_URL | Explicit empty branch overrides of observed shared bindings |

Verify effective branch resolution after approval. If empty overrides cannot be saved
or do not mask inheritance, stop; scope changes preserving Production/other branches
require a separate reviewed plan. Merely omitting a key is not an inheritance override.
Re-inventory before deployment for additional providers, HubSpot/Outreach, service-role,
worker/cron and local-login secrets; none belong in this runtime. Never provide
PREVIEW_SETUP_DATABASE_URL, LOCAL_DEV_LOGIN, LOCAL_DEV_SESSION_TOKEN or service-role keys.
Do not spoof platform VERCEL_ENV, VERCEL_PROJECT_ID or VERCEL_GIT_COMMIT_REF.

Keep Vercel Authentication on and use its protected vercel.app URL. Do not add bypass
tokens, deployment hooks, cron jobs or migration build commands. package.json build
runs next build; postinstall runs prisma generate, not a database migration. Default-deny
server boundaries continue blocking CRM writes/reads, sends, Outreach OAuth refresh,
paid providers, agent execution and workers even if unexpected configuration is present.

## Security and smoke acceptance after separately approved deployment

- Unauthenticated browser is stopped by Deployment Protection independently of App Auth.
- Authorized Vercel viewer without an app session redirects to login; resource APIs deny.
- Approved test identity can sign in, reach synthetic Recycler/details/CSV, and sign out.
- Expired/tampered/foreign-project session, unknown profile, unconfirmed/anonymous user,
  mismatched UUID/email and unrecognized role fail closed without profile writes.
- Confirm Secure/HttpOnly/SameSite/host-only cookie flags and private no-store responses.
- Disallowed pages/POSTs, local bypass, workers, sends, CRM, OAuth refresh and paid calls
  fail server-side; no corresponding network operations or application records appear.
- Confirm real runtime role and pinned CA in deployed Prisma trace; no admin credential,
  paid-provider key or Production Auth binding in the build/runtime environment.
- Inspect sanitized logs; never log cookies, auth codes, tokens, passwords or URLs with secrets.

Rollback requires its own approval: gate/remove Preview access first, restore NOLOGIN
and terminate only this role's existing sessions (NOLOGIN alone does not end them),
revoke approved Auth sessions and remove only the exact profile/policy/user if necessary.
Do not restore broad PUBLIC grants, drop the verified schema or reset migration history.

References: [Supabase Admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser),
[Auth redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls),
[PostgreSQL password handling](https://www.postgresql.org/docs/17/app-psql.html),
[Vercel environment variables](https://vercel.com/docs/environment-variables).

## Executed local validation

| Command through validation/run.ps1 | Passed | Failed | Skipped |
|---|---:|---:|---:|
| auth-preview (Auth/UI) | 122 | 0 | 0 |
| role-runner (runtime permissions/TLS/owner guards) | 363 | 0 | 0 |
| security | 212 | 0 | 0 |
| focused (Recycler/integrations/daily) | 525 | 0 | 10 |

Suites overlap; do not sum them as unique tests. The ten skips are existing opt-in
Outreach Chrome tests, not disabled security assertions. No live provider calls ran.
TypeScript, ESLint, Prisma validation and actionlint passed. The Next.js 15.5.20
production build passed with the offline guard after the initial Windows sandbox
attempt failed on EPERM creating a .next output directory. No source change or test
weakening was needed for that filesystem retry.

Gitleaks scanned all 807 intended publication files and reported seven unchanged,
previously reviewed generic-key false positives: two migration checksums, two prose
lines and three synthetic idempotency/request keys. Zero confirmed secrets; do not
describe the raw scanner exit as clean (it returned 1 for those seven findings).
The supplemental provider-pattern history scan is also required on the final commit.
Live cloud login, real-role Prisma access and Deployment Protection browser tests are
explicitly pending provisioning/deployment approval; no mocked result substitutes for them.
