# Overnight sprint delivery — 3 November 2026

Local branch: `codex/cloud-release-candidate-20261102-192938`.
Baseline: `e89a5cd864b47ba761dbbaf66da4b5cf87231b46`.
No push, deployment, provisioning, cloud configuration, remote migration, credential transfer,
live CRM/OAuth operation, outbound action or paid research/model call was performed.

## Implemented and committed

| Commit | Area |
| --- | --- |
| c9428bf08a6c058a25eaed16e7233eea2a3898db | Fresh isolated Preview setup tool, least-privilege role SQL and branch configuration matrix |
| a16929980ef9a88934e44a0b5fdb87ce4655c073 | Dedicated-project session checks, valid application roles, exact Preview origins and prepared test-user binding |
| cde0ec164bd12da66fa84f9ad8facb5db9f7ca45 | Mandatory Recycler qualification composition, evidence-rich review and CSV |
| 8fc91226ca58391ced9a3df84918512aeb3cf15a | Grounded draft scope, focused CTA and editorial/outbound-permission checks |
| ae4bded80e96cf90c4118244618f532d3950700f | Authenticated local cron rehearsal using existing daily leases/checkpoints |
| e49035093aa74d496746eb7b37aade66795c283c | Unrelated negative receipts remain identity HOLD; duplicate-ID and UI-filter regressions |

This handoff and an EOF-whitespace correction are recorded in a final documentation commit.
30 files changed across the sprint, including this report. No dependency, Prisma schema/migration,
build hook, package script, cloud configuration or live schedule changes.

## Files by subsystem

- Setup: `scripts/preview/{setup.mjs,setup.d.mts,runtime-role.sql,bind-test-user.sql}`;
  `src/server/preview-setup.test.ts`; `docs/preview-initialization.md` and `preview-authentication.md`.
- Auth: `src/lib/auth/server.ts`, `preview-session.test.ts`.
- Recycler: `src/features/prospect-recycler/{contracts.ts,qualification.ts,qualification.test.ts,
  review.ts,review-client.tsx,review-client.test.tsx}`;
  `src/server/prospect-recycler/{pipeline.ts,types.ts,review.ts,review.test.ts,qualified-review.test.ts}`;
  `src/test/recycler-qualified.ts`; `docs/recycler-complete-qualification.md`.
- Drafting: `src/server/agent-workforce/commercial-quality.ts`;
  `signal-opportunity/{drafting.ts,drafting.test.ts}`; `docs/drafting-cloud-preparation.md`.
- Scheduling: `src/server/agent-workforce/daily/{cron-adapter.ts,cron-adapter.test.ts}`;
  `docs/cron-preparation.md`.

## Actual validation

| Check | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Complete serial Vitest, one worker | 2,663 | 0 | 18 |
| Complete parallel Vitest, four workers | 2,663 | 0 | 18 |
| Focused setup/auth/Recycler/daily | 412 | 0 | 0 |
| Focused research/drafting | 115 | 0 | 0 |
| Focused Preview security/auth | 184 | 0 | 0 |
| Separate Node publication-tool tests | 57 | 0 | 0 |

Full Vitest: 195 files passed, one file skipped, 196 total. 115 passing tests were added relative to
baseline. Existing skips: ten optional browser OAuth checks, five isolated PostgreSQL checks, two
opt-in external public-source diagnostics, and one absent private local helper check. No tests were
disabled or assertions weakened. The old positive Top 50 fixture gained mandatory ownership/company/
role/opportunity evidence; its suppression assertions remain intact.

TypeScript, ESLint, Next.js production build and Prisma schema validation passed. Build includes
`/sales-agent/recycler`. Validation used existing pnpm 9.12.0/Node 24, scrubbed credential environment,
mocked providers and the offline network guard. SQL initialization/role scripts were not executed on
a database. Existing React act warnings are non-failing and do not establish browser/cloud testing.

Secret scan: all publication files and new commit diffs scanned with gitleaks 8.30.1, redacted output.
No confirmed secrets. Full-file scan has five reviewed, unchanged baseline false positives: two
documentation phrases and three synthetic idempotency/request-key literals. New implementation
commit scan has zero findings. No new rule suppressions or broad allowlists were introduced.
All changed paths are intentional and none match .gitignore.

Preservation: all 722 original archived file SHA-256 hashes match; original feature-branch HEAD is
unchanged; recovery source archive and history bundle remain present. Only the isolated release
candidate received commits.

## Readiness and limits

**Cloud foundation:** reproducible initialization is prepared for a newly approved project, with
explicit identity/endpoint/TLS checks, no production fallback, ordered existing eleven migrations
and sanitized errors. Runtime role starts NOLOGIN and can receive only five profile columns through
row-specific approved-user RLS. Actual grants, TLS, schema, Auth and resource isolation remain
unverified until separately approved setup. Direct setup needs IPv6-capable operator connectivity.

**Recycler:** the server pipeline enforces owner 1087915602, one HubSpot identity, both company
thresholds, explicit senior Search responsibility, current employment and independent email
verification, complete four-calendar-month coverage, suppression/sequence and opportunity clearance.
Unknown or stale evidence is HOLD; known suppression is EXCLUDED. Outreach-only candidates remain
reviewable but not eligible without HubSpot ownership. Delivery remains DELIVERED, not invented sentAt.
The UI retains five fictional candidates without fabricated positive verification; search/filter,
timestamps, company/role evidence, CSV and draft-readiness explanations are locally tested.
Live authoritative qualification/history/opportunity/verification producers are still missing.
Daily real Top 50 automation is not complete and no real prospect was newly marked eligible.

**Agents:** existing research and drafting workflows remain. Missing Similarweb is explicit, copy
must match brand/query evidence, unsupported guarantees and automatic offers/links trigger review,
and draft generation never authorizes sending. Mocked quality checks do not prove live model quality.
Paid execution remains denied in Preview. The scheduler adapter is a local-only rehearsal; no hosted
GET route or cron exists. Existing leases/budgets were exercised with mocks, not a live database.

**Behavioral risks:** stricter Recycler gates intentionally increase HOLD counts until trusted
receipts exist. New editorial rules may require revision of previously accepted copy. The restricted
database role supports synthetic Recycler/profile reads only; unrelated data-backed pages may remain
unavailable. Prepared SQL must never be applied to legacy/Production projects. Revert individual
local sprint commits if needed while retaining the baseline Preview safety patch; no cloud rollback
is required because no cloud mutation occurred.

## Approval gates and exact next action

Next: approve creation of the dedicated **agent-workforce-preview** Supabase project, preferably
us-east-1, after verifying organization ownership and Free-plan quota. Do not reuse either legacy
project. Do not create or upgrade paid infrastructure automatically.

Subsequent separate gates: approve isolated schema/role initialization and approved test-user setup;
verify actual privileges and Auth boundaries; configure exact branch-scoped credentials and redirects;
neutralize inherited provider/production bindings; verify Deployment Protection; then separately
approve GitHub publication and a protected Preview deployment. Live integrations, paid research,
worker execution and any outbound operation require later explicit approval. No action above is
implicitly authorized by this handoff.
