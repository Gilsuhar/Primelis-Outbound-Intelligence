# Read-only evidence collection

Milestone 2 adds `/sales-agent` (Agent Daily Review in sales navigation) and an
authenticated `GET` / `POST /api/sales-agent/evidence`. It does not send messages,
enroll sequences, mutate CRM contacts or call a paid enrichment service.

## Use

Sign in using the existing Supabase/application-user flow. Open Agent Daily
Review, then select **Read HubSpot evidence**. The server reads one page of up to
100 contacts belonging to owner `1087915602`. **Collect next page** continues the
owner-scoped search. **Retry last page** repeats the previous cursor. Partial
results and failures are explicit; the UI does not imply that unread pages were
collected. Collection is on demand, not a scheduled background job.

The review displays READY, HOLD and REJECTED counts, filters, reasons, missing
requirements, ordered verification/research tasks and expandable provenance. READY
means ready for research and draft preparation, not approval to contact. The
[four-email review slice](sales-agent-four-email-drafts.md) adds actual drafts and
explicit fictional review without changing collection or qualification gates. Human approval remains ungranted. Existing
saved evidence is re-evaluated on each refresh; refreshing never extends an old
verification timestamp. Current local suppression records are also checked during
review. All API responses use `Cache-Control: no-store`.

`POST /api/sales-agent/evidence` accepts `{}` or `{ "after": "100" }`. Owner, actor,
provider and evidence overrides are rejected. Actor identity comes from the
application session, and cross-origin browser collection is rejected. `GET` loads
only that actor's saved review. Missing configuration returns an explicit error,
never fabricated or demo evidence.

## What is implemented versus connected

| Adapter                               | Implementation                                                                                                                                                               | Current cloud validation                                                 |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| HubSpot                               | Production read-only contact search, contact/email history and primary-company reads; fixed owner filter and defensive owner recheck; ID deduplication and cursor pagination | Fixture HTTP tests pass; no live token configured                        |
| Local suppression                     | Reads existing Prisma suppression records and merges the existing default suppression policy; exact domain/name matching                                                     | Fixture and persistence-boundary tests pass; no live database configured |
| ZoomInfo                              | Typed provider interface and timestamp/proof/identity-aware normalization                                                                                                    | Fixture only; no live connector or subscription added                    |
| Similarweb                            | Typed provider interface and company evidence normalization                                                                                                                  | Fixture only; no live connector or subscription added                    |
| Outreach                              | Typed provider interface and history/sequence gate                                                                                                                           | Fixture only; no live history connector; missing history always HOLD     |
| Independent employment/email verifier | Typed provider interface, current-company/email binding and email-edit checks                                                                                                | Fixture only; no paid service configured                                 |
| Boring / Surfe                        | Recognized observation provenance; neither can independently certify email                                                                                                   | No new live connector; green alone cannot qualify                        |

The collector reuses the existing HubSpot private-app binding, host and timeout
configuration. Its transport exposes only GETs and the read-only contacts/search
POST; it has no mutation methods, follows no redirects, and redacts provider
response bodies from errors. It does not instantiate the existing HubSpot push
client or call its write methods. HubSpot credentials need only
`crm.objects.contacts.read` and `crm.objects.companies.read` scopes for these reads;
portal-specific access restrictions may require an administrator to grant access.

## Evidence contract and storage

Server-registered `ProspectEvidenceAdapter`s return observations for a specific
HubSpot record. Every observation carries:

- field and raw typed value;
- provider and source record ID, with an optional source URL;
- observed timestamp and explicit verification timestamp (nullable);
- supporting evidence references and independent-verification attestation;
- current email/company identity binding where relevant.

The service stores complete versioned JSON snapshots in existing
`ProspectSource.rawContent` records with `ACCOUNT_RESEARCH` source type and
`signal-evidence-v1:<HubSpot ID>` labels. Sources belong to user-scoped Prospect
records. Each refresh appends a snapshot rather than erasing prior provenance;
review selects the latest per HubSpot ID. A transaction and per-user advisory lock
prevent concurrent collection from creating duplicate agent prospects. No schema
migration is needed. Each snapshot also records expiry, freshness, acceptance and
explanation **as assessed at collection**. Review recalculates freshness from the
original timestamps, rather than trusting that saved assessment indefinitely.

Freshness uses the foundation's 30-day verification policy. Unknown, invalid,
future and expired verification cannot clear a requirement. Different fresh
source-backed values conflict; recent contradictory CRM observations also require
resolution. Positive suppression/sequence/opportunity flags cannot be erased by
negative assertions; existing account suppression blocks remain reviewable with
their actual source IDs and reasons. Unknown revenue currency is retained as
unknown and cannot be treated as USD.

HubSpot field presence is an observation, **not independent verification**. The
intake deliberately leaves `verifiedAt: null` for raw company/title/suppression
fields. Directly observed positive unsubscribe/hard-bounce flags block outreach;
false or absent fields do not certify full suppression clearance. Company size,
revenue and job title remain traceable but must gain supported verification before
qualifying. Employment and business email require independent ZoomInfo or verifier
observations with supporting evidence. Do not map CRM green labels into these
attestations.

ZoomInfo email validation is usable only with a fresh original verification time,
supporting evidence, exact current-email binding and a verification no earlier than
the latest HubSpot email edit. Surfe/manual edits therefore require revalidation,
even if the email text is unchanged. Unknown edit history remains HOLD. Employment
proof must bind to the current company domain. Native portal-specific ZoomInfo
custom fields are not guessed or automatically trusted; a future adapter must
retrieve and validate their original provenance through authorized access.

Only Outreach observations can establish complete Outreach history, active-sequence
clearance and the last outbound timestamp. HubSpot last activity is never substituted
for an outbound email date. There are no invented dates, live SERP observations,
approval writes, CRM updates or auto-enrollment paths.

## Configuration and validation

Use secure environment settings for the existing `HUBSPOT_PRIVATE_APP_TOKEN` and
PostgreSQL/Supabase settings from `.env.example`. The API destination is
`api.hubapi.com`. Set optional `HUBSPOT_COMPANY_REVENUE_CURRENCY=USD` only after
confirming how the portal's company annual-revenue field is denominated; no currency
conversion or default USD assumption is made. Do not paste credentials in chat.

The cloud has no configured HubSpot, database or Supabase credentials. A draft
HubSpot secret requirement and `api.hubapi.com` network addition were saved,
preserving the prior `binaries.prisma.sh` addition. These are not applied or
published. Review/save the settings and publish when prepared; no secret values
were supplied by the agent.

Run the focused checks using the installed project tools:

```sh
./node_modules/.bin/vitest run src/features/sales-agent src/server/sales-agent src/server/services/sales-agent-service.test.ts src/server/services/sales-agent-collection-service.test.ts src/app/api/sales-agent src/lib/auth src/lib/supabase/middleware.test.ts src/lib/navigation.test.ts src/lib/private-preview-auth.test.ts src/components/app-shell.test.tsx --maxWorkers=2 --minWorkers=1
./node_modules/.bin/tsc --noEmit --incremental false
./node_modules/.bin/eslint .
./node_modules/.bin/next build
```

The selected validation run passed **167 tests across 16 suites**, including 67 new
Milestone 2 tests. TypeScript and repository-wide ESLint passed.

Tests exercise real normalization/qualification/planning behind fixture HTTP,
authentication and persistence boundaries; they do not establish a live Supabase
login, real PostgreSQL transaction execution or live HubSpot access. The production
build compiled successfully and passed its type/lint stage, then failed at page-data
collection because `.prisma/client/default` is missing. Prisma generation remains
blocked by the proxy's 403 for the verified download from `binaries.prisma.sh`.
Verification has not been disabled. No unrelated legacy tests were modified.

## Next milestone

Configure the read-only HubSpot token and database, generate Prisma with verified
artifacts, and perform a signed-in collection/review smoke test. Then connect
read-only Outreach and authorized independent employment/email evidence through
the provider interface. Retain source-record links and original verification times,
keep any missing scope/history on HOLD, and require a fresh owner/eligibility recheck
before a future approval/enrollment milestone. Sending and enrollment stay disabled.
