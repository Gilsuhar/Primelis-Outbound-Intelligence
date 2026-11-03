# Agent Workforce — isolated Preview first-run checklist

**Status:** Preparation only. No live API success, Preview isolation, database migration, or Google login has been verified.

**Branch:** `feature/agent-workforce-foundation`. Do not merge to main or modify Production as part of these steps.

## Verified from repository and Supabase (2026-10-16)

- Prisma uses `DATABASE_URL` and `DIRECT_URL`; Supabase auth uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? NEXT_PUBLIC_SUPABASE_ANON_KEY`. If both publishable and anon variables exist, **publishable takes precedence**. Audit both.
- OAuth initiates Google through Supabase and returns to application `/auth/callback`; Google provider's authorized redirect URI must point to the **second Supabase project's** `/auth/v1/callback`.
- OAuth callback calls `resolveApplicationUser`, which requires a pre-existing Prisma `User` record with matching email (or previously bound auth user ID). **Google test-user permission alone does not provision this record.** A new empty database cannot sign in successfully until migrations and authorized user provisioning are completed.
- The candidate Preview Supabase project `ofxqdwpyqbvskrcfpdmx` currently has `public.Leads` and `public.library`, both reported as zero rows; no `public._prisma_migrations` table was found. Supabase migration listing is empty, which is **not** itself proof of Prisma migration status.
- Repository contains ten Prisma migration directories, including the initial schema and read-only integration sync. Initial and latest migrations and eight intervening migration files were inspected for explicit destructive statements; none contained DROP TABLE/TRUNCATE/DELETE FROM. This is **not** a substitute for migration rehearsal and backup.
- Vercel environment-variable read access via connector returned HTTP 403. Screenshots suggested branch-specific Preview variables were added; **runtime precedence and resolved deployment configuration remain unverified**.
- Existing deployment URLs may change. Supabase Site URL and allowlisted redirect URL must correspond to the **actual** deployed hostname; `/auth/callback` is the application's callback path. Prefer an explicitly controlled stable branch domain, and restrict redirect patterns as practical.

## Ordered go/no-go gates

1. **Freeze changes:** Do not redeploy, run migrations, sync CRM, or sign in against a shared/uncertain database.
2. **Inspect Vercel effective configuration** for the exact feature-branch Preview deployment, without displaying secret values. Confirm the four required variables all refer to Supabase project `ofxqdwpyqbvskrcfpdmx`, not original project `mfxqiyidmdppvdzeboke`. Check branch overrides and general Preview defaults, and check the publishable-key precedence above. Production must remain on original project.
3. **Confirm isolated backup and migration plan** for second Supabase project. Review all existing schemas and name collisions; ensure migration grants and correct `DIRECT_URL` session connection. Never run `prisma migrate dev` against shared or production DB. Use a reviewed `prisma migrate deploy` only after target verification and backup.
4. **Provision application user safely** after migrations, through an authorized seed/invite mechanism using the work email and expected role; avoid direct manual editing of production tables. Confirm operator binding separately (`INTEGRATION_OPERATOR_USER_ID` is application user ID, not HubSpot owner ID).
5. **Verify OAuth:** Google Cloud test user, Supabase provider client credentials, correct second-project Google redirect URI, Supabase Site URL/redirect allowlist, same-host PKCE cookies, app callback and authorized user lookup. If Vercel deployment protection returns 403, diagnose protection separately; do not bypass it.
6. **Smoke test read-only integration access:** HubSpot and Outreach scopes, ownership, complete historical coverage, opt-outs, bounces, complaints, active sequences, and opportunity clearance. Unknown evidence must stay HOLD.
7. **Run exactly one owned prospect** with scheduling off and paid API cap set to one. Verify evidence, costs, draft lock, and absence of sending/enrollment/CRM mutations.
8. **Only after success** configure and verify scheduled worker execution, budgets and monitoring.

## Safety / secrets

Never put database passwords, connection strings, Google client secrets, Outreach refresh tokens, or service-role keys into chat, screenshots, git commits, browser-exposed `NEXT_PUBLIC_*` values, or logs. The Supabase anon/public key and project URL are intentionally browser-public; the service-role key is not.

The second Supabase project was previously used for another application; the two existing tables must be preserved unless the owner explicitly authorizes otherwise.

## Blockers to report

- Vercel 403 prevents independently verifying effective environment bindings.
- Second database migrations and authorized application user have not been applied/provisioned.
- Deployed Google OAuth flow remains unverified.
- HubSpot/Outreach credentials and authoritative historical clearance are outstanding.
- Independent email/employment verification and provider pricing are outstanding.
- Scheduler remains disabled.

**Release decision:** NO-GO for live autonomous operation until all mandatory gates are verified.
