# Phase 5 Account Research Quality Audit

Repository: `Gilsuhar/Primelis-Outbound-Intelligence`

Base production commit: `16e3be013ca05c5b3fa57916c88b95a0cba6d544`

## Scope

Phase 5 focused only on Account Research quality, evidence awareness, personalization safety, and filtered handoff into existing workflows.

No HubSpot integration was started. No live web research, scraping, paid enrichment provider, OpenAI model change, authentication change, schema migration, deployment, or push was performed.

## Current Account Research Architecture

Account Research is implemented through:

- `src/app/account-research/page.tsx`
- `src/app/account-research/actions.ts`
- `src/features/account-research/account-research-client.tsx`
- `src/features/account-research/account-research-policy.ts`
- `src/features/account-research/types.ts`
- `src/server/services/account-research-service.ts`
- `src/server/services/account-research-service.test.ts`

The service validates input, resolves the authenticated actor, checks suppression records, builds the assessment with deterministic policy logic, persists the assessment into the existing `AccountAssessment` JSON-backed fields, and returns structured output to the UI.

## Input And Trust Classification Map

| Field                          | Source                              | Trust level                                                            | Required or optional         | Passed to AI      | Stored     | Factual personalization        | Question or hypothesis only |
| ------------------------------ | ----------------------------------- | ---------------------------------------------------------------------- | ---------------------------- | ----------------- | ---------- | ------------------------------ | --------------------------- |
| Company name                   | User input                          | USER_PROVIDED                                                          | Required                     | Yes               | Yes        | No, unless separately verified | Yes                         |
| Company domain                 | User input or inferred UI helper    | USER_PROVIDED                                                          | Optional                     | Yes               | Yes        | No, unless separately verified | Yes                         |
| Industry                       | User input or approved ICP label    | USER_PROVIDED                                                          | Optional                     | Yes               | Yes        | No, unless approved internally | Yes                         |
| Market/geography               | User input                          | USER_PROVIDED                                                          | Optional                     | Yes               | Yes        | No                             | Yes                         |
| Revenue/employees              | User input or import                | USER_PROVIDED / IMPORTED_UNVERIFIED                                    | Optional                     | Yes               | Yes        | No                             | Yes                         |
| Branded ads active             | User selected fact status           | VERIFIED_APPROVED_INTERNAL / USER_PROVIDED / MODEL_INFERENCE / UNKNOWN | Optional                     | Yes when known    | Yes        | Only when verified             | Yes when not verified       |
| Organic visibility             | User selected fact status           | VERIFIED_APPROVED_INTERNAL / USER_PROVIDED / MODEL_INFERENCE / UNKNOWN | Optional                     | Yes when known    | Yes        | Only when verified             | Yes when not verified       |
| Brand demand                   | User selected fact status           | VERIFIED_APPROVED_INTERNAL / USER_PROVIDED / MODEL_INFERENCE / UNKNOWN | Optional                     | Yes when known    | Yes        | Only when verified             | Yes when not verified       |
| Paid-search owner              | User input                          | USER_PROVIDED                                                          | Optional                     | Yes               | Yes        | No                             | Yes                         |
| Current vendor/tool            | User input                          | USER_PROVIDED                                                          | Optional                     | Yes               | Yes        | No vendor claim allowed        | Yes                         |
| Trigger/pain                   | User input                          | USER_PROVIDED / MODEL_INFERENCE                                        | Optional                     | Yes               | Yes        | Only when verified             | Yes                         |
| Suppression/client/opportunity | User input plus suppression records | VERIFIED_APPROVED_INTERNAL when matched                                | Optional but safety-critical | Used for gating   | Yes        | Yes for blocking status        | No cold outreach if blocked |
| Approved ICP/persona knowledge | Playbook/approved internal data     | VERIFIED_APPROVED_INTERNAL                                             | System context               | Yes               | Referenced | Yes, within approved wording   | No                          |
| Imported enrichment rows       | CSV import path                     | IMPORTED_UNVERIFIED                                                    | Optional                     | Not automatically | Yes        | No                             | Yes after review            |

## Research Result Structure

The Account Research result now includes:

- Account summary
- Signal relevance
- Verified facts
- User-provided context
- Inferred context
- Likely opportunities
- Open questions
- Suggested stakeholders
- Recommended outreach angle
- Claims to avoid
- Evidence context
- Filtered downstream handoff

Inferences are phrased conditionally and are not returned as verified facts.

## Relevance Logic

The relevance assessment still returns only:

- Strong fit
- Possible fit
- Do not target
- Insufficient information

It uses supported signals such as branded-search activity, organic visibility, brand demand, paid-search ownership, multi-market complexity, meaningful paid-search investment, company scale context, and approved ICP industry evidence.

It does not create a numeric score and does not assert exact spend, CPC, competitor activity, bidding strategy, agency relationship, or inefficiency unless supplied as verified context.

## Stakeholder Logic

Stakeholder recommendations now separate:

- Primary stakeholder
- Secondary stakeholder
- Possible influencer
- Likely wrong contact

The system recommends roles, not actual employees. If the user provides a prospect role, the role is preserved and evaluated rather than replaced.

## Outreach-Angle Logic

Each assessment returns one primary angle and optional secondary angle with:

- Why it fits
- Supporting signal
- Safe opening question
- Claims to avoid
- Best proof category when available
- Recommended workflow

The default remains conservative branded-search efficiency until stronger context is verified.

## Claims-To-Avoid Behavior

Account Research now explicitly returns unsafe claims, including:

- Do not claim competitors are bidding without evidence.
- Do not claim CPC is rising without evidence.
- Do not claim wasted spend as a verified fact.
- Do not claim a specific Google bidding strategy.
- Do not claim current agency dissatisfaction.
- Do not claim paid search is centrally managed.
- Do not promise a specific saving percentage for this company.
- Do not claim a named vendor/tool unless supplied.

These are used as internal downstream guidance and shown concisely in Account Research.

## Downstream Handoff

Account Research now builds a filtered handoff for:

- Create Outreach
- Build Sequence
- Ask Signal Brain

The handoff uses simple existing fields rather than serializing the raw research object. Verified facts are separated from hypotheses in `internalNotes`, unknowns are omitted from factual context, and claims-to-avoid are passed as guidance.

## Import Behavior

The company/contact import path was reviewed and tested. Imported CSV rows remain enrichment or review data. Classification notes created during import are directional and are not labeled as approved knowledge or verified facts.

Malformed CSV rows, invalid domains, invalid URLs, invalid emails, formulas, duplicate rows, and missing headers continue to fail safely.

## Storage And Versioning

No schema change was required.

Research results continue to be persisted through the existing `AccountAssessment` fields:

- `inputSnapshot`
- `factStatuses`
- `qualificationResult`
- `confidence`
- `verifiedSignals`
- `assumptions`
- `missingInformation`
- `suppressionResult`
- `personaRecommendation`
- `angleRecommendation`
- `recommendedNextAction`

The fact trust map survives storage through the existing `factStatuses` JSON column. Stakeholder recommendations are nested into the existing `personaRecommendation` JSON column, and open questions, likely opportunities, claims-to-avoid, and downstream handoff are nested into the existing `angleRecommendation` JSON column.

The full `structuredResearch` object is returned by the service for UI use, but no new database column was added for it. No migration was added.

## UI Changes

The Account Research result now shows compact, scan-friendly sections for:

- What is known
- Use as questions
- Likely opportunities
- Claims to avoid
- Stakeholders
- Safe opening question

The existing card, spacing, typography, and responsive patterns were reused. No full redesign was performed.

## Tests Added

Updated:

- `src/server/services/account-research-service.test.ts`
- `src/server/services/company-contact-import-service.test.ts`

Coverage added for:

- User-provided context not treated as verified.
- Model inference not returned as verified fact.
- Unknown fields remaining unknown and excluded from factual downstream context.
- Stakeholder role categories without invented employee names.
- User-provided prospect role preserved.
- Conditional opportunities and safe opening questions.
- Competitor/CPC/spend/savings claims blocked unless evidenced.
- Filtered downstream handoff without internal trust-label leakage.
- Imported CSV classification remaining review-only and not approved knowledge.

## Defects Fixed

- Positive account signals were previously merged into `verifiedSignals` even when their source was user-provided or inferred. They now appear as verified only when the underlying field is verified.
- User-provided senior roles such as CMO are now preserved in the persona recommendation instead of being replaced by a fallback persona.

## Remaining Risks

### Critical

- None found.

### High

- None found.

### Medium

- Account Research still does not perform live web research in this phase, so real-world company facts must be supplied by the user, imports, approved knowledge, or later reviewed enrichment.
- Downstream workflows consume filtered query parameters and existing input fields; a future server-side assessment-id lookup could preserve richer context with less URL length pressure.
- Prisma integration tests remain skipped without a configured test database, so SQL persistence behavior is covered mainly through service tests.

### Low

- Some user-supplied context can still be imprecise. The output now labels it safely, but the seller still needs to review before sending.
- Imported enrichment notes use deterministic heuristics and should remain review-only until approved.

## Recommended Phase 6 Scope

- Add assessment-id based downstream handoff so Create Outreach, Build Sequence, and Ask Signal Brain can load filtered research context server-side.
- Add a signed-in browser QA pass for Account Research at 390px after production deployment.
- Add optional admin review flow for promoting selected imported or website-research facts into approved knowledge.
- Add provider diagnostics for OpenAI fallback and malformed-output rates.
