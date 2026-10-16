# Evidence-grounded Personalization and Draft Studio

## Existing infrastructure retained

The baseline already contained owner-scoped HubSpot intake, read-only Outreach synchronization, deterministic qualification and independent verification, a resumable research engine, approved Signal knowledge/claim retrieval, an OpenAI strategy/writer/critic pipeline, user-scoped GeneratedDraft persistence and the prospect dashboard. This change connects them. It does not alter qualification thresholds, authentication, CRM permissions or the legacy evidence/manual workflows.

## Operational flow

HubSpot contact → qualification → reviewed research → opportunity/personalization → four original drafts → independent quality review → explicit human content review.

DraftStudioEngine accepts only an existing research run or a HubSpot record ID resolved server-side. All mandatory contact gates must currently pass. Company/contact research and its final source/identity review must pass, sources must remain fresh, the research identity must match the synchronized intake and externally approved product wording must exist. Current suppression and integration checks remain mandatory. Missing Similarweb or SERP data is explicit optional context, never fabricated findings. Research completion never grants eligibility.

The existing sales strategist becomes the Personalization Intelligence Agent: select one strongest reason, distinguish sourced facts, hypotheses, third-party observations and missing information, and compare creative approaches. Weak unique hooks can lead to a restrained role-relevant inquiry using verified role/company context and approved capabilities; this never bypasses identity or research grounding. The writer uses the same approved facts/knowledge and original creative process. Gil’s style is conversational, concise, curious and professional, generally 55–100 words when useful with a shorter close. Four touch purposes guide progression without canned wording: observation/hypothesis, different supporting angle, incrementality/paid-organic question, respectful close. No case study, competitor or savings statistic is mandatory.

The existing critic reviews all copy, not just the assertion ledger. Factual/product claims require valid fact/approved-knowledge references; SERP assertions additionally carry actual observation IDs and scoped timestamps. A snapshot does not prove frequency or identify all advertisers as competitors. Deterministic checks independently reject unsupported percentages, unknown citations, invalid threading, duplicate bodies and specified generic phrases. Writer/critic revisions are bounded to one automatic rewrite. The studio exposes PASS / REVISE / BLOCKED. Human edits are never silently rewritten: they trigger another critic pass, with explicit regeneration available if needed.

## Persistence and approval

`draftStudio` is an additive strict Zod contract on the existing actor-scoped versioned run JSON. No schema migration or new queue service is needed. It records the source run, dependency hash, quality/review state, up to ten content versions, request-key action receipts, audit events, retry time/failure count and bounded regenerations.

Approval scope is **CONTENT_REVIEW_ONLY**. It records actor, timestamp, exact content hash and dependency hash. The existing run/sequence fields `approved`, `canSend`, `canEnroll` remain false. No sending, Outreach sequence or enrollment permission is created. Human approval cannot clear HOLD.

Current contact/email, verification evidence, historical observations, suppression records, research sources/findings/SERP observations, source freshness and approved knowledge are checked before preparation and after provider work, on reads, copy, editing and approval. Changed dependencies or unavailable clearance invalidate content approval and hide operational draft bodies and historical bodies in API responses. Newer reviewed research supersedes an older bound run. An invalidated run retains its immutable evidence/audit history; a valid subsequent preparation creates a fresh pending review run, with bounded recovery keys. No previous approval transfers.

Edits persist atomically with approval clearing and a human-origin version, then require quality review. Editing and approval use compare-and-set versions. Repeated action request keys are idempotent; reusing a key with changed payload fails. Regeneration reuses research and is limited to three requests per run. Identical preparation requests return the existing run and never make another model call.

## Automatic execution and cost

A completed research-review worker attempts gated draft preparation. Contacts whose eligibility becomes valid later are revisited by a durable five-contact draft intake cursor, separate from CRM sync checkpoints. The existing secured research worker alternates research and drafting and advances at most one provider stage per invocation. Research/writing share the per-operator active-stage lease. Each stage persists; expired leases can resume with a bounded three-failure budget and 60/120-second retry backoff. All preparation/mutation/worker routes refuse Production writes and require the existing authenticated operator/same-origin or scheduler bearer controls.

The prospect workspace automatically prepares a draft when it sees an eligible contact with reviewed research, then resumes/polls while open. Unattended processing still requires an authorized scheduler; this change does not install one. Existing `POST /api/sales-agent/prospect-research/worker` with `INTEGRATION_WORKER_SECRET` and `{ "actorId": "<INTEGRATION_OPERATOR_USER_ID>" }` now services both research and drafts. Use the approved Preview endpoint and deployment-protection access; never put credentials into URLs or client code.

No new research is performed while drafting. New studio prompts reuse selected verified facts and exact original quote excerpts rather than resending complete fetched pages. Approved knowledge retrieval ranks whole records against the verified prospect/account context and keeps a bounded set (up to 12 records / 32,000 characters), preserving wording, metrics and restrictions without truncating an approved claim. Full original evidence remains persisted and is revalidated server-side. Persisted source-backed company/person intelligence is reused; prompts receive this contact’s evidence only. Existing cross-contact copy detection compares normalized draft shapes without inserting another person’s data into model prompts. The original model budget remains enforced (12 recorded calls and token ceilings per run). Usage/estimated token cost is retained; missing model-specific pricing remains unknown, and tool/unreported retry charges are excluded.

Existing `OPENAI_API_KEY`, `OPENAI_MODEL` and optional existing research/cost configuration suffice. Optional server-only overrides are `OPENAI_WRITING_MODEL`, `OPENAI_QUALITY_MODEL`, `OPENAI_ESCALATION_MODEL`. No model is assumed available or more capable based on its name. The escalation override is used only for the bounded revision/review path. Override-model prices are not inferred from the base model’s configured rates.

## Review interface

The existing prospect workspace contains recommended angle/rationale, source links and limitations, four subject/body editors, quality checks, individual copying, save-and-review, regeneration, rejection, exact-content approval and version/audit history. Unsaved edits disable copying/approval. Copying rechecks the backend before using the clipboard. HOLD/REJECTED reasons remain visible and controls stay blocked. Existing legacy draft-review links remain available for eligible legacy runs.

A separate authenticated **local development only** route `/sales-agent/development/drafts` shows explicitly fictional research-only fixtures. It is unavailable in Vercel Preview and Production and cannot approve, send, enroll, persist qualification or call providers. Operational views never substitute fictional contacts/drafts for missing live records.

## Live-connection prerequisites and limits

No external credentials were available in the coding workspace. Tests use controlled fictional provider/model responses. Real production HTTP adapters and OpenAI structured generation are reused, but no live HubSpot, Outreach, verification, research or OpenAI call is claimed verified by this delivery. Similarweb remains DATA_UNAVAILABLE; SerpApi access is optional. Existing historical coverage/complaint or independent employment/email verification gaps still mean HOLD, regardless of draft readiness.

To review with real data: configure existing Preview authentication/database/read-only integration and verification credentials through the authorized admin process; sync the fixed-owner contacts; populate externally approved Signal knowledge; complete research and authoritative eligibility checks; open the prospect workspace. It automatically prepares eligible drafts. Inspect citations, quality results and four messages; save edits, wait for review and approve exact content for review. Connect the authorized scheduler for closed-browser batches. No live meeting effectiveness or writing-quality outcome has been measured yet.

## Executed validation

- Prisma Client generation: passed (exit 0).
- TypeScript: passed.
- ESLint: passed without warnings.
- Full Vitest suite: 934 passed, 0 failed, 1 existing database-harness skip; 96 passed test files and 1 skipped file.
- Next.js production build: passed.
- Headless Chromium at 375, 768 and 1440 pixels: four editors, four copy controls and human approval controls present, with no horizontal overflow. Layout checks used isolated fictional fixtures.
- No live provider verification, database migration, CRM write, email send, enrollment or Production deployment was performed.

## Files changed

- `.env.example`
- `docs/draft-studio.md`
- `src/app/api/sales-agent/draft-studio/route.test.ts`
- `src/app/api/sales-agent/draft-studio/route.ts`
- `src/app/api/sales-agent/prospect-research/worker/route.ts`
- `src/app/sales-agent/development/drafts/page.test.tsx`
- `src/app/sales-agent/development/drafts/page.tsx`
- `src/app/sales-agent/prospects/[contactId]/page.tsx`
- `src/features/agent-workforce/dashboard/dashboard-client.tsx`
- `src/features/agent-workforce/dashboard/draft-studio-panel.test.tsx`
- `src/features/agent-workforce/dashboard/draft-studio-panel.tsx`
- `src/features/agent-workforce/development/synthetic-draft-preview.tsx`
- `src/features/agent-workforce/gate-a-contracts.ts`
- `src/server/agent-workforce/creative-agents.ts`
- `src/server/agent-workforce/dashboard/service.ts`
- `src/server/agent-workforce/draft-studio/engine.test.ts`
- `src/server/agent-workforce/draft-studio/engine.ts`
- `src/server/agent-workforce/draft-studio/worker.test.ts`
- `src/server/agent-workforce/draft-studio/worker.ts`
- `src/server/agent-workforce/evidence-validation.ts`
- `src/server/agent-workforce/http.ts`
- `src/server/agent-workforce/openai.test.ts`
- `src/server/agent-workforce/openai.ts`
- `src/server/agent-workforce/orchestrator.ts`
- `src/server/agent-workforce/prospect-research/worker.ts`
- `src/server/agent-workforce/store.ts`
- `src/server/integrations/contracts.ts`
