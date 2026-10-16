# Read-only HubSpot and Outreach synchronization

This implementation runs in the existing authenticated Next.js application on Vercel, with its existing Prisma/PostgreSQL persistence. It adds no sending, enrollment or CRM-write API. New sync actions and worker execution are disabled when `VERCEL_ENV=production`. Existing legacy tools are preserved.

## Current verification and limits

Automated tests use explicitly fictional API responses. No provider credentials or PostgreSQL connection are available in the implementation workspace, whose published network allowlist also excludes `api.hubapi.com` and `api.outreach.io`. **Neither provider has been live-verified.** Environment-variable presence never sets Connected. Authenticated reads of every required resource must succeed first; diagnostics become untested after 24 hours without another check.

API-visible historical import is implemented. **Full Outreach history clearance is not implemented:** pagination does not establish retention, all-user visibility or complete historical complaint/bounce coverage. The adapter deliberately emits `outreachHistoryComplete=false`, preserves positive suppression signals and never emits false bounce/complaint clearance from absent records. Therefore new connector results remain HOLD even when synchronization completes. Resolving this requires an authoritative history/visibility and suppression source supported by the organization's Outreach tenant; an operator toggle or an environment flag must not substitute for evidence. No optimistic "never contacted" assertions are generated.

Explicit HubSpot-to-Outreach prospect ID mappings and fresh independently verified business-email matching are supported. There is no generic trustworthy CRM-plugin mapping adapter yet: unscoped `externalId`/`externalSource` values are not sufficient to prove the HubSpot portal association. Missing or ambiguous identities remain UNKNOWN/HOLD. Independent employment/email verification and Similarweb are separate existing blockers, not bypassed here.

There is no in-app OAuth authorization-code callback in this release. An administrator must authorize the Outreach developer app and securely provide its initial refresh grant. Refresh-token rotation is implemented and encrypted in the database. This bootstrap configuration is for Gil's single sync operator account; do not share the same rotating grant between application users, Preview databases, tools or deployments.

## Authentication and minimum read permissions

### HubSpot

Use the existing server-side **Private App bearer access token**. No API key or user-password authentication. Request only:

- `crm.objects.contacts.read`
- `crm.objects.companies.read`
- `crm.objects.deals.read`
- `crm.objects.emails.read`

These are read scopes in HubSpot's published CRM API specification. Older app configurations may expose different email-access permissions; the administrator must validate their token against the actual email endpoint rather than assume scope-name equivalence. Object association reads and deal pipeline/stage metadata are also required; no schema-write, contact-write, email-send or automation scope is requested. Tenant entitlements and user visibility can still deny access despite scope selection. A generic 403 reports Permission Missing and lists required scopes to review, rather than pretending the missing scope is known precisely.

The configured portal ID must be the token's intended HubSpot account. Record links are canonical HubSpot URLs constructed from this explicitly configured portal ID and actual record ID (the CRM object endpoint supplies no original UI URL). No source URL from another portal is invented or followed.

### Outreach

Use a registered **OAuth 2.0 authorization-code developer application**, authorized by the intended Outreach user, then its rotating refresh token. Personal passwords, HubSpot tokens and guessed API keys are unsupported.

Request only these current scope identifiers:

- `prospects.read`
- `accounts.read`
- `mailings.read`
- `sequenceStates.read`

Current identifiers come from Outreach's official extensibility SDK `Scopes.ts`; archived SDK examples using `read_prospects` are obsolete. The connected user must have API entitlement and visibility of relevant accounts, prospects, mailings and sequence states. Minimum scopes do not establish organization-wide retention or suppression coverage. No write, delete, send, enrollment, `all.*`, user-management or mailbox-write scopes are requested.

Authorization endpoint: `https://api.outreach.io/oauth/authorize`; token/refresh endpoint: `https://api.outreach.io/oauth/token`; resource base: `https://api.outreach.io/api/v2/`.

An administrator performs the initial authorization using the developer app's registered HTTPS redirect URI, `response_type=code`, the four space-separated read scopes and a cryptographically random state verified by their authorized callback. Exchange the single-use code server-side using `grant_type=authorization_code`, client ID, client secret and that exact redirect URI. Store the returned refresh token only in Preview's encrypted server configuration. Do not paste tokens into chat, browser storage, URLs, issue comments or logs. Use the same redirect URI for refresh requests. Provisioning and exact tenant entitlement must be confirmed by the administrator against current Outreach documentation.

## Environment variables (names only)

Existing database/auth settings remain: `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or existing legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`), `NEXT_PUBLIC_APP_URL`.

HubSpot: `HUBSPOT_PRIVATE_APP_TOKEN`, `HUBSPOT_PORTAL_ID`, `HUBSPOT_SYNC_START_AT`, `HUBSPOT_COMPANY_REVENUE_CURRENCY`; optional `HUBSPOT_OUTREACH_ID_PROPERTY`.

Operator binding: `INTEGRATION_OPERATOR_USER_ID` (Gil's existing application `User.id`; required before sync actions, so other signed-in application users cannot consume his rotating bootstrap grant).

Outreach: `OUTREACH_CLIENT_ID`, `OUTREACH_CLIENT_SECRET`, `OUTREACH_REDIRECT_URI`, `OUTREACH_REFRESH_TOKEN`, `INTEGRATION_ENCRYPTION_KEY`.

Optional background scheduler: `INTEGRATION_WORKER_SECRET`.

`HUBSPOT_SYNC_START_AT` is an explicit timezone-qualified UTC rollout cutoff, not an inference from lastmodifieddate. `HUBSPOT_COMPANY_REVENUE_CURRENCY=USD` is valid only after confirming the CRM revenue property uses USD. Missing currency does not create a revenue qualification pass. The optional mapping property must already contain genuine Outreach prospect IDs; this integration never creates or edits the property or email addresses.

`INTEGRATION_ENCRYPTION_KEY` must decode to exactly 32 bytes from base64. OAuth credentials are AES-256-GCM encrypted with actor-bound authenticated context; keep a secure independent backup of the key and database. The latest refresh grant is stored encrypted in `IntegrationState.secret`. Changing the encryption key or deleting the state loses access to a rotated grant and requires reauthorization. Refresh calls are serialized, and a failed/possibly consumed refresh request is not automatically retried.

## Synchronization and recovery

Apply the reviewed `20261016000000_read_only_integration_sync` migration **only to the authorized Preview database** before connection testing. No migration is applied by API requests or this implementation task. Two actor-scoped tables store durable jobs, leases, encrypted credentials and safe audit events; RLS is enabled without public policies. Prisma needs the existing trusted server database role, not a browser/anonymous role.

Initial HubSpot discovery pages by numeric object ID, avoiding the search API's 10,000-offset ceiling. `lastmodifieddate` only discovers candidate changes; current owner must be exactly `1087915602`, and admission requires actual creation or owner-assignment property/history evidence after the configured rollout cutoff. Incremental jobs use a fixed upper watermark and five-minute overlap. The next watermark is committed only after every selected contact and previously imported contact has been refreshed. Rechecking existing records also catches ownership changes and deal/activity changes which do not touch contact modification time. Unauthorized records are invalidated for review, not silently retained as READY or deleted.

Companies, contact/company deals and logged email associations are paginated independently; conflicting/unknown deal-stage closedness blocks clearance. Company choice requires a unique primary association or unique company. Revenue has no automatic currency conversion. Logged sent emails contribute to the latest reliable outbound timestamp across HubSpot and Outreach. The qualification engine retains its clamped **four-calendar-month** rule.

Outreach imports historical mailings and sequence states only for unambiguously matched current prospects. It reads matched accounts, explicit opt-out flags, sent timestamps and available bounce/spam markers. Paused/active/pending sequences block. Unrecognized states, inaccessible resources, missing matching or partial pages cannot clear eligibility. No email bodies are stored. Resource IDs and activity timestamps are retained as evidence references; the full raw provider response is not stored or exposed.

One request key identifies a generation of a job. Concurrent requests join an existing active job. Worker leases prevent overlapping execution, and per-contact receipts make a crash between an evidence write and job checkpoint replay idempotent. Each completed contact is checkpointed. HTTP 429 and 5xx receive bounded backoff, respecting Retry-After; longer rate limits defer work. Authentication/permission errors are not retried blindly. Failed units retain their pending contact/cursor; automatic attempts are bounded to three. Manual Resume rechecks access and resets the attempt budget. A failed or partial job never advances last-successful-sync.

A worker slice drains at most eight units / about 20 seconds of new work via Next.js `after`, with a 120-second function limit. Each provider unit has a bounded request budget. Very large per-contact histories (over 30 Outreach pages or 20 HubSpot association pages), a changing page cursor or an exhausted budget fail explicitly without completeness. **Sub-contact pagination checkpoints are not implemented yet**, so large records may require that extension before they can finish; no truncation is called complete.

For browser-independent continuation, configure an authorized external scheduler to POST `/api/sales-agent/integrations/worker` on the Preview deployment every minute with `Authorization: Bearer <INTEGRATION_WORKER_SECRET>` and JSON `{ "actorId": "<Gil's application User.id>", "provider": "HUBSPOT" }`, then OUTREACH separately. This endpoint only drains existing jobs; it does not silently start new sync windows. Start each daily incremental job from authenticated Integration Health. A recurring job-start scheduler is not installed by this change. Alternatively use Resume sync for additional slices. Do not install a Production Vercel Cron or call Production endpoints. Deployment protection must permit the authorized scheduler; no bypass token belongs in application responses.

## Monday, October 19 connection checklist

1. Select the new feature Preview; confirm its PostgreSQL database is isolated from Production. Apply the reviewed migration with the existing Prisma deployment process. Keep all existing Supabase Google sign-in configuration and authorized-user restrictions.
2. HubSpot administrator: provision/repair the Private App token with the four read scopes, confirm the intended portal ID and USD revenue semantics, and decide the explicit rollout cutoff. If an existing genuine Outreach-ID property exists, record its internal name. Do not edit contacts to create matches.
3. Outreach administrator: register/authorize the OAuth application with the four read scopes and sufficient user visibility. Complete the authorization-code exchange through an authorized server-side callback, retaining refresh token and exact registered redirect URI. Confirm available history retention and bounce/complaint/opt-out visibility; those capabilities remain HOLD until authoritative evidence is integrated.
4. Set the named **Preview-only** server variables through Vercel's secure configuration, including an independently generated 32-byte base64 encryption key and Gil's application User.id in `INTEGRATION_OPERATOR_USER_ID`. Redeploy the same feature branch Preview. Do not reuse a bootstrap rotating token in another application user or database.
5. Allow the execution environment to reach the two API hosts, or run validation on Vercel Preview, which has its own outbound network. Sign in as Gil and use each provider's **Check access**. A 401 means token/grant repair; 403 requires scope/role/entitlement review. Connected requires all real read probes to succeed.
6. Start initial HubSpot sync. Resume/worker-drain until COMPLETED. Check actual imported record IDs, owner and creation/assignment sources, company associations, deals and latest logged outbound timestamps. No partial job may display a successful sync timestamp.
7. Start Outreach sync on those imported contacts. Review explicit ID matches; verify business email independently before enabling email fallback. Inspect ambiguity/missing history blocks, actual sent timestamps, active sequences and suppression markers. Synchronization can complete while eligibility correctly remains HOLD.
8. Configure the optional Preview worker scheduler or continue manual resumptions. Start subsequent incremental windows explicitly and inspect audit events/last-success timestamps. Validate one real account through research only after its evidence is reviewed; no sending or enrollment action exists here.

## Provider contract references

- HubSpot official API specs: `https://github.com/HubSpot/HubSpot-public-api-spec-collection/tree/main/PublicApiSpecs/CRM` (including Emails v3 scope definitions).
- Outreach official current scope enum: `https://github.com/getoutreach/extensibility-sdk/blob/main/src/manifest/api/Scopes.ts`.
- Outreach current developer documentation: `https://developers.outreach.io/`.
- Maintained API schema cross-check: `https://github.com/airbytehq/airbyte/blob/master/airbyte-integrations/connectors/source-outreach/manifest.yaml`.

Live API conformance and tenant permissions remain unverified until the administrator supplies authorized credentials and the real probes succeed.
