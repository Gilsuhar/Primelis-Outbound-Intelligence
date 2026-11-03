# Autonomous HubSpot prospect research

Implemented on the existing Agent Workforce stack. The new flow supplements the manual Gate A and evidence-review routes; it does not replace them or change qualification policy.

## Baseline audit

The baseline already had OpenAI Responses structured outputs, live web-search discovery, public HTTPS retrieval with DNS pinning and source restrictions, quoted fact extraction, independent grounding review, approved product knowledge queries and user-scoped versioned GeneratedDraft storage. Research was initiated from manual company/person intake and failed the entire sequential run when a research stage failed. The existing dashboard displayed research but had no HubSpot-driven resumable research queue. Similarweb had no registered adapter, and brand-search research only reported a gap. Existing verification and CRM history protections remain authoritative.

## Working implementation

Owner-scoped, dated HubSpot intake → Company → Similarweb → SERP → Contact → Opportunity assessment → Research review.

Only synchronized snapshots with a HubSpot import receipt, a successful recorded HubSpot provider response and owner `1087915602` are admitted. Intake must be no more than 24 hours old. Existing newly-created/newly-assigned scope checks and suppression rules are reapplied. REJECTED contacts are excluded. HOLD contacts can be researched, including when employment or business evidence is missing. A company association/domain is still necessary: missing identity is reported rather than guessed from email. HubSpot ID is the stable key; browser requests cannot supply replacement identity, evidence or credentials.

`prospectResearch` is a strict, versioned additive run contract in the existing GeneratedDraft JSON payload. No migration is required for research. The integration sync tables/migration from the earlier baseline remain prerequisites. Existing manual evidence POST `/api/sales-agent/research` is unchanged. New endpoints use `/api/sales-agent/prospect-research`.

Company/contact extraction reuses actual OpenAI web search and the public-source reader. Each published fact has source URL, retrieval timestamp, confidence, limitations and exact quote. Employee/revenue/geography/website categories are supported; extraction requires dated/count/currency/period caveats instead of guesses. Missing facts remain gaps. A separate structured critic must support every fact and confirm identity before findings are saved. Final review checks combined source freshness and person/company association. Conflicting/unsupported evidence blocks a reviewed opportunity. Research never becomes independent employment/email verification and never writes into qualification observations.

Opportunity assessment uses approved database product knowledge, source-backed facts and actual available observations. Structured output separates a hypothesis, cited fact/observation IDs, confidence, limitations, missing information, outreach angle and proposed follow-up. A second model review checks the complete assessment, including implications outside citations. Unsupported assessments are withheld. All external content is untrusted input. No writer, Outreach API, send or enrollment operation is called.

## Real adapters and unavailable sources

- **OpenAI**: the existing server-side Responses API, structured outputs and executed `web_search` tool calls. `AI_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_MODEL`, optional `OPENAI_RESEARCH_MODEL`; existing optional token-price variables provide estimated cost. A model supporting web search and available API billing/tool entitlement are required. An API key alone does not establish research access. Optional existing GetLeads enrichment remains in the reused agent, but synchronized intake does not assume a LinkedIn URL is available.
- **Public sources**: actual permitted public HTTPS pages, with existing private-network/rebinding/social-login restrictions. No private LinkedIn scraping. Sources need both API discovery and reachable pages. Retrieval time is not a claim that an undated page was published recently; dated developments and historical financial/headcount claims need explicit source wording and critic review.
- **SerpApi**: optional actual Google Search API read adapter at `https://serpapi.com/search.json`. Server-only `SERPAPI_API_KEY`, `RESEARCH_SERP_LOCATION` (SerpApi canonical location), `RESEARCH_SERP_GL` (Google country code). Separately authorized API credits/plan are needed. Requests use the CRM company brand as the primary query, desktop, explicit market and no cache. The adapter validates returned query/device/market/time/source and records the ads actually returned. Other advertiser domains are not automatically competitors. Only a single snapshot is collected per run; brand/product variations and geographic follow-up are recommendations, not additional observations. No screenshot is generated. Screenshot recommendations reference the actual observation. No CPC, spend, savings, frequency or incrementality measurement is available.
- **Similarweb**: `DATA_UNAVAILABLE`, empty metrics. No API adapter or licensed access existed and none is represented as connected. Required next input: authorized Similarweb API credentials, subscribed endpoint entitlements for search/keyword/paid-organic/geography/history, supported countries and periods. No credential variable is invented for a connector that does not exist. An adapter with metric definitions, country, period, source and collection timestamp must be added against those actual entitlements. Third-party estimates must remain labeled estimates.

These are implemented production HTTP code paths, not claims of live verification. Automated tests use isolated fictional responses. No live provider calls or authenticated end-to-end research run have been verified in this workspace: database/provider secrets are absent and its published network policy does not allow the research API hosts. Vercel Preview configuration and connectivity must be tested independently.

## Durable execution and costs

- Each stage has status, attempt count, start/finish time, retry timestamp, safe error code and detail. Provider absence produces DATA_UNAVAILABLE; a partial run never appears COMPLETE. Similarweb's missing adapter therefore means current runs remain PARTIAL even if the other stages succeed.
- Compare-and-set versions and a 110-second lease prevent duplicate work. An expired lease replays only the interrupted stage, up to three attempts. A late worker cannot overwrite a newer checkpoint.
- A transaction-level per-actor advisory lock and active-lease check allow one research provider stage at a time per operator. Execution is deliberately serialized for modest cost and predictable rate pressure; independent stages continue after a failure, without requiring that provider to recover first.
- Transient failures have bounded retries and exponential 60/120-second backoff. Existing OpenAI transport bounds each API attempt and each stage's provider deadline. Runs stop at 30 recorded model calls or 400,000 recorded input tokens or 60,000 output tokens. Usage/token estimates are saved; unavailable price configuration is reported as unknown, not zero. Provider billing is still authoritative; interrupted/failed requests can incur unrecorded charges.
- Identity hash includes HubSpot ID, owner, name, company/domain, email/edit timestamp and distinct role values, not routine sync timestamps or unrelated activity. Same-identity/provider-configuration runs are reused for 24 hours, including across midnight. Provider configuration presence/model/market changes or identity edits create a new run. Stale identity or unavailable current intake invalidates the old run and removes published findings/opportunity.
- The persistent batch cursor is separate from CRM watermark/status, in `IntegrationState.researchIntake`. Each enqueue processes at most 25 stable, sorted IDs. Failures retain cursor and diagnostics. End-of-list wraps for incremental checks. Concurrent duplicate enqueues are idempotent and cannot rewind a newer cursor.
- The pending research SQL query excludes finished/nonretryable partial runs before limiting to 100, so completed unavailable-provider records cannot starve new work. Dashboard history remains bounded to the latest 25 updated runs.

## Preview operation

1. Configure the existing Preview database/authentication, owner-scoped read-only HubSpot integration and `INTEGRATION_OPERATOR_USER_ID`. Apply earlier reviewed integration migrations only through the authorized database process; this implementation does not run migrations.
2. Configure the existing OpenAI provider with Responses/web-search access and approved Signal product knowledge in the database. No new paid provider is required for company/contact research beyond the existing OpenAI usage; unavailable Similarweb/SERP stages stay explicit.
3. Run HubSpot synchronization. Its worker enqueues a bounded research batch using the persistent cursor. A research failure does not rewrite a successful CRM sync checkpoint. Research intake failures are recorded in the separate researchIntake diagnostic.
4. Open an actual synced prospect. The existing workspace shows stage history, company/contact quotes and sources, unavailable providers, SERP observations and reviewed opportunity hypotheses. “Research synced prospect” enqueues from the stable CRM ID. “Resume research” schedules one bounded stage. While a RUNNING research workspace remains open, authenticated same-origin polling resumes stages and refreshes saved progress; no technical intake form is required.
5. **Unattended execution requires an authorized scheduler**. None is provisioned or represented as installed by this change. Reuse `INTEGRATION_WORKER_SECRET` (at least 32 characters), calling `POST /api/sales-agent/prospect-research/worker` on the Preview with bearer authorization and JSON `{ "actorId": "<INTEGRATION_OPERATOR_USER_ID>" }`, every 30–60 seconds. Each invocation advances one bounded stage and enqueues the next durable intake batch. A protected Preview also requires the organization's authorized deployment-protection access. Do not publish tokens in URLs, client code, logs or chat. Failed requests can be repeated safely. No Production cron is installed; execution routes and workers refuse Production.
6. Check actual persisted results and live API outcomes before declaring connection or end-to-end completion. Resume retries after their retry timestamp; three failures require new/fresh research and human investigation. DATA_UNAVAILABLE stages do not silently become successful. If credentials are supplied later, enqueue again; relevant provider configuration changes produce a new run. Adding Similarweb requires a real adapter, not a status toggle.

## Remaining limits

No live authenticated provider/database validation was possible in the coding environment. Similarweb is explicitly unimplemented. SERP covers the primary company query and desktop in one configured market; automated multi-query/multi-device monitoring and real screenshot capture are follow-up work. Research does not directly clear missing eligibility facts: evidence must pass the existing verification/qualification policies. Unattended scheduling must be configured outside this change. The workflow stays draft-free; generation remains the separate existing gated pipeline.

## Executed validation

- Prisma Client generation: passed (exit 0).
- TypeScript: passed.
- ESLint: passed, no warnings.
- Full Vitest suite: 893 passed, 0 failed, 1 existing database-harness skip, across 91 passed test files and 1 skipped file.
- Next.js production build: passed, including both new research routes.
- Headless Chromium: queue, empty and prospect views at 375, 768 and 1440 pixels, plus explicit new-research-panel/history checks at all three widths; no horizontal overflow. These checks use isolated fictional layout fixtures, not live CRM records or a live authenticated research run.
- No database migration, live research/provider call, CRM write, sequence enrollment, email send or Production deployment was performed.
