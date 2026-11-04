# Protected synthetic Recycler release — Phase 5

Local release branch: `codex/protected-preview-release-20261104`.
Base: `9040f854bfcc84fc20c447113c4bfb3ecb0af430`.
Merged product acceptance: `90b8a06aa299cba5531ca195c9a2fd30f5a0b91a`.
No merge conflicts; both source tips and the recovery archive are preserved.

## Scope and preserved baseline

The successful administrative audit is GitHub run 41837457976. It verified 11 migration records,
checksums, the aligned Prisma schema, 50 public tables (including `_prisma_migrations`), RLS,
denied API-role access and empty application/Auth data. This release changes neither the migrations,
Prisma schema nor lockfile. Never rerun initialization. The audit's empty-data baseline intentionally
will no longer hold after an explicitly approved application profile is provisioned.

The sprint provides the searchable Daily Recycler, evidence gaps and source timeline, qualification
details, safe CSV, synthetic research/draft example and dashboard entry. Synthetic fixtures are not
live verification. Owner 1087915602, HubSpot-ID deduplication, four calendar months, independent
verification, current employment and suppression/history gates are preserved. The product's visible
DISQUALIFIED label maps to engine EXCLUDED. No automatic sending, enrollment or live research is enabled.

Preview still denies resource APIs, workers, paid providers, CRM writes, Outreach refresh and business
actions at server boundaries. Login uses real dedicated Supabase Auth and a bound database profile;
no local-login bypass is usable on Vercel. No new execution workflow is added. The retained administrative
workflow only admits its SHA-named migration namespace and cannot run on this release branch.

## Runtime role: smallest separately approvable action

Target only `txfxfrlhtvzwgluhnbpw`, Primelis, us-west-2. Use the trusted operator connection with the
existing strict Supabase CA/hostname checks and independently pinned cluster fingerprint. Do not put
its administrator credential in Vercel. The application never falls back to administrator credentials.

First approve execution of **only** `scripts/preview/runtime-role.sql` on this target. Execute the exact
reviewed file once with stop-on-error, without wrapping it in another transaction. It creates
`recycler_preview_app` as NOLOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOINHERIT, NOBYPASSRLS,
NOREPLICATION and sets `default_transaction_read_only=on`. It grants only:

- CONNECT on postgres and USAGE on public.
- Column SELECT on public.User: id, authUserId, email, name, role.
- No table-wide SELECT, DML, sequence access, migration history access, Auth schema grants or membership.

PUBLIC privileges apply even with NOINHERIT. The prepared transaction revokes PUBLIC public-schema
CREATE, database TEMPORARY and public function EXECUTE, plus future public function EXECUTE for the
executing owner. These are dedicated-project ACL changes, not migration/schema changes. It checks
effective memberships, ownership, all non-system table/column/sequence privileges and callable
non-system routines before COMMIT. Any unsupported revoke or unexpected inherited access aborts the
whole transaction. Do not grant Supabase system roles or edit system-schema privileges to make it pass.
The connected Supabase tool did not supply a usable link_id during Phase 5, so a new live catalog
inspection was unavailable. Effective grants and grant authority remain execution-time prerequisites;
static SQL tests do not prove them. Review any reported failure before proposing further ACL changes.

The smallest cloud-only operator path is the authenticated Supabase SQL Editor for this exact project,
running the reviewed file as one transaction after explicit approval. Confirm management project ID
before opening the editor; the file independently checks the cluster fingerprint before any mutation.
An alternative existing trusted SQL connection must retain strict CA/hostname verification. Do not
publish another migration workflow or reuse the administrator secret in application configuration.

No RLS policy is created by role setup, so even the five allowed profile columns initially yield no
visible rows. PostgreSQL grants and RLS enforce read scope; the role read-only default is defense in
depth, not an immutable restriction (a role can change its own session default). Ordinary system
catalog/routine access remains PostgreSQL-managed. Application code has no arbitrary SQL endpoint.

Post-setup: verify all role flags, zero memberships/ownership, the five column grants, no other effective
data/write privileges, RLS still enabled and anon/authenticated still denied. Keep NOLOGIN until the
separate Auth/profile/password steps below. No role was provisioned in Phase 5.

## Auth and activation: later explicit approval

1. In the dedicated Preview project's Auth settings, disable public signup and anonymous sign-in;
   retain email/password login. Do not reuse Production users, Google OAuth configuration or sessions.
2. Approve one test identity. A trusted administrator creates a confirmed, nonanonymous user with a
   securely injected password using the admin create-user operation, not invite/recovery email. Never
   place a service-role key in the application or paste credentials into chat/logs.
3. Securely supply `preview.approved_auth_user_id` and normalized `preview.approved_email` to the
   operator session; execute the exact `scripts/preview/bind-test-user.sql` once. It rechecks fingerprint,
   inactive runtime role and existing confirmed Auth identity, inserts one SALES_USER profile and a
   SELECT-only policy restricted to that UUID/email/role. No seed, upsert or Auth schema policy.
4. Separately set a generated runtime-only password through secure administration and enable LOGIN
   for `recycler_preview_app`. Re-audit flags/memberships/ACLs and make a role-authenticated read-only
   connection test. No admin credential is copied. This shared server role can read explicitly approved
   profiles; per-request Supabase getUser and exact UUID/email binding enforce application identity.
5. Use the eventual exact HTTPS branch origin for Auth Site URL and its exact `/auth/callback` as an
   allowed redirect. No guessed hostname or wildcard. Add an exact deployment callback only if needed.
   Password login does not require external OAuth. Existing recovery/email actions are denied in Preview.

The server verifies getUser, confirmed email, nonanonymous identity and exact pre-bound profile.
Foreign/stale sessions and unknown application roles fail closed; Preview login cannot auto-bind or
update a profile. Existing SSR cookie persistence is retained; validate Secure/SameSite cookies over
HTTPS after deployment. Real Auth login cannot be proved before provisioning.

## Vercel read-only findings and required configuration

Project `primelis-outbound-intelligence`, ID `prj_sicQocH4juE1Nr5gGpSA61mThxBT`, team
`team_fcZKXkjbajRXQu1WmH2djn8n`. API inspection showed Node 24.x and Vercel Authentication enabled
for `all_except_custom_domains`. Password protection is off. Actual enforcement must be checked on
the new Preview URL, independently of application Auth; no bypass links or tokens are needed.

Environment metadata inspection (no decrypted values) found globally scoped Preview DATABASE_URL,
DIRECT_URL and PREVIEW_DATABASE_URL. OPENAI_API_KEY, AI_PROVIDER, OPENAI_MODEL, NEXT_PUBLIC_APP_URL,
NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY share Production/Preview bindings.
Existing branch-specific settings target `feature/agent-workforce-foundation`, not this release.
Resource identity of those encrypted values is unverified; none may be reused by assumption.

Before publishing this branch, prepare exact branch-scoped Preview overrides. Preserve Production and
all unrelated branch bindings. Override DATABASE_URL, DIRECT_URL, OPENAI_API_KEY, AI_PROVIDER,
OPENAI_MODEL, NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY with
empty values for this branch (or remove their Preview inheritance through separately approved scope
changes). Verify effective branch resolution before deployment. An inherited nonempty DATABASE_URL
or DIRECT_URL deliberately makes runtime access fail closed.

| Branch-scoped setting | Required value |
|---|---|
| PREVIEW_APPROVED_BRANCH | codex/protected-preview-release-20261104 |
| PREVIEW_APPROVED_VERCEL_PROJECT_ID | prj_sicQocH4juE1Nr5gGpSA61mThxBT |
| PREVIEW_APPROVED_SUPABASE_PROJECT_REF | txfxfrlhtvzwgluhnbpw |
| NEXT_PUBLIC_PREVIEW_SUPABASE_PROJECT_REF | txfxfrlhtvzwgluhnbpw |
| NEXT_PUBLIC_PREVIEW_SUPABASE_URL | https://txfxfrlhtvzwgluhnbpw.supabase.co |
| NEXT_PUBLIC_PREVIEW_SUPABASE_PUBLISHABLE_KEY | Dedicated project's publishable key, configured securely |
| PREVIEW_APPROVED_DATABASE_ROLE | recycler_preview_app |
| PREVIEW_APPROVED_DATABASE_ENDPOINT | aws-1-us-west-2.pooler.supabase.com:5432 |
| PREVIEW_DATABASE_URL | New runtime-role secret only; session-pooler username recycler_preview_app.txfxfrlhtvzwgluhnbpw; database postgres; strict TLS |

The runtime URL must use `sslmode=require&sslaccept=strict`; `connection_limit=1` is supported for the
initial demonstration. The application adds a fixed bundled `sslcert` path and verifies the same
public CA pin/validity as the administrative audit. Operator-supplied certificate paths are rejected.
Never supply PREVIEW_SETUP_DATABASE_URL, service-role keys, local login settings, provider tokens or
worker credentials to Vercel. Platform VERCEL_ENV, project/branch/URL variables must reflect the actual
deployment; do not spoof them. Do not add cron jobs. A nearby US West function region can be chosen
in a separately approved branch-only deployment configuration; do not change Production's region.

No cloud configuration was changed. This ordinary release branch would permit Vercel Git deployment
when published; the migration-branch exclusion remains unchanged and applies only to setup branches.
Therefore publication must wait for effective environment isolation and protection verification.

## Rollback and release gates

Role preparation is atomic: failure rolls back. After successful NOLOGIN setup, rollback only the
new role's grants/role under separate approval; do not blindly restore PUBLIC privileges. Profile and
Auth removal require their own exact-identity approval. Runtime activation can be stopped with NOLOGIN
and session revocation. Branch-scoped Vercel changes can be removed without touching Production, but
first disable/remove any resulting Preview to prevent inherited credentials becoming active.

Next approval should cover only guarded NOLOGIN runtime-role provisioning and its effective-privilege
verification. Auth provisioning, credential activation, Vercel scope changes, publication and deployment
remain separate. After those gates, test anonymous denial, approved SALES_USER login, unbound-user
denial, synthetic Recycler/CSV, live-resource denial, no worker/provider activity and error-free logs.

References: [Supabase roles](https://supabase.com/docs/guides/database/postgres/roles),
[Auth redirects](https://supabase.com/docs/guides/auth/redirect-urls),
[Vercel environment scoping](https://vercel.com/docs/environment-variables).

## Executed local validation — 4 November 2026

| Check | Actual result |
|---|---|
| Full parallel suite | 3,091 passed, 0 failed, 18 conditional skips; 210 passing files, 1 skipped |
| Full serial suite | 3,091 passed, 0 failed, 18 conditional skips; 210 passing files, 1 skipped |
| Explicit security subset | 190 passed, 0 failed, 0 skipped |
| New runtime TLS/role contracts (included above) | 12 passed, 0 failed; role tests are static, not live SQL |
| Real Chrome Recycler acceptance | 41 checks passed, 0 browser errors, 0 external browser requests |
| TypeScript / ESLint / Prisma validation | Passed |
| Next.js production build | Passed; Recycler function trace includes the public Supabase CA |
| Migrations, Prisma schema and dependency lockfile | Byte-identical to audited base |
| Gitleaks + supplemental provider-pattern scan, 46 publication files | Zero findings |

The 18 unchanged conditional skips cover ten opt-in Outreach Chrome tests, five real-database tests,
two live-research diagnostics and one absent private operator helper. This phase ran the separate
41-check Recycler Chrome harness, not the Outreach browser suite. Browser authentication is an
isolated local fixture; dedicated cloud Auth and actual Deployment Protection are not yet smoke-tested.

Initial parallel execution encountered Windows sandbox process/temporary-directory restrictions,
CRLF checkout differences and a new CA-pin transcription error caught by its regression test. The
reviewed LF bytes and exact CA pin were restored; full serial and parallel runs above then passed
without weakening assertions. The build retains an existing Supabase dependency warning about
process.version in the Edge middleware bundle; production compilation succeeds. Actual protected
Preview middleware/login behavior remains a deployment smoke-test gate.

Validation logs and browser artifacts are ignored local files under validation/ and
outputs/recycler-acceptance/. No fixtures or credentials were loaded from local secure configuration.
