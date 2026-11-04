# Isolated authenticated Recycler Preview

> Historical preparation record for b7c1819, not the current execution procedure.
> The owner's 2026-11-05 decision prohibits shared Preview scope cleanup and keeps
> the application branch deployment-disabled. Do not execute the cleanup or
> deployment-enabling steps below. The current procedure and replacement staging
> matrix are in [preview-bootstrap.md](preview-bootstrap.md).

Prepared 2026-11-04. Local candidate: `codex/isolated-recycler-preview-20261104`, based on
`c57a00aaede5f98d3391634e2f94998f36cb91a8`. No cloud settings are changed by this document.

## Verified infrastructure and limits

Existing Vercel project `primelis-outbound-intelligence`, ID
`prj_sicQocH4juE1Nr5gGpSA61mThxBT`, team `team_fcZKXkjbajRXQu1WmH2djn8n`.
Git connection is `Gilsuhar/Primelis-Outbound-Intelligence`; the saved Production
environment's Branch Tracking is exactly `main`. Root is `./`, Next.js,
Node 24.x, automatic build/install/development and ignored-build behavior; no deploy hooks.
Vercel Authentication protection is configured for `all_except_custom_domains`.
Use the protected vercel.app deployment URL, not a custom domain. Actual anonymous
denial and authorized browser access must be tested after deployment; configuration
alone is not evidence that a future deployment enforces protection.

Environment inventory: 22 bindings; no repository webhooks, connector connections or custom environments
returned by the Vercel API. Values were not retrieved or decrypted. Equal variable
names do not establish resource identity. Project-wide Preview bindings are shared
with every Preview branch unless overridden. Production-only bindings do not inherit
into Preview.

GitHub's Actions API returned only the existing setup workflow; main's tree contains
no `.github` workflows. The candidate's only workflow matches the excluded setup
namespace, not the application branch. No additional repository deployment automation
was observed. This cannot attest to undisclosed automation outside the inspected accounts.

Live restricted Prisma acceptance passed in run
https://github.com/Gilsuhar/Primelis-Outbound-Intelligence/actions/runs/41910848213 .
It verified the real five-column profile read and permission denials with independent
administrative before/after audits. This preparation does not repeat database queries
or claim that password sign-in has been tested in a deployed browser.

## Existing bindings: required manual cleanup before publication

Make these changes only after separate approval. Preserve every Production target
and its value. Do not substitute empty strings for credentials or database URLs.

| Current scope | Names | Required action |
| --- | --- | --- |
| Global Preview only | `DATABASE_URL`, `DIRECT_URL`, `PREVIEW_DATABASE_URL` | Remove these global Preview bindings. Recreate only restricted `PREVIEW_DATABASE_URL` on the exact application branch below. |
| Shared Production + Preview | `OPENAI_API_KEY`, `OPENAI_MODEL`, `AI_PROVIDER`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL` | Remove only the Preview target; retain Production unchanged. This also removes their inheritance by other future Preview deployments and requires owner approval. |
| Old `feature/agent-workforce-foundation` branch | `NEXT_PUBLIC_PREVIEW_SUPABASE_PUBLISHABLE_KEY`, `PREVIEW_DATABASE_URL`, `NEXT_PUBLIC_PREVIEW_SUPABASE_URL`, `NEXT_PUBLIC_PREVIEW_SUPABASE_PROJECT_REF`, `HUBSPOT_PRIVATE_APP_TOKEN`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `DIRECT_URL`, `DATABASE_URL` | Preserve these unrelated branch overrides. They must not be copied to the new branch and do not apply to it. |
| Production only | `VITE_METCHO2`, `HUBSPOT_PRIVATE_APP_TOKEN`, `DATABASE_URL`, `DIRECT_URL` | No change. Never copy into Preview. |

No Outreach, SMTP, worker or Supabase service-role secret appeared in the returned
project inventory. Recheck project/team shared variables and integration injection
immediately before deployment; stop if anything additional is inherited. Never run
`vercel env pull` to inspect secret values or transfer GitHub administrator credentials.

## Exact new environment matrix

Every manually configured row below must target **Preview**, Git branch exactly
`codex/isolated-recycler-preview-20261104`, never Production or all Preview branches.

| Variable | Value/source | Handling |
| --- | --- | --- |
| `PREVIEW_APPROVED_BRANCH` | `codex/isolated-recycler-preview-20261104` | Nonsecret |
| `PREVIEW_APPROVED_VERCEL_PROJECT_ID` | `prj_sicQocH4juE1Nr5gGpSA61mThxBT` | Nonsecret |
| `PREVIEW_APPROVED_SUPABASE_PROJECT_REF` | `txfxfrlhtvzwgluhnbpw` | Nonsecret |
| `NEXT_PUBLIC_PREVIEW_SUPABASE_PROJECT_REF` | `txfxfrlhtvzwgluhnbpw` | Public |
| `NEXT_PUBLIC_PREVIEW_SUPABASE_URL` | `https://txfxfrlhtvzwgluhnbpw.supabase.co` | Public |
| `NEXT_PUBLIC_PREVIEW_SUPABASE_PUBLISHABLE_KEY` | Existing publishable key from this exact dedicated project's API settings | Public project key; not a service-role/secret key; owner copies directly to Vercel |
| `PREVIEW_APPROVED_DATABASE_ROLE` | `recycler_preview_app` | Nonsecret |
| `PREVIEW_APPROVED_DATABASE_ENDPOINT` | `aws-1-us-west-2.pooler.supabase.com:5432` | Nonsecret |
| `PREVIEW_DATABASE_URL` | Owner-retained, already accepted restricted runtime URL | Sensitive, server-only; never administrator URL |
| `NEXT_PUBLIC_VERCEL_ENV` | `preview` | Public |
| `WORKFORCE_DAILY_ENABLED` | `false` | Defense in depth |
| `WORKFORCE_CRON_REHEARSAL_ENABLED` | `false` | Defense in depth |
| `COMPANY_PILOT_ENABLED` | `false` | Defense in depth |
| `COMPANY_PILOT_AI_ENABLED` | `false` | Defense in depth |
| `COMPANY_PILOT_SCHEDULE_ENABLED` | `false` | Defense in depth |

The runtime URL must use the project-specific session-pooler username
`recycler_preview_app.txfxfrlhtvzwgluhnbpw`, the approved host and port, database
`postgres`, properly percent-encoded retained password, and exactly the accepted
`sslmode=require&sslaccept=strict` trust parameters (optional supported pool limits
only). Do not place a connection string in a command argument, source file or chat.
Use the retained password-manager entry; GitHub secret metadata cannot recover it.
The application adds the reviewed, fingerprint-checked CA certificate via `sslcert`;
the public certificate is explicitly included in Next.js function tracing.

Vercel supplies `VERCEL_ENV`, `VERCEL_PROJECT_ID`, `VERCEL_GIT_COMMIT_REF`,
`VERCEL_GIT_COMMIT_SHA`, `VERCEL_URL` and `VERCEL_BRANCH_URL`. Enable automatic system
environment exposure if missing; do not spoof identity variables manually.
No new application signing secret, service-role key or administrator database URL is
required. Do not copy `PREVIEW_SETUP_*`, `PREVIEW_RUNTIME_*`, local DPAPI settings,
`LOCAL_DEV_LOGIN`, `LOCAL_DEV_SESSION_TOKEN`, provider credentials or TLS-disable flags.
Platform OIDC availability is not permission to call AI Gateway; Preview provider
execution remains denied in server code.

## Application compatibility and boundaries

`auth/server.ts` verifies Supabase Auth, confirmation/nonanonymous status and the
existing profile's Auth UUID/email/SALES_USER binding. Its Prisma projection is only
`id`, `authUserId`, `email`, `name`, `role`, matching live acceptance. Preview does not
autocreate or update a profile. Missing or invalid configuration fails closed.

Middleware redirects `/` and `/sales-agent` to `/sales-agent/recycler` before the
normal Dashboard's broader database queries. All Preview API routes return 403;
other product pages are denied. The synthetic Recycler uses in-memory fixtures and
requires server-side authentication. App-shell profile reads use the same restricted
projection. Full Dashboard/provider workflows are deliberately outside this Preview.
Do not broaden database grants to make them available.

The centralized Preview policy denies workers, scheduled execution, sending, CRM
writes, OAuth refresh and paid/AI calls even if enable flags are accidentally set.
The install hook is Prisma client generation, not migration. Build has no migration,
seed or worker hook; vercel.json has no cron. Setup Actions only match their dedicated
setup namespace and cannot be triggered by this application branch.

## Publication and manual setup order

1. Obtain approval for only the environment cleanup and exact branch-specific matrix.
   In Vercel Settings > Environment Variables, change scopes as listed above. Retain
   Production values and unrelated old branch overrides. Review metadata afterward.
2. Keep Vercel Authentication enabled. Confirm Production Branch is `main`, root `./`,
   automatic commands, Node 24.x and no deploy hooks. Confirm automatic system vars.
   Do not add production administrator access or disable authentication to fix a build.
3. Obtain separate publication/deployment approval. Push only the reviewed application
   branch at the reported commit, never main or a setup branch. Git publication may
   immediately create its Preview deployment, so complete isolation first.
4. Root vercel.json permits native Git deployment only for `main` and this exact
   application branch; `**` denies other branches and the setup namespace remains
   explicitly denied. This file does not modify remote main, retroactively govern
   older commits, or prohibit manual/API deployments. App identity guards independently
   reject any other branch. Audit external automations before publication.
5. After the actual protected HTTPS hostname exists, obtain approval to set the
   dedicated Supabase Site URL to that exact origin and, if callback flows are needed,
   allow only `https://<actual-host>/auth/callback`. Never invent a URL or use wildcards.
   Email/password sign-in uses the existing user; no invitations, reset emails, SMTP,
   OAuth or public signup are required. No password is requested in chat.
6. Owner tests through Vercel Authentication, then application password login. Check
   unauthenticated rejection, wrong/unbound identity denial, approved SALES_USER access,
   Dashboard redirect, synthetic Recycler and CSV, API 403s and signout. Inspect sanitized
   logs for permission failures and verify no provider calls/jobs. A platform-protected
   page alone is not proof of application authentication.

## Rollback and remaining gates

If a candidate fails, disable new deployments for this application branch and remove
only the failed Preview deployment through Vercel after approval. Keep Deployment
Protection and branch-specific isolation until deployment removal is confirmed; never
remove overrides first and allow fallback to shared credentials. No Production rollback,
database migration, profile deletion or credential rotation is part of this procedure.

GO is for configuring the isolated Preview, not publication yet. Required remaining
gates: owner-approved scope cleanup and secret/key staging; metadata recheck; exact
candidate publication approval; actual protected URL and approved redirect configuration;
real browser Auth and serverless CA/profile-read smoke tests. Local fixture browser
tests do not establish live password authentication or Vercel cold-start compatibility.

## Local validation results

Executed on this candidate with credential-stripping/offline validation wrappers:

| Check | Result |
| --- | --- |
| TypeScript / ESLint / Prisma 5.22 schema validation | Passed |
| Security | 212 passed, 0 failed, 0 skipped |
| Authentication / Preview | 122 passed, 0 failed, 0 skipped |
| Recycler / mocked integrations / daily engine | 525 passed, 0 failed, 10 existing browser-dependent integration skips |
| Runtime / TLS / provisioning guards including deployment-map regression | 683 passed, 0 failed, 0 skipped |
| UI / navigation / security acceptance | 235 passed, 0 failed, 0 skipped |
| Real local Chrome synthetic acceptance | 41 checks passed; zero external requests or browser exceptions |
| Production build | Passed after Windows sandbox EPERM required the same offline command outside the sandbox |
| Preview production build | Passed with synthetic bindings and no real credentials or external network access |
| Trusted CA packaging | Login and Recycler traces both resolve to the reviewed CA; Windows emits two slash styles for the same file |
| Runtime password in build artifacts | Synthetic password absent; no real runtime credential supplied |
| Actionlint / git whitespace checks | Passed |
| Gitleaks publication-file scan | 835 files; exit 1 for 9 unchanged, reviewed nonsecret findings; 0 new findings or confirmed secrets |
| GitHub-pattern-aware publication scan | 835 intended files, 0 findings |

Suites overlap; counts must not be added as unique tests. Gitleaks findings are
unchanged SQL digests, pinned metadata, documentation references and synthetic fixtures;
no scanner bypass was added. The 11 migrations, Prisma schema, lockfile, role/binding
SQL, authentication implementation and application execution guards remain unchanged.

References: [Vercel Git deployment rules](https://vercel.com/docs/project-configuration/git-configuration),
[environment scopes](https://vercel.com/docs/environment-variables),
[system variables](https://vercel.com/docs/environment-variables/system-environment-variables).
