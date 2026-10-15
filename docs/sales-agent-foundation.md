# Signal Sales Copilot foundation

The feature branch provides deterministic qualification and ordered planning through
`POST /api/sales-agent/plan`. Use the existing Supabase sign-in and application user
profile (sales user or knowledge admin). This API follows the existing sequence API's
session authentication; middleware can redirect unauthenticated requests to login.
The handler itself returns 401 when no application user is resolved.

Submit JSON using an authenticated same-origin session, for example from the
application's browser console:

```js
const result = await fetch("/api/sales-agent/plan", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ hubspotRecordId: "actual-hubspot-contact-id" }),
}).then((response) => response.json());
```

That deliberately incomplete input returns HOLD with the missing requirements and
ordered verification tasks. It does not fabricate verification. A complete request
has this shape; the sample below describes fields, not real verified evidence:

```ts
{
  hubspotRecordId: string,
  hubspotOwnerId: '1087915602',
  employeeCount: Evidence<number>, // >= 80
  annualRevenueUsd: Evidence<number>, // >= 30,000,000 USD
  role: Evidence<string>,
  paidSearchResponsibility?: Evidence<'PROVEN' | 'ABSENT' | 'UNKNOWN'>,
  currentEmploymentVerified: Evidence<true>,
  employmentIndependentlyVerified: true,
  emailVerification: Evidence<{
    status: 'VALID',
    independentlyVerified: true,
    emailMatchesCurrentRecord: true,
    businessEmailVerified: true
  }>,
  lastOutboundAt: Evidence<string | null>,
  outreachHistoryComplete: true,
  eligibilityEvidence: Evidence<true>,
  unsubscribed: false,
  hardBounced: false,
  complained: false,
  activeSequence: false,
  conflictingActiveOpportunity: false
}
```

`Evidence<T>` is `{ value: T, source: string, verifiedAt: string }`. Supply actual
source provenance and timezone-qualified ISO timestamps. `lastOutboundAt.value`
is the timestamp of the last sent outbound email, or null only when complete
Outreach history establishes there was none. Its `verifiedAt` records when the
history was checked, not when the email was sent. `eligibilityEvidence` attests to
fresh checks of suppression, sequence, opportunity, owner and history fields.
The employment attestation must be independent; email evidence must independently
verify the current record's business address. A Boring status alone never qualifies.
Do not set these fields merely because an enrichment import supplied a green label.

All timestamped evidence expires after 30 days, a conservative foundation policy.
Unknown, invalid, future or expired timestamps cause HOLD. Calendar-month windows
use UTC anniversary arithmetic, preserving time and clamping to the target month's
last day (May 31 + four months = September 30). Four months must have fully elapsed.
Junior or ambiguous titles cannot be upgraded using a search-ownership flag;
senior Growth/Performance leaders require fresh proven search ownership.

The response wraps the plan in `{ ok: true, data: ... }`. `data.decision` contains
READY/HOLD/REJECTED, reasons and missing requirements. `data.evidence` retains the
submitted source/value/timestamp context for review. Tasks are ordered: verification
for HOLD; company/person research, manual SERP evidence, four-email drafting and
human review for READY; no outbound tasks for REJECTED. READY authorizes planning
only. Human approval is always required and never granted by this endpoint.
`canSend` is always false. Invalid types or unknown control fields return 400;
oversized bodies return 413; internal errors return a generic 500. Responses are
not cached and evidence is not logged or persisted here.

## What is connected

The route uses real application-user authentication and the real validation,
qualification and planner services. Planning does not require external calls or a
schema migration. API integration tests mock authentication only, then execute the
real service and qualification flow; they do not establish a live Supabase login.

Reusable infrastructure inspected: Prisma Prospect/ProspectSource/ProspectFact for
source-backed intake; AccountAssessment and account/company/person research
services; approved-knowledge-service and proof policy for approved claims;
GeneratedDraft/DraftVersion and review services for drafts and approvals;
InteractionOutcome for later learning; suppression records and provider audit runs.
None is bypassed or duplicated with a new schema in this milestone.

## Still disconnected and next milestone

Evidence is caller-supplied, not independently collected or certified by this API.
No background worker dispatches tasks, research is not automatically executed,
SERP evidence is manual, and four emails are planned rather than generated here.
There are no Outreach/HubSpot mutations, enrollment, sends, approval writes or
outcome-learning updates. Existing HubSpot push functionality is not invoked.

Next: add read-only evidence adapters for HubSpot/Outreach and existing suppression
records, binding facts to a persisted prospect and source IDs. Require fresh actual
employment/email verification and preserve provider audit provenance. Then execute
research and approved-knowledge-backed drafting with durable human review. Keep
enrollment disabled until fresh eligibility and an explicit audited approval gate
are implemented.

## Validation

```sh
./node_modules/.bin/vitest run src/features/sales-agent src/server/services/sales-agent-service.test.ts src/app/api/sales-agent/plan/route.test.ts --maxWorkers=2 --minWorkers=1
./node_modules/.bin/tsc --noEmit --incremental false
./node_modules/.bin/eslint .
./node_modules/.bin/next build
```

Live authenticated validation requires configured Supabase Auth and an application
user in PostgreSQL. Never invent credentials or treat mocked authentication as a
live sign-in check.

Current cloud validation: 77 qualification/planner/service/API tests and 9 existing
authentication/middleware tests passed (86 total). TypeScript and repository-wide
ESLint passed. The production build compiled and type-checked, then failed during
page-data collection because `.prisma/client/default` was absent. Prisma generation
was blocked by the egress proxy: `CONNECT tunnel failed, response 403` for
`binaries.prisma.sh` (including the checksum URL). An additional existing service
boundary suite could not collect for the same missing Prisma client; its tests did
not execute. TLS and checksum verification remain enabled. A draft network addition
for that hostname was saved, but is not applied or published. Supabase and database
settings are absent in this machine, so live authenticated validation is pending.
