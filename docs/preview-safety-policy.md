# Restricted Preview safety policy

Phase 3B is a local safety patch on the release candidate. No deployment, resource provisioning,
credential transfer, live provider access or schema migration is part of this change.

## Initial allowed use

An authorized, confirmed Supabase identity with an explicitly pre-bound application profile may
sign in using the existing password flow and view the existing synthetic Recycler screen.
The screen retains the existing eligibility engine, HOLD/EXCLUDED explanations and CSV behavior.
It does not provide live collection or independent verification. Existing application roles and
Supabase session validation remain in force. Local-development authentication is unavailable on Vercel.
Preview login does not bind a profile by email or normalize it through a database write.

## Central policy and enforcement

`src/lib/preview-policy.mjs` is the single environment/operation policy. It is plain ESM so the
server, Edge middleware and existing Node maintenance scripts share exactly the same policy.
Any Preview or incomplete/unknown/conflicting Vercel identity is restricted. An unambiguous
`VERCEL_ENV=production` retains existing Production behavior; ordinary local execution also retains
existing behavior. An injected provider environment cannot override a restricted real runtime.
No feature flag enables forbidden operations in Preview.

Enforcement is before I/O, independently of UI visibility and middleware:

| Boundary | Restriction |
| --- | --- |
| Every `src/app/api/**/route.ts` resource handler, including delegated OAuth handlers | 403 before authentication lookup, storage, scheduling or provider access; no resource APIs are enabled for this first demonstration |
| Authenticated creator/reviewer server-action helpers | Deny business actions before profile lookup or service execution |
| HubSpot push service and its HTTP client | Deny even injected-client and direct-client write attempts |
| Shared CRM read transport, legacy HubSpot intake and Recycler transport | Deny provider requests before token lookup/fetch; existing origin, resource, pagination and identity restrictions remain |
| Outreach token access and authorization begin/finish | Deny before configuration loading, token decryption, lock acquisition, rotation or exchange |
| OpenAI legacy/workforce providers, semantic/strategy calls, GetLeads, verification, SerpApi, website/public-source research | Deny before requests, paid reservations or DNS access |
| Workforce/research/drafting engines, daily engine, worker entry points and fixture queue scheduler | Deny execution before persistence or injected handlers |
| Login-link and password-recovery actions | Deny email sending; existing password login and Production Auth are preserved |
| Migration wrapper, seed/import/preflight scripts and worker dispatchers | Deny maintenance execution in Preview before database/process/network work |

No Outreach write/enrollment or outbound sales-email transport was added. The existing CRM read
transport continues rejecting writes outside Preview too. Existing fixture-pilot configuration
cannot bypass the new policy. Its pure/local regression coverage is retained, but hosted queue
execution is intentionally no longer permitted.

## Required dedicated bindings

All must be branch-specific, verified through separate approval, and absent from Production:

- `PREVIEW_APPROVED_VERCEL_PROJECT_ID` must equal Vercel's `VERCEL_PROJECT_ID`.
- `PREVIEW_APPROVED_BRANCH` must equal `VERCEL_GIT_COMMIT_REF`.
- `PREVIEW_APPROVED_SUPABASE_PROJECT_REF` must equal `NEXT_PUBLIC_PREVIEW_SUPABASE_PROJECT_REF`.
  The public URL must be exactly `https://<ref>.supabase.co`; the two known legacy Primelis projects
  are rejected even if nominated. `NEXT_PUBLIC_PREVIEW_SUPABASE_PUBLISHABLE_KEY` is required for Auth.
- `PREVIEW_APPROVED_DATABASE_ENDPOINT` is the exact approved hostname and explicit port, either
  direct `db.<ref>.supabase.co:5432` or a reviewed Supabase pooler endpoint on 5432/6543.
- `PREVIEW_APPROVED_DATABASE_ROLE` must be `recycler_preview_app`. The URL username must be this
  role for direct access, or `recycler_preview_app.<ref>` for pooled access.
- `PREVIEW_DATABASE_URL` must have a password, `/postgres`, `sslmode=require` and
  `sslaccept=strict`. Duplicate query parameters, unknown options, fragments, other database names,
  privileged usernames and alternate endpoints are rejected. Only bounded pool configuration
  options are accepted. Errors contain only fixed codes, never connection strings.
- `DATABASE_URL` and `DIRECT_URL` must be absent/empty; they cannot be inherited as fallback.
  The runtime supplies the validated Preview URL explicitly to Prisma and cannot reuse a cached
  Production client when entering Preview.

Approval metadata validates configuration consistency, **not actual database privileges or resource
ownership**. Before publication, audit the actual runtime role: no superuser, BYPASSRLS, privileged
memberships, schema creation or migration rights; inspect effective table/function grants and RLS.
For this initial demonstration, grant only required read access to pre-bound user profiles. Copy no
Production users, sessions, integration records, OAuth credentials or customer data.

No schema changes or automatic migrations were added. `build` remains `next build`; `postinstall`
remains `prisma generate`. The existing `prisma:migrate` entry point delegates to the unchanged
`prisma migrate dev` command only outside restricted environments. Arbitrary operator-run Prisma
CLI commands are not an application security boundary: keeping migration credentials out of Preview
and verifying the deployment's install/build overrides remains mandatory.

## Tests and operational impact

Mocked security tests cover all resource handlers, real adapter/service boundaries, zero provider
calls, no token-store access, ambiguous environment identity, URL/role/TLS mismatches, migration and
worker-script rejection, pre-bound Auth profiles, authenticated synthetic review and Production
compatibility. Workflow assertions previously exercised under Preview now run in local fixtures;
hosted success expectations are replaced with stronger denial/no-storage assertions. No tests are
disabled or assertions relaxed to admit a forbidden operation.

Intentional impact: Preview dashboard/resource APIs, legacy fixture workers, drafting/research,
login-link and recovery emails are unavailable. Existing pages that depend on those APIs may show
unavailable states; the first supported demonstration is `/sales-agent/recycler`. Production/local
behavior is unchanged except additional rejection of ambiguous cloud identity. No new dependency,
schema or deployment architecture is introduced.

## Remaining approval prerequisites and rollback

Provision or verify a dedicated Preview resource separately; establish the least-privilege role,
apply the existing schema only there under separate approval, pre-bind invited test users, configure
exact HTTPS redirects and disable public signup/anonymous Auth. Neutralize inherited provider/DB
credentials, inspect build overrides/schedulers, and independently verify Vercel Deployment Protection
and application authentication on the eventual candidate deployment. Do not enable live integrations.

Rollback is a local revert of this patch while publication remains blocked. Never deploy the older
unguarded candidate as a rollback. Before removing future branch-specific neutral overrides, disable
candidate execution so inherited credentials cannot become active. Production configuration is untouched.
