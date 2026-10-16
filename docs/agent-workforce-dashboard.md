# Agent Workforce operational dashboard

Branch: `feature/agent-workforce-foundation`; baseline remote commit `a12cbef`.

## Existing infrastructure reused

The application already had actor-scoped `Prospect` / `ProspectSource` evidence snapshots, deterministic qualification, a HubSpot read-only intake, local suppression, approved product/proof loaders, versioned `GeneratedDraft` workforce runs, stage leases/CAS, source-grounded OpenAI generation and human draft review. The old `/sales-agent` page primarily exposed a technical research form, with evidence review underneath.

The dashboard now projects those real stores. It does not create demo prospects, invented metrics, connector successes or additional infrastructure. All Legacy Signal tools/routes remain available. The old evidence editor loads only when expanded.

## Persistent models

| Concern | Typed contract | Existing durable storage |
| --- | --- | --- |
| Prospect identity and CRM scope | `IntakeContact`, validated `contactSchema`, `isInOwnedIntakeScope` | Actor-scoped `Prospect` and versioned `ProspectSource` |
| Evidence and provider observations | `EvidenceObservation`, `EvidenceProvenance`, `EvidenceSnapshot`, `snapshotSchema` | Snapshot JSON including source IDs, timestamps, support, provider status and intake-window provenance |
| Eligibility and explicit review | `QualificationDecision`, `dashboardReviewSchema` | `EvidenceSnapshot.dashboardReview`: human review date, decision/reasons, literal `approved:false`; appended under the existing actor lock |
| Research runs and stages | `runSchema`, events, leases, `RunSummary`, `StageStatus` | Existing versioned `GeneratedDraft` workflow `AGENT_WORKFORCE` |
| Drafts, creative approaches and quality | `sequenceSchema`, `creativePlanSchema`, `criticSchema` | Inside the persisted workforce run; copied for safe read-time redaction |
| Integration readiness | `IntegrationHealth` | Projected from configuration presence and persisted snapshot provider observations / real run usage; not a new probe database |

No Prisma schema changes or migrations are required. Review dates survive HubSpot recollection. Historical decisions are not authorization: current evidence and suppression are recomputed on every dashboard refresh. Reviewed Today counts unique in-scope contacts explicitly marked reviewed in the UTC day; queue counts are distinct from research/draft readiness. Failed evidence storage produces unknown metrics (`—`), not fabricated zeros.

## Routes and actual behavior

- `/sales-agent`: operational dashboard, searchable/filterable queue, four metrics, real stage activity, readiness and latest ten saved runs.
- `/sales-agent/prospects/[contactId]`: company/contact profile; HubSpot ID, owner and intake dates; qualification evidence/citations; employment/email verification; Outreach history and conflicts; Similarweb availability; linked research, hypothesis/uncertainties; manual Google SERP capture recommendations; gated Draft Studio.
- `/sales-agent/manual?contactId=...`: secondary research form, optionally prefilled from this actor's authorized queue. Input labels are not verified facts. New runs carry the HubSpot ID; a changed name/domain/title cannot inherit another contact's eligibility.
- `/sales-agent/runs/[runId]`: opens the actual actor-owned persisted run, with resume, evidence, strategy, creative approaches, review and permitted draft editing.
- `/api/sales-agent/dashboard`: authenticated, no-store projection; same-origin POST supports `MARK_REVIEWED` only. It writes application evidence history, not CRM fields or approvals. Production writes are blocked.

The queue never includes another owner's record, legacy snapshots without creation/assignment provenance or duplicate HubSpot IDs. Manual runs without a linked ID stay in Recent Research Runs and are not silently attached to a namesake.

## Strict gates

HubSpot search requires current `hubspot_owner_id = 1087915602` AND (`createdate` since 00:00 UTC today OR `hubspot_owner_assigneddate` since that cutoff). Detail reads recheck owner and timestamps before company collection. Contacts admitted by earlier scoped collections may remain pending in the queue; this is a durable backlog, not a claim that all rows were created today. Search pages can change during collection; restart collection after a UTC-day boundary rather than carrying an old cursor into the next day.

Company thresholds remain at least 80 employees and USD30M revenue. Every relevant non-CMO role now requires explicit verified Search responsibility; a senior Search title or VP Marketing title alone is insufficient. Paid Social-only profiles remain excluded. The four-calendar-month outbound window, complete Outreach history, unsubscribe/bounce/complaint checks, no active sequence/conflicting opportunity, independent current employment, and independent business-email verification remain fail-closed. ZoomInfo verification needs timestamped support tied to this company and current email. Surfe, Boring, edited or CRM-present emails do not bypass independent verification. No email mutation is implemented.

Unknown-history manual research may gather sources and strategy, but the orchestrator cannot invoke the writer or quality stage unless contact eligibility is READY. Stored draft reads and edits recheck eligibility; reads also verify current approved knowledge, source freshness, citation checks and quality completion. HOLD or unavailable checks redact draft bodies without altering the saved run. Queue responses contain research/evidence summaries and no draft bodies. Draft Studio never grants sending, enrollment or automatic approval.

## Integration reality and configuration

| Integration | Implemented path | What still needs authorized validation / implementation |
| --- | --- | --- |
| HubSpot | Owner/date-scoped read-only contact search, contact/company details | Valid `HUBSPOT_PRIVATE_APP_TOKEN` with contact/company read/search permissions; access to owner/assignment fields; fresh read-only opportunity clearance adapter is still missing. Configure `HUBSPOT_COMPANY_REVENUE_CURRENCY=USD` only when revenue is truly USD. No current live connection was tested in this workspace. |
| OpenAI | Existing server-side Responses API, actual web-search tool, public-source retrieval, strategy/writer/critic | Existing `OPENAI_API_KEY`, supported `OPENAI_MODEL`, `AI_PROVIDER=openai` or existing default, optionally `OPENAI_RESEARCH_MODEL`. Authorized live calls, web access and approved database knowledge are prerequisites; configuration presence alone is not success. |
| Outreach | No read-only adapter registered | Authorized read-only history, suppressions, sequence and opportunity-context integration must be implemented/tested. A token alone does not enable it. No enrollment or send endpoint exists. |
| Similarweb | No live adapter registered | Authorized read-only provider adapter and evidence mapping must be implemented/tested. No traffic/search estimates are invented. |
| Employment / business email | Existing timestamped evidence normalization and strict checks | An authorized independent validation adapter must be registered and tested. ZoomInfo or independent evidence needs current matching company/email and supporting provenance. Boring green status is insufficient. |

`DATABASE_URL` is required for existing tables and approved knowledge. Existing Supabase authentication uses `NEXT_PUBLIC_SUPABASE_URL` plus `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or existing `NEXT_PUBLIC_SUPABASE_ANON_KEY` fallback). No credential values or settings were changed. No new placeholder token names are introduced for adapters that do not exist.

Integration Health distinguishes NOT_CONFIGURED, CONFIGURED_UNTESTED, historical LAST_SUCCESS, ERROR and NOT_IMPLEMENTED. It does not run automatic live probes; a provider failure appears as the collection error, and an older recorded success never establishes current access. No integration is claimed to have passed a live authorized test in this change.

## Validation and Preview review

Provider responses in automated tests are isolated fictional fixtures, never live HubSpot records. Coverage includes queue scoping/deduplication, human review persistence and actor isolation, unknown-vs-zero metrics, source URL safety, filtering and contact navigation, current-role/email evidence requirements, stale/revoked draft protection, and blocked/interrupted stage display. Existing qualification, source provenance, suppression, no-send and no-enrollment tests remain in place.

For Preview review: sign in with the existing Google flow; open `/sales-agent`; inspect empty states/readiness, then collect newly created/assigned contacts only with authorized read-only credentials. Select a contact, inspect HOLD reasons and citations, mark it reviewed, refresh, and confirm the UTC review count. Run research via the secondary action; missing eligibility must keep Draft Studio locked. No Production deployment, migration, CRM modification, sequence enrollment or email sending is part of this workflow.

## Executed validation

- Final full Vitest suite: **759 passed, 0 failed, 1 skipped** across 80 passed test files and 1 skipped file. The existing database harness requires `TEST_DATABASE_URL` and was not executed.
- TypeScript (`tsc --noEmit --incremental false`), ESLint and production build: **passed**. No migrations ran.
- Local Chromium checks: empty queue, populated queue and prospect workspace at **375px, 768px and 1440px**, no horizontal page overflow. These use explicitly fictional, isolated component-test evidence; they do not establish live integration or authenticated Preview acceptance.
- Live integration tests: **not performed**. Workspace has no configured application credentials; protected Preview access was previously denied by the Vercel connector. No successful HubSpot/Outreach/Similarweb/independent verification/OpenAI connection is claimed by this delivery.

## Files created or modified

- `docs/agent-workforce-dashboard.md`
- `src/app/api/sales-agent/dashboard/route.test.ts`
- `src/app/api/sales-agent/dashboard/route.ts`
- `src/app/api/sales-agent/evidence/route.test.ts`
- `src/app/api/sales-agent/evidence/route.ts`
- `src/app/api/sales-agent/workforce/[runId]/advance/route.ts`
- `src/app/api/sales-agent/workforce/[runId]/route.ts`
- `src/app/api/sales-agent/workforce/route.test.ts`
- `src/app/api/sales-agent/workforce/route.ts`
- `src/app/sales-agent/manual/page.tsx`
- `src/app/sales-agent/page.tsx`
- `src/app/sales-agent/prospects/[contactId]/page.tsx`
- `src/app/sales-agent/runs/[runId]/page.tsx`
- `src/features/agent-workforce/dashboard/contracts.ts`
- `src/features/agent-workforce/dashboard/dashboard-client.test.tsx`
- `src/features/agent-workforce/dashboard/dashboard-client.tsx`
- `src/features/agent-workforce/dashboard/legacy-evidence-panel.tsx`
- `src/features/agent-workforce/gate-a-contracts.ts`
- `src/features/agent-workforce/workforce-client.test.tsx`
- `src/features/agent-workforce/workforce-client.tsx`
- `src/features/sales-agent/demo-fixtures.ts`
- `src/features/sales-agent/evidence.ts`
- `src/features/sales-agent/intake-scope.test.ts`
- `src/features/sales-agent/intake-scope.ts`
- `src/features/sales-agent/orchestrator.test.ts`
- `src/features/sales-agent/qualification.test.ts`
- `src/features/sales-agent/qualification.ts`
- `src/server/agent-workforce/creative-intelligence.test.ts`
- `src/server/agent-workforce/dashboard/service.test.ts`
- `src/server/agent-workforce/dashboard/service.ts`
- `src/server/agent-workforce/http.ts`
- `src/server/agent-workforce/orchestrator.test.ts`
- `src/server/agent-workforce/orchestrator.ts`
- `src/server/agent-workforce/safety.test.ts`
- `src/server/agent-workforce/safety.ts`
- `src/server/sales-agent/evidence-store.ts`
- `src/server/sales-agent/hubspot-intake.test.ts`
- `src/server/sales-agent/hubspot-intake.ts`
- `src/server/services/sales-agent-collection-service.ts`
- `src/test/sales-agent-collection-fixtures.ts`
- `src/test/sales-agent-fixtures.ts`
