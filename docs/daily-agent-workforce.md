# Daily Agent Workforce operations

This release coordinates existing read-only HubSpot/Outreach sync, independent verification, prospect research, opportunity assessment, AI drafting and quality review. It adds no sending, enrollment, CRM mutation, automatic approval, new service or database migration. Production mutations are refused. Existing authentication and legacy routes remain intact.

## What is implemented

`POST /api/sales-agent/daily/worker` executes one checkpointed unit. HubSpot synchronization must finish before Outreach synchronization, and both must finish before contact processing. A failed or partially paginated import cannot become a successful daily run. Existing import checkpoints/watermarks and owner-assignment evidence remain authoritative; lastmodifieddate is not reassignment proof. Owner `1087915602`, dated created/assigned scope, and HubSpot Record ID deduplication are unchanged.

Each selected contact proceeds through independent email verification, independent employment verification, company/Similarweb/SERP/contact research, opportunity assessment/review, strategy, sequence, quality review, and the human queue. Research may resolve HOLD evidence; it never grants eligibility. Research does not turn a job title into proven Search responsibility. HOLD/REJECTED contacts cannot receive send-ready drafts. An eligible contact still requires approved knowledge and reviewed, fresh sources. Optional Similarweb/SERP outages remain visible in the existing workspace. No mock provider is used by operational routes.

Qualification, suppression, calendar-month cooldown, identity association, history authority, employment/email proof, evidence freshness and draft dependency invalidation reuse the existing engines. Prior drafts are revalidated even when the contact has become blocked. Final readiness is checked again after model calls. Historical report counts describe the last persisted checkpoint, not permanent contact clearance. Draft Studio revalidates on open/edit/review. Nothing is approved automatically.

Completed verification and unchanged, fresh research/draft dependencies are reused. Research still expires according to existing 24-hour evidence policy. Intake has a rotating stable-ID cursor derived from the last completed run, so a contact cap does not continually starve later IDs. Deferred contacts appear explicitly; they are not processed outside the configured run cap.

## Persistence, recovery and diagnostics

Daily jobs, reports, estimated usage and reservations live in the existing operator's `IntegrationState.state.daily`. PostgreSQL's existing transaction/advisory lock serializes updates across instances. Provider I/O occurs outside the transaction. Every daily unit has a random fenced token and 150-second lease; each request has a 120-second deployment execution limit. Concurrent scheduler/manual requests reuse the active job. Workers that finish after cancellation/retry cannot overwrite the current state. An interrupted unit replays its existing underlying checkpoint under bounded recovery attempts. Provider-specific stores retain their own leases and identity/CAS checks.

Provider failures use stage-specific retry counters and exponential backoff. Supported Retry-After delays are preserved. Individual contact failure exhausts into the persisted failed-contact queue while unrelated contacts continue. Sync failure exhausts the whole run rather than processing untrusted partial intake. Run state is RUNNING, COMPLETED, PARTIAL, FAILED, PAUSED or CANCELLED. Blocked contacts/deferred work make a report PARTIAL. COMPLETE research here means required company/contact/review stages succeeded; the detailed workspace still shows optional unavailable providers separately.

Same-origin operator-only `POST /api/sales-agent/daily` supports RUN (idempotency key), ADVANCE (one unit), RETRY (existing unresolved work), CANCEL. RETRY is explicit authorization to retry exhausted source stages while retaining completed research and redoing dependent assessment/review; it does not grant eligibility. Existing research retry-history and draft regeneration/version limits remain bounded. Stale identity/evidence needs refreshed intake/research, not a forced replay. Cancellation stops further daily units; already-issued read-only requests may finish and persist unapproved outputs. Active leases must drain before a new/retried run can start.

Up to 90 recent run reports are retained (at most 20 starts per local day), with daily usage for 62 days and monthly totals for 24 months. Provider bodies/secrets are never diagnostics. Contact evidence and full generated-run versions remain in their existing stores. This is deliberately a bounded single-operator coordinator, not a new general-purpose job broker.

## Scheduler activation — not active by default

Configuration alone does not prove an external scheduler exists. Vercel Preview does not run Production Cron jobs. No `vercel.json` Production cron or default-branch GitHub schedule is installed. An approved always-on external runner must POST an empty JSON object to the feature Preview worker every minute. It resumes existing jobs at any hour; daily intake starts once per Jerusalem calendar-date key at/after the configured wall time.

The app uses IANA `Asia/Jerusalem`, not a hardcoded UTC offset. A missing spring time runs at the first later tick; repeated autumn times use the same daily key. A missed current-day time catches up at the next tick. After a multi-day worker outage, the most recent due day is recovered once rather than launching an expensive run for every missed day. Existing incremental CRM watermarks recover the underlying contact changes. A first-ever activation before the configured time waits until that time. A paused/failed older run requires operator review/retry; it is never silently declared recovered.

1. Verify the exact feature Preview is READY, backed by an authorized non-Production database. If not previously applied, have the administrator apply the existing reviewed integration-state migration to Preview only; this task does not apply migrations.
2. In Preview configure `INTEGRATION_OPERATOR_USER_ID` as Gil's existing application User ID, and `INTEGRATION_WORKER_SECRET` with at least 32 random characters. Configure integration/auth variables using the secure platform UI, never chat or browser storage.
3. Configure budgets/prices below, `WORKFORCE_DAILY_ENABLED=true` and `WORKFORCE_DAILY_TIME` (HH:mm, default 09:00 Jerusalem). Redeploy Preview with reviewed settings. Do not configure Production.
4. On the approved existing worker host, check out this exact feature revision. Set `WORKFORCE_PREVIEW_URL` to the reviewed HTTPS `*.vercel.app` Preview **origin**, `INTEGRATION_WORKER_SECRET` to the same secret, and, only when Preview protection requires it, `VERCEL_AUTOMATION_BYPASS_SECRET` using secure host settings. Use a dedicated Preview URL and update it after each published revision. Do not share a rotating Outreach grant between old/new deployments.
5. Run `node scripts/workforce-worker.mjs --once` to verify authenticated delivery. It logs only accepted/error status. Then supervise `node scripts/workforce-worker.mjs` with the existing host's process manager, restart-on-failure and secret management. It wakes every minute after a completed request; failed deliveries back off to at most five minutes. It is not self-installed or launched by the application.
6. Confirm `lastWorkerAt` changes across several requests, observe a persisted run progressing and check the host's supervisor schedule. Dashboard `WORKER_OBSERVED` means an authenticated worker tick arrived within ten minutes; it does **not** prove future delivery. Next time is displayed only while a recent worker is observed. Pauses and provider errors remain explicit. Disable the old standalone research/draft scheduled worker when using the daily coordinator to avoid redundant independent intake; manual tools remain usable under the shared budget.

An external scheduler can instead issue the same authenticated POST once/minute, with `Authorization: Bearer <server-managed secret>` and `Content-Type: application/json`, body `{}`. Configure secrets in its protected header fields. Do not put secrets in URLs, CLI arguments or logs. GET is unsupported. A successful wake-up confirms authentication only; dashboard run/coverage/provider states determine actual processing success.

## Cost-control configuration

All paid Agent Workforce OpenAI Responses calls (including manually initiated research/drafting), verification HTTP attempts, optional authorized GetLeads enrichment and SERP calls pass the shared ledger before network I/O. Every HTTP retry reserves separately. Existing fixed-host CRM read transport retains its own pagination/rate limits; the configured paid-provider concurrency limit does not count ordinary unpaid page reads. Provider stages also retain the existing single-operator model-stage lease. No application price is presented as a verified provider invoice.

| Variable                                                        | Default / behavior                                                                                                                  |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `WORKFORCE_DAILY_ENABLED`                                       | false; existing running manual jobs can still drain                                                                                 |
| `WORKFORCE_DAILY_TIME`                                          | 09:00 Asia/Jerusalem                                                                                                                |
| `WORKFORCE_DAILY_BUDGET_USD`                                    | 5 estimated USD                                                                                                                     |
| `WORKFORCE_MONTHLY_BUDGET_USD`                                  | 100 estimated USD                                                                                                                   |
| `WORKFORCE_MAX_CONTACTS`                                        | 25/run, configurable 1–500                                                                                                          |
| `WORKFORCE_MAX_CONCURRENT_CALLS`                                | 1 paid HTTP call/operator, configurable 1–5                                                                                         |
| `WORKFORCE_MAX_RETRIES`                                         | 2 retries, configurable 0–3; existing adapters may impose a lower ceiling                                                           |
| `WORKFORCE_MODEL_PRICES_JSON`                                   | exact model IDs mapped to `{ "input": number, "output": number }` USD/million tokens; operator must supply current applicable rates |
| `OPENAI_INPUT_USD_PER_MILLION`, `OPENAI_OUTPUT_USD_PER_MILLION` | existing base-model rate fallback only; never applied to an override model                                                          |
| `WORKFORCE_WEB_SEARCH_REQUEST_USD`                              | required reviewed estimated fee per discovery search tool call, in addition to tokens                                               |
| `WORKFORCE_VERIFICATION_REQUEST_USD`                            | required reviewed per-attempt verification/gateway estimate                                                                         |
| `WORKFORCE_RESEARCH_REQUEST_USD`                                | required per-attempt estimate only when optional authorized GetLeads enrichment is enabled                                          |
| `WORKFORCE_SERP_REQUEST_USD`                                    | required reviewed per-attempt SERP estimate                                                                                         |

Unknown/malformed prices fail closed with PRICING_REQUIRED; no guessed pricing or paid-provider subscription is supplied. Input reservations conservatively use serialized UTF-8 request bytes plus overhead as an input-token upper estimate, bounded max output tokens, configured model rates and discovery tool fee. Returned token usage settles the estimate; failed/time-out/interrupted attempts keep their full uncertain reservation, and expiry releases concurrency without refunding uncertain spend. Settlements are idempotent and attributed to the reservation's original local day/month even across midnight. Actual bills, discounts, cached tokens, provider billing conventions and subsequent price changes may differ; these are application estimates, not a provider-enforced financial cap. If measured estimated cost exceeds its reservation it is recorded honestly, and later reservations stop at the budget.

Daily/monthly budget, unknown-price and request-count limits pause before another paid call. A manual retry after configuration review resumes checkpoints; it never resets the ledger. Daily request count is additionally capped at 2,000. Model request counts/token totals, verification/SERP attempts, research stage attempts per prospect, daily/monthly estimates and uncertain attempts are persisted. No network call starts if the reservation transaction fails.

## Monday, October 19: live test checklist

1. Confirm the new feature Preview SHA/READY status and correct isolated database/auth/operator binding. Preserve the working Google login and existing schema migration history.
2. Have the HubSpot admin replace the 401 token through Preview's secret settings with a valid Private App read token. Confirm actual contacts/companies/deals/emails access, portal ID, USD revenue semantics and the explicit rollout cutoff. Verify created/owner-assignment evidence for owner 1087915602.
3. Have the Outreach admin authorize the registered read-only OAuth app, provide its refresh grant securely, configure the encryption key and confirm API visibility. Scope names and rotation requirements: [read-only integrations](read-only-integrations.md). **Tokens alone do not resolve all-user/retention/complaint authority.** Missing authoritative coverage must remain HOLD.
4. Configure an independently authorized email verification provider (optional paid ZeroBounce) and employment proof gateway. Review [verification policy](prospect-verification-pipeline.md). Boring green, a CRM email, or a job title is insufficient. Unknown proof must stay HOLD.
5. Configure existing OpenAI Responses/live web-search access, approved database product knowledge, exact model pricing, search-tool fee and paid verification/SERP estimates. SERP requires the existing authorized SerpApi key/market settings. Similarweb remains unavailable until a licensed adapter and entitlements exist; do not invent metrics.
6. Permit actual required provider hosts in the published network policy through the environment administrator. No credentials or allowlist changes were made during implementation.
7. Start with a one-contact run cap and a small reviewed budget. Perform real authenticated Integration Health checks, then Run now and observe every persisted stage/source/hold reason. Confirm pagination/coverage, association, suppression, independent employment/email evidence and four calendar months. An ineligible contact must stop before drafting.
8. After authoritative gates genuinely pass, inspect actual sources, selected opportunity/strategy, four OpenAI messages, independent quality PASS and unapproved human-review state. Edit/review in Draft Studio; test an evidence change invalidates approval. Do not send, enroll or modify CRM data.
9. Configure/verify the external worker as above, then observe the scheduled Jerusalem run and a controlled restart/checkpoint recovery. Without this deployed verification, scheduling is implemented but **not activated or live-verified**.

## Validation disclosure

Automated tests use fictional records and mocked provider HTTP. They verify scheduling/DST, authentication, atomic budgets/concurrency, retries, partial sync, crash recovery, suppressed/HOLD routing, deduplication, existing draft revalidation and no send/approval controls. No live CRM, verification, research, OpenAI or database request is claimed without a real authorized successful call. Final checks executed successfully: Prisma generation, TypeScript, ESLint, production build, and full Vitest (996 passed, 0 failed, 1 existing database-harness test skipped). Chromium checked the real dashboard and Draft Studio components with clearly labeled fictional API fixtures at 375px, 768px and 1440px: no horizontal overflow; operational controls and all four draft editors/copy controls remained available. These are local layout checks, not a live authenticated provider smoke test. Preview status is reported separately after publication.

## Changed files

- `.env.example`
- `docs/daily-agent-workforce.md`
- `scripts/workforce-worker.mjs`
- `src/app/api/sales-agent/daily/route.test.ts`
- `src/app/api/sales-agent/daily/route.ts`
- `src/app/api/sales-agent/daily/worker/route.test.ts`
- `src/app/api/sales-agent/daily/worker/route.ts`
- `src/features/agent-workforce/daily/contracts.ts`
- `src/features/agent-workforce/dashboard/daily-operations-panel.test.tsx`
- `src/features/agent-workforce/dashboard/daily-operations-panel.tsx`
- `src/features/agent-workforce/dashboard/dashboard-client.tsx`
- `src/server/agent-workforce/daily/auth.ts`
- `src/server/agent-workforce/daily/budget.test.ts`
- `src/server/agent-workforce/daily/budget.ts`
- `src/server/agent-workforce/daily/engine.test.ts`
- `src/server/agent-workforce/daily/engine.ts`
- `src/server/agent-workforce/daily/handlers.test.ts`
- `src/server/agent-workforce/daily/handlers.ts`
- `src/server/agent-workforce/daily/schedule.test.ts`
- `src/server/agent-workforce/daily/schedule.ts`
- `src/server/agent-workforce/daily/state.ts`
- `src/server/agent-workforce/daily/test-store.ts`
- `src/server/agent-workforce/draft-studio/engine.ts`
- `src/server/agent-workforce/openai.test.ts`
- `src/server/agent-workforce/openai.ts`
- `src/server/agent-workforce/orchestrator.ts`
- `src/server/agent-workforce/prospect-provider.test.ts`
- `src/server/agent-workforce/prospect-provider.ts`
- `src/server/agent-workforce/prospect-research/engine.test.ts`
- `src/server/agent-workforce/prospect-research/engine.ts`
- `src/server/agent-workforce/prospect-research/serp.test.ts`
- `src/server/agent-workforce/prospect-research/serp.ts`
- `src/server/agent-workforce/research-agents.ts`
- `src/server/integrations/contracts.ts`
- `src/server/integrations/http.ts`
- `src/server/verification/providers.ts`
- `src/server/verification/service.ts`
- `src/server/verification/verification.test.ts`
