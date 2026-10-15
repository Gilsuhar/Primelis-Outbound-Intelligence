# Agent Workforce — Gate A implementation and acceptance

Branch: `feature/agent-workforce-foundation`, based on `38d2af9`.

**Gate A acceptance is not yet certified.** The real runtime path is implemented, but this workspace has no OpenAI, database, Supabase or GetLeads credentials. Its enforced network policy does not permit OpenAI or general public-web research, and the workspace proxy is unreachable. Vercel configuration reported by the user is a separate environment and has not been inspected for secret values. No live research/model run, authenticated Preview smoke test, or two-real-prospect comparison has been performed here. Automated provider fixtures do not establish live Gate A completion.

## What actually executes

The existing `/sales-agent` route retains its `requireCurrentUser` authentication. A new panel runs one manually supplied company/domain and prospect/name/title, with optional LinkedIn URL and market. The existing evidence/qualification interface remains available below it. No fictional/demo flow was added.

| Module                          | Executed capability                                                                                                                                                     | Boundary                                                                                                                                                                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product Knowledge Agent         | Reads actual approved Signal product/ICP wording, claims and eligible customer cases, including approved source relationships                                           | No fixture adapter or hardcoded performance outcomes. Missing approved product wording blocks research.                                                                                                               |
| Account Research Agent          | OpenAI Responses `web_search` discovery, public source retrieval and structured fact extraction                                                                         | Requires an actually executed web-search tool call and returned source URLs. Model general knowledge is never a substitute.                                                                                           |
| Prospect Intelligence Agent     | Public source retrieval and source-quoted current-role/responsibility extraction; optional existing GetLeads API                                                        | GetLeads is used only with its existing key and supplied LinkedIn URL. Returned name, role, employer and domain must match. It does not invoke the existing LinkedIn public-preview fallback or include email fields. |
| Brand Search Intelligence       | Explicit incomplete assessment with missing capture/ads/analytics evidence                                                                                              | No Google SERP/ad placement, competitor, CPC, spend or incrementality data connector is connected by this slice. Discovery search is not an ad screenshot.                                                            |
| Evidence validator              | Exact quotations, known/unique source IDs, HTTPS provenance, observation freshness, person/role/employer binding, followed by a separate LLM entailment/identity review | An exact quote alone does not establish entailment. Unsupported facts, unverified role assumptions, stale sources and incorrect identities block generation.                                                          |
| AI Sales Strategist             | Real structured model choice, company/person rationale, evidence references, uncertainties and alternative approaches                                                   | Can select NO_PITCH. Without SERP data, hypotheses must not become asserted account performance findings.                                                                                                             |
| Personalized Sequence Architect | Real OpenAI-generated four-email sequence, strategic purposes, citations, delays and same-thread metadata                                                               | No production templates or deterministic fallback. Actual claims cite supporting research/approved knowledge; nonfactual follow-ups may omit citations. Writer explores and selects competing approaches; fixed copy exists only in automated tests.                                                                      |
| AI Quality Reviewer             | Independent model review of all copy plus deterministic citation/numeric/thread/identity checks plus semantic factual and originality review                                                                 | One automatic revision maximum; unresolved issues stay failed/HOLD. Pure name/domain substitutions from another recent actor-owned ready run are rejected without exposing the other contact to the model.            |
| Human review                    | Persisted source/strategy/draft review, editable email bodies/subjects and rejection                                                                                    | Human edits invalidate quality review and are checked again. Approval, sending and enrollment remain false. No audited approval or Outreach handoff endpoint exists in Gate A.                                        |

Approved knowledge is read directly from the existing PostgreSQL models, not the development fixture repository. Product/ICP items require Signal scope, APPROVED status, explicit approved wording, EMAIL usage and at least one approved linked source. Claims require the Signal product relation, approved wording, EMAIL permission and an approved linked source. Customer cases require approval and a cold-email-compatible scope and use the existing proof eligibility policy. The strategist and writer select relevant combinations from the eligible pool rather than being forced to use a single ranked case. Knowledge wording, restrictions and approved source associations are rechecked before generation and final quality review. No source document internal notes are sent to a model.

## Real research sources and limits

OpenAI web search discovers URLs only. Statements from its search answer are not accepted as verified facts. The app retrieves actual public page text and supplies that text to extraction and grounding agents. Each accepted finding has a confidence assessment, exact quote, URL and observation time. Public retrieval uses HTTPS, no cookies, no redirects, validated/pinned public IPv4 DNS, 3-second DNS and 7-second request deadlines, a 500 KB body limit and an 18,000-character source excerpt. Up to three URLs per research agent are read. Gated social profile hosts are excluded. JavaScript-only, redirect-only, IPv6-only, bot-blocked or inaccessible pages may remain unavailable. The pinned reader refuses to operate through a managed proxy rather than bypassing its policy; Vercel Preview must have permitted public HTTPS egress.

Optional GetLeads uses the pre-existing authorized enrichment API only. Its professional record is labeled provider-supplied, not independent employment/email verification, and is linked to the requested profile. A matching record may contribute a quoted source; provider failures or mismatches do not certify identity. No ZoomInfo, Similarweb, HubSpot or Outreach research adapter was newly connected. Existing HubSpot collection and its reported token issue are unchanged.

A conservative exact role/name/company association plus independent model checking is required. Ambiguous or past employment is held; title-derived likely responsibilities remain assumptions. Public-source timestamps are retrieval observations, not a claim that the source was recently published or independently certified. A single observation never establishes a persistent pattern. Human source review remains necessary.

## Persistence, progress and protections

No database migration or new infrastructure is required. `GeneratedDraft` rows with workflow `AGENT_WORKFORCE` store the intake, run state, research, knowledge references, strategy, drafts, critic, timestamps, content hash and usage. Actor identity comes only from the existing session. An actor/key-derived primary key makes duplicate start requests idempotent; reusing a key with another input is rejected. Stage leases are acquired using an atomic version compare-and-set. Duplicate advances cannot execute the same stage concurrently. Expired in-flight work is marked failed, not silently replayed and billed again.

`RUNNING` advances through KNOWLEDGE → ACCOUNT_RESEARCH → PROSPECT_INTELLIGENCE → EVIDENCE_VALIDATION → STRATEGY → SEQUENCE → QUALITY_REVIEW. Outcomes are RESEARCH_INCOMPLETE, INSUFFICIENT_EVIDENCE, GENERATION_FAILED, READY_FOR_REVIEW or REJECTED. Every successful stage is saved. The browser dispatches the next stage automatically after one Start action; leaving/pausing stops later dispatch, and a saved run can resume. This is a Gate A request-driven pipeline, not a background queue/scheduler. A server request already in flight can finish after the browser leaves. A final database failure leaves an expiring lease, not a completed run.

The UI displays the actual current stage and saved events. Qualification and suppression are re-evaluated before every stage using the existing evidence store and qualification function. Local suppression, known opt-out/rejection, recent contact, active sequence or opportunity restrictions block drafting. A manual intake cannot independently establish authorized CRM identity, verified business email, employment, size/revenue or contact-history clearance. Those remain HOLD. A research draft may become READY_FOR_REVIEW while **contact eligibility remains HOLD**, and this is explicitly labeled; it authorizes review only. Saved run assessments are dated historical outputs; they are not perpetual eligibility clearance. Fresh checks and an actor/version-bound approval would still be required for any future handoff.

Edits use expected-version checks, produce a new content hash and require another automated critic review. The critic sees the entire edited body and all attached evidence, not only the previous writer's assertion ledger. No partial output is marked approved. The API accepts no send, enrollment, owner override or qualification-clearance fields. Gate A POST/PATCH writes are disabled when `VERCEL_ENV=production`; existing authentication and other product flows are unchanged.

## Models, budgets and configuration

The existing `OPENAI_API_KEY`, `OPENAI_MODEL`, provider selection and model normalization are reused. `AI_PROVIDER` must be `openai` or blank with a configured key. Unlike the legacy draft helper, Gate A never calls its deterministic fallback. The existing Responses endpoint is used with `store: false`, strict JSON-schema output generated from Zod, and Zod validation of every response. Different stages have separate instructions; reasoning models use low effort. Responses must be completed and include usage metadata.

Per request: at most one web-search tool call; 1,800 discovery, 4,500 research/strategy/validation, 6,000 writing or 3,500 critic output tokens. Calls have at most one retry for HTTP 429/5xx and a 40-second request deadline within a 90-second model-client step budget. A run is checked against 12 successful model requests, 250,000 reported input tokens and 45,000 reported output tokens before each stage. Inputs over 160,000 characters are refused. Failed/unreported calls and tool fees are not represented as free. Generation can fail on timeout, schema incompatibility or budget limits rather than returning substitute copy.

Existing required deployment settings remain:

- `DATABASE_URL` with the existing application schema and approved knowledge; `DIRECT_URL` remains part of existing Prisma configuration when generation requires it.
- Existing Supabase Auth and application-user configuration (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and existing app URL/Preview callback configuration).
- `OPENAI_API_KEY` and the existing `OPENAI_MODEL`, with actual Responses and web-search permission. A key alone does not prove web-search support.

Optional additions documented in `.env.example`:

- `OPENAI_RESEARCH_MODEL`: discovery model override if the configured writing model cannot use `web_search`.
- `OPENAI_INPUT_USD_PER_MILLION`, `OPENAI_OUTPUT_USD_PER_MILLION`: configured-model token-only estimates. Blank means unavailable, not zero. A different discovery model has no dollar estimate from these rates. Tool and unreported retry fees are excluded.
- Existing `GETLEADS_API_KEY`: optional supplied-profile enrichment; no new credential is required for public-source research.

No actual secrets or environment settings were created or changed. This workspace cannot inspect or prove Vercel's secret readiness. Provider error bodies/keys are not logged, returned to clients or included in model context.

## Validation and remaining acceptance work

Automated tests mock provider responses and storage where appropriate. They exercise the real orchestrator, contracts and HTTP request construction; they do not prove real OpenAI entitlement, public-source accessibility, database transaction behavior or live research quality. Final executed validation: **725 tests passed, 0 failed, 1 skipped** across 76 test files (75 passed files, one skipped file). The one skip is the existing `TEST_DATABASE_URL`-gated Prisma integration harness. TypeScript and repository-wide ESLint passed. The production build completed successfully, including all new dynamic workforce routes. The post-correction Prisma-store unit suite also passed (3 tests). An early concurrent standalone typecheck raced Next.js regenerating `.next/types`; the final successful standalone check ran after the build had finished generating them. No live provider, auth or database verification is implied by these checks.

For Preview review after the feature commit is published:

1. Open the existing Vercel project's Preview for `feature/agent-workforce-foundation` and sign in through the existing approved Google flow. Do not promote to Production.
2. Confirm the required existing settings are available to that Preview and the database contains externally approved source-backed Signal knowledge. Do not paste keys into chat.
3. Enter a real company/domain and an authorized real prospect's name/current title; optionally give a profile and market. Start once, observe real stage progress and open the actual source links. A reported missing source or model capability is a blocker, not a successful run.
4. Require correct source-quoted company/person association, a justified strategy and alternatives, four original grounded emails, a passing automated critic and pending human approval. Check the separately displayed eligibility HOLD requirements. Edit and recheck, or reject; never send or enroll.
5. Repeat with a second real prospect. Record substantive differences in research, strategy and sequence, not company/name substitutions. This live comparison is an explicit remaining Gate A acceptance requirement.

Not implemented: scheduled daily queue, provider prospect discovery/approval, a Google SERP/ads/analytics connector, audited human approval persistence, Outreach capability discovery/objects/writes, sending/enrollment, engagement feedback, production enablement, full browser QA and live two-prospect acceptance. These remain visible boundaries; no production deployment or migration has been performed.

## Changed files

32 files created or modified:

```text
.env.example
docs/agent-workforce-gate-a-validation.md
docs/agent-workforce-implementation-contract.md
src/app/api/sales-agent/workforce/[runId]/advance/route.ts
src/app/api/sales-agent/workforce/[runId]/route.ts
src/app/api/sales-agent/workforce/route.test.ts
src/app/api/sales-agent/workforce/route.ts
src/app/sales-agent/page.tsx
src/features/agent-workforce/contracts.ts
src/features/agent-workforce/gate-a-contracts.ts
src/features/agent-workforce/workforce-client.test.tsx
src/features/agent-workforce/workforce-client.tsx
src/features/connected-research/website-extractor.ts
src/server/agent-workforce/creative-agents.ts
src/server/agent-workforce/evidence-validation.ts
src/server/agent-workforce/http.ts
src/server/agent-workforce/knowledge-agent.test.ts
src/server/agent-workforce/knowledge-agent.ts
src/server/agent-workforce/openai.test.ts
src/server/agent-workforce/openai.ts
src/server/agent-workforce/orchestrator.test.ts
src/server/agent-workforce/orchestrator.ts
src/server/agent-workforce/prospect-provider.test.ts
src/server/agent-workforce/prospect-provider.ts
src/server/agent-workforce/public-sources.ts
src/server/agent-workforce/research-agents.ts
src/server/agent-workforce/safety.test.ts
src/server/agent-workforce/safety.ts
src/server/agent-workforce/store.test.ts
src/server/agent-workforce/store.ts
src/server/services/linkedin-enrichment-service.ts
src/test/workforce-fixtures.ts
```

## Creative intelligence extension
The writer now persists 2–4 competing approaches (concept, voice, narrative, individual fit and tradeoffs), its selection rationale and explicitly uncertain strategic hypotheses with fact references. The review UI exposes this reasoning. Product proof is optional, and all eligible approved cases remain available for contextual selection. Four steps do not prescribe four angles, repeated product mentions or CTAs. Removed the 150-word cap and vocabulary blacklist; retained a generous body resource limit, evidence-reference integrity, exact numeric support, same-thread timing, independent semantic review and all existing suppression/history protections. Proposed meeting durations are distinguished from numeric performance claims.

The critic requires originality and strategic fit in addition to its original seven checks. Failed originality triggers the existing bounded revision path. Legacy persisted drafts remain readable; new generation requires the creative plan and new review checks. No model credentials, architecture, authentication, database schema or sending integrations changed.

New automated coverage checks flexible length/closings, ordinary vocabulary, meeting-duration proposals versus unsupported statistics, invalid creative selections, unsupported hypothesis citations, generic-copy revision, semantic rejection of invented SERP observations and ten separate fictional writer briefs. The ten-brief test verifies input isolation and creative instructions, not actual model quality or ten genuinely distinct live sequences. Live creative acceptance remains blocked by the previously documented provider/network limitations.

Validation for this extension: full Vitest run **730 passed, 1 skipped, 0 failed** (76 passed test files, 1 skipped). The existing database harness remains skipped without `TEST_DATABASE_URL`. After the last creative-policy adjustments, the focused orchestration/creative tests passed **21/21**. TypeScript and ESLint passed; production build passed. Deterministic numeric validation checks factual assertion numbers and percentages throughout subjects/bodies; the independent critic checks all remaining numeric assertions and omitted-ledger claims. Nonfactual framing such as “2 questions” is permitted. This is not a live research or model-quality acceptance result.

Changed files for this extension: `docs/agent-workforce-implementation-contract.md`, this report, `src/features/agent-workforce/gate-a-contracts.ts`, `src/features/agent-workforce/workforce-client.tsx`, `src/server/agent-workforce/creative-agents.ts`, `src/server/agent-workforce/evidence-validation.ts`, `src/server/agent-workforce/orchestrator.ts`, `src/server/agent-workforce/orchestrator.test.ts`, new `src/server/agent-workforce/creative-intelligence.test.ts`, and `src/test/workforce-fixtures.ts`.
