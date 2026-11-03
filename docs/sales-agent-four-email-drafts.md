# Sales Agent four-email review slice

Built on `recovery/four-email-engine`, starting at `12c31f6`. This extends the existing Next.js Sales Agent; it does not replace Build Sequence, authentication, qualification, or provider adapters.

## Audit and delivered behavior

| Module                              | Existing behavior                                                                                                                                                           | Change / remaining boundary                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `qualification.ts`                  | Owner, size/revenue, senior paid-search remit, independent employment/email, suppression, sequence/opportunity, complete history and four-calendar-month reengagement gates | Unchanged. Missing evidence remains HOLD; suppression remains REJECTED.                                                                                                                                                                                                                                                                                         |
| `evidence.ts`                       | Provider/value validation, identity binding, independent verification, freshness, conflict detection and provenance                                                         | Unchanged. Human research is a separate contract and cannot certify these fields.                                                                                                                                                                                                                                                                               |
| `orchestrator.ts`                   | Ordered qualification/research/SERP/draft/review task descriptions; no execution                                                                                            | Unchanged planner. New pure `draft-engine.ts` actually produces four drafts in the evidence review service.                                                                                                                                                                                                                                                     |
| `sales-agent-collection-service.ts` | Owner-scoped read-only collection, local suppression, persistent snapshots, actor-scoped daily review and expiry rechecks                                                   | Daily review now derives drafts and research findings from each saved snapshot using the current clock. No new HubSpot calls.                                                                                                                                                                                                                                   |
| `evidence-review-client.tsx`        | Decision filtering, reasons, tasks, evidence provenance, cursor collection and explicit errors                                                                              | Adds four-email review, per-email copying, manual research and explicit fictional mode. Authentication and intake controls remain.                                                                                                                                                                                                                              |
| `evidence-store.ts`                 | Existing actor-scoped Prospect/ProspectSource append-only JSON snapshots                                                                                                    | Optional research in the same versioned snapshot, no migration. Research edits share collection's advisory lock, read the latest snapshot inside it and retain its qualification evidence. Same-company recollection retains research; a company change drops it. Inserts use `clock_timestamp()` so waiting transactions do not sort before earlier snapshots. |

The drafting engine is deterministic and needs no model subscription, background worker, new database, or infrastructure. It uses exact reviewed source wording instead of generating untraceable company claims. Existing Build Sequence and approved-knowledge workflows remain available and unchanged; this slice reuses the existing proof eligibility policy and verifies exact case-study wording against the real approved library, without fixture fallback.

## Draft contract

A qualified contact receives four review drafts, with suggested days 1, 4, 9 and 15 (no scheduling):

1. Verified company business fact and verified person responsibility, followed by branded-search monitoring relevance.
2. One manually reviewed Google SERP screenshot, its branded keyword, market, device, observation date and source. The snapshot cannot establish ongoing competitor activity or waste.
3. Bidding decisions plus an explicitly approved, source-linked customer example. Only the exact library-approved external wording is included, including any approved metric. A linked approved source and an explicit cold-email-compatible usage scope are required. No fallback savings claim.
4. Short, low-pressure close.

All share the first subject and subsequent steps are marked replies to the first email. Every generated email has a distinct angle and low-friction CTA. Factual source references are shown separately from email wording. Missing research creates explicit `REQUIRES_RESEARCH` placeholders (displayed as HOLD), with copying disabled for that step. Qualification HOLD/REJECTED blocks the entire drafting operation. READY means qualification passed, not that every draft is complete or approved.

`canSend`, `canEnroll` and `approved` are always false. Human approval is required but this slice does not record approval or integrate with sending/enrollment. Copying is for review, includes an unapproved-draft label, and is not approval. Fictional copies additionally include a prominent test-data warning. No HubSpot/Outreach mutation client is called.

## Manual research and provenance

`POST /api/sales-agent/research` requires the existing authenticated application user and an exact same-origin Origin header. It accepts only the strict research schema (8 KB request limit); actor identity comes from the session. It cannot accept qualification, provider clearances or send/enroll controls. It updates an existing actor-scoped contact only and refuses fictional IDs and mismatched company domains.

Use the expandable form on a saved prospect to enter one email-ready observation per research kind: company fact, person fact, Google SERP, approved case study. The normal form updates a stable contact/kind entry. URLs must be HTTPS without embedded credentials. The reviewer attests to checking the source and, for customer proof, approval of the exact outbound wording and metrics. The server timestamps this human attestation; it does not independently inspect source claims or image contents. For case studies, it also verifies the supplied library ID, exact approved external wording, approved linked source URL, approval status and usage restrictions using the existing proof policy. A checkbox alone cannot approve a customer claim. Library approval is rechecked on every saved review; revocation or unavailable proof holds email 3. No URL is fetched and no image interpretation is performed.

Research must match the contact ID and current company domain. Observations require an explicit timezone, a real calendar date, observation <= human verification <= current time, and age <= 30 days. Conflicting current wording for a kind requires resolution; the engine does not pick a convenient fact. Only matching-contact evidence is returned in draft findings. Expiry is rechecked from original timestamps on refresh. Qualification evidence has its separate existing provider-verification policy. Manual notes cannot lift recent-contact, suppression or unknown-history restrictions.

Case-study selection is manual for this slice: choose the approved example most relevant to the contact's industry, remit and pain point. Automatic research, live enrichment adapters, automatic proof ranking and audited approval persistence are not implemented here. Do not interpret the fictional case-study example as approved real customer proof.

## Fictional review without HubSpot

Sign in, open `/sales-agent`, and choose **Explore five fictional test prospects**. `/api/sales-agent/demo` uses the same qualification, normalization and drafting code with a clearly disclosed fixed simulated clock (`2026-10-15T12:00:00.000Z`). After the existing authentication/profile lookup, fixture generation makes no provider or prospect-storage calls and does not save fixtures.

| Fictional scenario                             | Qualification | Drafts                    |
| ---------------------------------------------- | ------------- | ------------------------- |
| Complete source-backed evidence                | READY         | Four pending human review |
| Office administrator                           | REJECTED      | Blocked                   |
| Missing revenue and independent email evidence | HOLD          | Blocked                   |
| Outbound five days earlier                     | HOLD          | Blocked                   |
| Unsubscribed                                   | REJECTED      | Blocked                   |

Every fixture uses a `test-fixture-` identity, a reserved `.example` domain and explicit fictional provenance. Live collection never imports fixtures, live errors never fall back to them, and returning to saved contacts clears fictional results. Collection buttons and manual persistence are disabled/absent in fictional mode. Stale asynchronous responses cannot cross these modes.

## Validation and review

Final validation: Prisma generation exited successfully; TypeScript and repository-wide ESLint passed without errors or warnings; Vitest passed **666 tests**, with **0 failed** and **1 skipped** across 68 files; the production build completed successfully. The skipped test is the existing `TEST_DATABASE_URL`-gated Prisma integration harness, not a verified live database test. The 162-test focused drafting/qualification/API suite also passed before final validation. Commands use the installed project tools, equivalent to the scripts in `package.json`:

```sh
node node_modules/prisma/build/index.js generate
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js .
node node_modules/vitest/vitest.mjs run
node node_modules/next/dist/bin/next build
```

The initial full suite had 607 passed, 1 failed and 1 skipped. The failure was an outdated auth-callback expectation of `/` while the existing implementation intentionally defaults to `/sales-agent`; only the assertion changed. Existing auth URL test objects also needed `NODE_ENV: "test"` to satisfy the installed Next.js environment type. These are test-only fixes, not changes to environment settings or authentication behavior.

For Vercel Preview, push this branch or open a PR from it using the repository's normal review workflow, then open that commit's Preview deployment link in GitHub/Vercel. No deployment has been initiated by this work. Use the existing approved Google login and `/sales-agent`; choose fictional mode to exercise all five scenarios without HubSpot. Check the READY contact's four drafts, evidence links, copy warning, and the four blocked contacts' reasons. Check a narrow viewport and return to saved contacts to confirm separation. Do not promote the Preview to Production.

Live HubSpot collection remains blocked by the reported HTTP 401 until the administrator supplies a valid Private App token with the existing read scopes. No credentials or environment settings have been changed. Independent verification and Outreach/history adapters also remain disconnected, so HubSpot field presence alone must not produce READY. Existing Supabase/application-user and PostgreSQL configuration are needed for live authenticated persisted review; the fictional endpoint still requires the existing Supabase/application-user sign-in and profile lookup, but no HubSpot or prospect-evidence database operations. A real authenticated browser smoke test and database transaction concurrency validation require those configured services and have not been established by mocked tests.

## Changed repository files

24 application, test and documentation files:

```text
docs/sales-agent-evidence-collection.md
docs/sales-agent-four-email-drafts.md
src/app/api/sales-agent/demo/route.test.ts
src/app/api/sales-agent/demo/route.ts
src/app/api/sales-agent/research/route.test.ts
src/app/api/sales-agent/research/route.ts
src/app/auth/callback/route.test.ts
src/features/sales-agent/demo-fixtures.ts
src/features/sales-agent/draft-engine.test.ts
src/features/sales-agent/draft-engine.ts
src/features/sales-agent/draft-review.test.tsx
src/features/sales-agent/draft-review.tsx
src/features/sales-agent/evidence-review-client.test.tsx
src/features/sales-agent/evidence-review-client.tsx
src/lib/auth/env.test.ts
src/server/sales-agent/approved-draft-proof.test.ts
src/server/sales-agent/approved-draft-proof.ts
src/server/sales-agent/evidence-store.test.ts
src/server/sales-agent/evidence-store.ts
src/server/services/sales-agent-collection-service.test.ts
src/server/services/sales-agent-collection-service.ts
src/server/services/sales-agent-research-service.test.ts
src/server/services/sales-agent-research-service.ts
src/test/sales-agent-collection-fixtures.ts
```
