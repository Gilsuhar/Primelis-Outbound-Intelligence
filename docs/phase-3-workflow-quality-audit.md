# Phase 3 Workflow Quality Audit

Repository: `Gilsuhar/Primelis-Outbound-Intelligence`

Audit date: 2026-07-26

Base commits:

- `fed966a9384e9104beadb273fa795c6e3cd79a4f`
- `1c16cb157a980f28335a12947a21082a920ca6c6`

## Scope

This phase reviewed the existing generation workflows for unsupported-fact
prevention, verified versus unverified context separation, proof integrity,
conversation-history handling, output validation, and missing-context behavior.

No HubSpot integration work was started. No deployment or push was performed. No
new product area was added. Signal positioning and overall sales strategy were
not rewritten.

## Workflow Data-Flow Map

| Workflow | Input source | Verified | User-provided | May be missing | Allowed as factual statement | Passed to model | Stored |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Create Outreach | Company name, website, first name, role, industry, fit/ICP, market, paid-search context, vendor, trigger, tone, length | No, unless supplied as explicit user context | Yes | Some optional | Only as user-provided context or question | Yes, labeled as user context | Input snapshot and draft |
| Create Outreach | Approved knowledge records | Yes | No | Yes | Yes, when approved and sourced | Yes, as verified internal knowledge | Knowledge ids and source ids |
| Create Outreach | Approved case study | Yes | No | Yes | Yes, when exact approved claim is used | Yes, at most relevant approved proof | Knowledge ids and source ids |
| Build Sequence | Company, prospect, role, industry, fit/ICP, market, paid-search context, vendor, trigger, steps, tone, duration | No, unless supplied as explicit user context | Yes | Some optional | Only as user context or question | Yes, labeled as user context | Input snapshot and generated steps |
| Build Sequence | Approved knowledge and one case study | Yes | No | Yes | Yes, exact approved wording/metrics only | Yes, verified internal knowledge | Knowledge ids and source ids |
| Reply to Prospect | Full pasted conversation and latest prospect turn | No | Yes | Latest message required | As conversation context only | Yes, labeled as conversation/user context | Input snapshot and reply |
| Reply to Prospect | Approved product, objection, and message records | Yes | No | Yes | Yes, if source-backed and eligible | Yes, verified internal knowledge | Knowledge ids and source ids |
| Ask Signal Brain | Question, company, role, industry, vendor, paid-search context, trigger, notes | No | Yes | Optional except question/mode | Only as user-provided context | Yes, labeled as user context | Not persisted as generated draft |
| Ask Signal Brain | Approved playbook, knowledge, and case studies | Yes | No | Yes | Yes, with source references | Yes, verified internal knowledge | Not persisted as generated draft |
| Account Research | Company fields, website research, user fact statuses | Mixed by fact status | Yes | Yes | Only verified facts should be treated as verified; assumptions remain assumptions | No shared outbound prompt unless user carries result forward | Research result |
| Draft Refinement | Current draft, selected text, command, custom feedback | Current draft may contain approved-derived claims; feedback is not verified | Yes | Selected text/feedback optional | Feedback is not approved fact | Yes, separated from approved facts | Draft version |

## Verified Versus Unverified Boundaries

The OpenAI provider payload now separates:

- `verifiedInternalKnowledge`
- `userProvidedContext`
- `approvedFacts`
- `sources`
- `unknownOrUnverifiedPolicy`

User-entered company, prospect, market, vendor, and free-text context is allowed
to guide phrasing, but it is not promoted into approved Primelis knowledge.
Draft Refinement no longer merges custom feedback into `approvedFacts`.

## Unsupported-Fact Risks Found

Confirmed risks:

- The shared OpenAI response schema allowed empty `primaryContent`, so a
  malformed but schema-valid response could be treated as a generated draft.
- Build Sequence could accept a successful OpenAI call that returned no usable
  `sequenceSteps`, causing deterministic content to remain without an explicit
  provider failure.
- Draft Refinement compacted user feedback into `approvedFacts`, blurring the
  boundary between approved knowledge and user instruction.
- Some deterministic fallback wording could sound like the app had verified a
  company-specific condition, such as organic ownership or CPC pressure.

## Unsupported-Fact Defects Fixed

- Added workflow-aware OpenAI output validation. Non-sequence workflows require
  usable primary content; Build Sequence requires usable sequence steps matching
  the requested length.
- Added service-level output validation for Create Outreach and Reply to
  Prospect so empty generated drafts or internal prompt labels are rejected
  before persistence.
- Separated Draft Refinement user feedback into `userProvidedContext`.
- Tightened fallback wording so missing account evidence is expressed as a
  question or condition instead of a verified account claim.

## Proof Integrity Findings

Phase 2 already tightened approved-only retrieval. Phase 3 confirmed that Build
Sequence still applies the one-case-study prompt boundary and validates against
  multiple proof companies appearing in one generated sequence.

OpenAI instructions continue to require exact approved metrics for named
customers, savings percentages, MQLs, SQLs, revenue, clicks, CPC, CTR, CVR, and
conversion claims. No new broad proof-selection behavior was introduced.

## Conversation-History Findings

Reply to Prospect already extracts the latest prospect turn and detects cases
where a deck and commercials were already discussed. Existing regression tests
cover the NinjaTrader-style thread, pricing/commercial follow-up, Revvim,
methodology questions, deck requests, and repeated-commercials prevention.

Phase 3 preserved that behavior and added output rejection for empty replies.

## Output-Validation Findings

Validated:

- OpenAI malformed or empty output fails safely.
- Build Sequence must return the requested number of usable steps.
- Create Outreach must have non-empty public draft content, a CTA, and email
  subjects where email is selected.
- Reply to Prospect must have non-empty recommended and shorter replies.
- Internal prompt labels are blocked from Create Outreach and Reply user-facing
  output.

Existing Build Sequence validation still checks step count, step order, allowed
channels, duplicate/near-duplicate bodies, low-pressure final step, commercial
terms, competitor claims, and multiple proof-company leakage.

## Fallback Behavior

Deterministic fallback remains available when OpenAI is not configured. If
OpenAI is configured but fails during Build Sequence, the service returns an
explicit `AI_PROVIDER_FAILED` result instead of silently presenting the fallback
as successful OpenAI output.

Fallback copy was adjusted only where it implied unsupported account facts.

## User-Facing Errors Reviewed

Reviewed error paths:

- Validation error
- Authorization denied
- Account-status block
- OpenAI provider failure
- Malformed AI response
- Generation rejected by safety/quality validation
- No approved eligible knowledge

No redesign was performed. Existing structured error conventions were reused.

## Tests Added Or Updated

- `src/server/services/ai-provider.test.ts`
- `src/server/services/create-outreach-service.test.ts`
- `src/server/services/reply-to-prospect-service.test.ts`
- `src/server/services/draft-versioning-service.test.ts`

Targeted coverage added for:

- Empty OpenAI primary content
- Build Sequence OpenAI output without usable sequence steps
- User context separated from verified internal knowledge in the OpenAI payload
- Draft Refinement user feedback separated from approved facts
- Empty Create Outreach provider output rejected before persistence
- Empty Reply to Prospect provider output rejected before persistence
- Missing account evidence not converted into asserted Nike company facts

## Defects Fixed

Unsupported-fact defects:

- User-provided refinement feedback was no longer mixed into approved facts.
- Fallback account wording now uses questions and conditions when evidence is
  missing.
- Empty or internally labeled output is rejected instead of stored.

Proof-integrity defects:

- Create Outreach case-study row mapping now carries `approvalStatus` through
  the service eligibility boundary.
- No new metric mixing was found in this phase.

Conversation-history defects:

- No new conversation-history defect was found. Existing NinjaTrader/commercial
  follow-up behavior was preserved.

Output-validation defects:

- Empty non-sequence OpenAI output now fails safely.
- Build Sequence OpenAI output without matching sequence steps now fails safely.

## Remaining Risks

Critical:

- None found.

High:

- None found.

Medium:

- Prisma integration tests remain skipped without a configured test database, so
  SQL behavior is validated mainly by service tests in local QA.
- The AI provider cannot verify real-world public company facts because no web
  research provider is in scope. Well-known company/category knowledge must stay
  cautiously phrased unless supplied by approved knowledge or explicit user
  context.
- Account Research can mark fields as `USER_PROVIDED`; downstream workflows
  still rely on users and selected fields carrying that distinction clearly.

Low:

- Deterministic fallback is intentionally conservative and can still sound less
  polished than live OpenAI output.
- Some proof relevance decisions are keyword/rank based rather than fully
  semantic.

## Recommended Phase 4 Scope

- Add database-backed Prisma integration tests for generation retrieval filters.
- Add a provider diagnostics view for OpenAI malformed-output rate, fallback
  rate, and model status.
- Add more reply-behavior fixtures for common objections without building a large
  hardcoded objection library.
- Add optional evidence-aware account context chips so sellers can see which
  fields are user-provided versus verified before generating.
