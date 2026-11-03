# Phase 4A: dedicated Preview verification

Read-only observations on 2026-11-03. No migrations, roles, users, credentials or cloud settings
were changed. Local starting commit: `f26933e3399ac6718ae4736f84cf988285de51bd`.

## Observed infrastructure

Management metadata confirms `agent-workforce-preview`, `txfxfrlhtvzwgluhnbpw`, Primelis
(`ernouvntcojrxlahtbcr`), `us-west-2`, `ACTIVE_HEALTHY`, PostgreSQL 17.11.0.011, created
2026-11-03. Primelis reports the Free plan. No legacy or unrelated databases were queried.

Catalog queries found zero public relations, zero public types, no application tables in other
schemas, no custom schemas, and no public RLS policies. Neither `public._prisma_migrations` nor
`supabase_migrations.schema_migrations` exists. Auth and Realtime have their platform migration
tables; these are not Agent Workforce migration history. Auth users, identities, sessions and
instances each contain zero rows. Thus there is no existing Agent Workforce application data.

The database is not literally empty: Supabase system schemas/extensions and the public
`rls_auto_enable()` event-trigger routine exist. The enabled `ensure_rls` trigger targets table
creation. `recycler_preview_app` does not exist. The administrator has BYPASSRLS and must never
be used as the application connection. API roles have some default public-table privileges,
including TRUNCATE/REFERENCES/TRIGGER (and MAINTAIN on PostgreSQL 17); do not infer safety from
an empty schema or the automatic RLS trigger. The final migration explicitly revokes ALL table
privileges from PUBLIC, anon and authenticated and enables RLS on the application tables.

The verified cluster fingerprint in `verified-target.json` is a SHA-256 digest of PostgreSQL's
system identifier, not a password/key. The postgres operator can read that identifier. Together
with the exact TLS hostname and project pin, it prevents accidental execution against an unknown
cluster. A restored/replaced cluster requires fresh review; a physical clone may share a system
identifier, so the verified endpoint/management identity remains required. Do not bypass the pin.

## Migration and role review

The existing eleven migrations remain unchanged. They create the application schema, subsequent
research/draft and integration structures, Auth profile binding, then Data API restrictions.
The draft-array UPDATE is a no-op on this fresh target. No seed, Auth-user creation, provider call,
cron or worker is part of this migration chain. PostgreSQL compatibility is statically reviewed;
successful execution is not claimed until the separately approved run completes.

The setup tool now checks the exact ordered migration-name list, approved project, strict TLS,
operator, database fingerprint and absence of public relations/types. It rejects both legacy
projects, unknown targets and Production URL fallback. Plan mode makes zero database calls.

Both standalone SQL scripts check database/operator/fingerprint before mutations in a transaction.
The role script additionally requires eleven completed migrations, including the final restriction
migration, with no failed/rolled-back records. The Auth script requires the restricted NOLOGIN role,
no inherited memberships and User RLS. Any check failure aborts the transaction.

The role receives only CONNECT, public schema USAGE and SELECT of User's id/authUserId/email/name/role.
No writes, table ownership, auth-schema reads, sequence access, privileged membership or BYPASSRLS
is needed. The approved-user binding adds a SALES_USER row and row-specific SELECT policy only.
This matches `resolveApplicationUser`'s explicit five-column query and pre-bound Preview identity
checks. Direct Prisma does not set auth.uid(); the policy deliberately uses the approved UUID/email,
while the server verifies Supabase getUser first. The shared role can see all explicitly approved
test profiles, so this is a bounded demonstration role, not a general tenant-isolation mechanism.
Other application pages may fail closed; do not broaden grants to enable them.

## Exact execution sequence (approval required; not executed)

1. Reconfirm management identity/status and the absence of new application objects. Obtain explicit
   approval for **only the eleven migrations**. Securely supply the new project's administrator
   connection as `PREVIEW_SETUP_DATABASE_URL` in the operator's process; never put it in arguments,
   source, chat, logs or Vercel. The URL must use postgres, the verified direct host, port 5432,
   database postgres, and strict TLS options required by the validator. Clear inherited DATABASE_URL
   and DIRECT_URL. An IPv6-capable operator environment and successful certificate verification are
   required; neither a credentialed local connection nor IPv6 reachability was tested in Phase 4A.
2. From the release-candidate directory, with the secure connection already supplied:

   ```powershell
   $env:PREVIEW_SETUP_PROJECT_NAME = 'agent-workforce-preview'
   $env:PREVIEW_SETUP_APPROVED_PROJECT_REF = 'txfxfrlhtvzwgluhnbpw'
   $env:PREVIEW_SETUP_APPROVED_ENDPOINT = 'db.txfxfrlhtvzwgluhnbpw.supabase.co:5432'
   $env:PREVIEW_SETUP_APPROVAL = 'initialize:txfxfrlhtvzwgluhnbpw'
   node scripts/preview/setup.mjs --plan
   # Only after separate approval and a successful plan:
   node scripts/preview/setup.mjs --execute-approved-initialization
   ```

3. Stop on error; no automatic retry/reset. After success, verify eleven finished migration rows,
   their checksums against the reviewed files, zero unfinished entries, expected tables/columns,
   RLS on all application tables and denied API-role table access. Confirm no application rows
   were seeded. No runtime connection should be configured yet.
4. Obtain separate role/Auth approval. In a securely connected postgres administration session on
   the same target, execute the **entire** `scripts/preview/runtime-role.sql` with stop-on-error.
   Check effective grants, ownership, memberships, default/PUBLIC privileges and RLS before proceeding.
5. Review Auth settings: disable public signup and anonymous sign-in; use only approved, confirmed
   password test identities; do not copy Production identities, enable Google OAuth or dispatch mail.
   The available connector did not expose Auth signup/provider/Site URL/redirect configuration, so
   those settings remain unverified. They are required before user access, not for empty schema DDL.
6. After separate user approval, provision the approved identity without email dispatch. Supply
   `preview.approved_auth_user_id` and `preview.approved_email` through a secure SQL session, and run
   all of `scripts/preview/bind-test-user.sql` in that same session. Test allowed and denied profile
   reads using the role; confirm writes and all other application-table reads are denied. Only then
   separately approve secure password assignment and LOGIN activation. No default/example password.
7. Configure only the release branch after separate approval, following the initialization matrix.
   Neutralize inherited database/provider credentials. Configure exact HTTPS branch/deployment Auth
   callbacks, verify Deployment Protection and run approved authenticated synthetic smoke tests.

## Region and rollback

Use Vercel Node functions in **pdx1 (us-west-2)** for this Preview so database calls stay in-region.
Keep the existing Production region unchanged. Apply a release-branch deployment configuration only
in a future approved configuration stage; do not change the shared project default. Verify deployed
function placement. No database relocation or new paid infrastructure is needed.
Source: https://vercel.com/docs/regions

The eleven migrations are not one all-or-nothing transaction and have no automatic down path.
On partial failure, keep the project isolated, inspect migration history and stop for a reviewed
repair plan. Do not run migrate reset, mark migrations resolved, drop schemas or recreate the project
without approval. A role/Auth script failure rolls back that script's transaction. After later
activation, rollback starts by disabling Preview access and revoking runtime LOGIN; disable the test
identity and remove its profile/policy only under separate approval. Never remove neutralizing branch
environment overrides while a Preview remains reachable. Production and legacy projects are unaffected.

## Decision

GO for requesting approval to apply the eleven existing migrations to this exact dedicated project
through the guarded launcher. Execution still requires secure operator connection preparation and
fresh target checks. NOT approval to execute now or enable application access. Auth settings, effective
runtime-role/RLS verification, branch secret isolation, protection and deployment tests remain pending.
