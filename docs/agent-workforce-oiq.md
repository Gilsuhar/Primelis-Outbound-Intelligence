# Outreach Insight Quality (OIQ)

OIQ extends the existing Agent Workforce Quality Review Agent. It is an editorial heuristic for a **draft version's complete four-email thread**, not a prediction of replies, conversions or meetings. It never determines eligibility, suppression clearance or permission to send.

## Assessment and thresholds

The existing structured quality-review call now returns five bounded integer component scores, reasons, a core insight, evidence IDs, the result of a company-name substitution test, unsupported claims, missing core evidence and concrete improvement suggestions. The server computes the sum and decision; the model does not get to assign its own total or approval.

| Component                                            | Maximum |
| ---------------------------------------------------- | ------: |
| Company-specific insight                             |      30 |
| Verified supporting evidence                         |      25 |
| Relevance to the recipient's Search responsibilities |      20 |
| Commercially interesting angle                       |      15 |
| Natural writing and low-friction CTA                 |      10 |
| Total                                                |     100 |

- **85–100:** ready for human quality review, subject to every existing factual, eligibility, verification, history, suppression and approval gate.
- **65–84:** REVISE. The existing bounded rewrite/review cycle receives the score and concrete suggestions; no revision limit or budget is increased.
- **Below 65:** BLOCKED pending better research. Missing core evidence or unsupported facts also block at **any** score. Automatic rewriting does not attempt to invent missing evidence.

The closing email can rely on the insight established earlier in the thread. OIQ does not force all four messages to repeat the company fact, product explanation or CTA.

## Factual and personalization safeguards

The core insight must identify its email steps and trace back to a relevant company business-model, product, market or development fact. Company size, revenue, a job title or approved Signal wording alone do not establish a reason to contact this account. A cited company fact must actually appear in the selected email's assertion ledger and body; listing unused fact IDs cannot rescue generic copy.

References are resolved server-side from this run's exact quoted research sources or its authorized SERP observations. The model cannot invent reference URLs. The UI shows fact/observation IDs, source IDs, source links, observation dates and associated email steps. Unknown facts, absent source quotes, invalid research or missing/stale/uncited SERP evidence block approval. A single SERP cannot establish persistent competition or universal absence.

An absent optional SERP or Similarweb feed does not block a sourced business/recipient hypothesis that makes no unsupported advertising claim. If the core insight relies on an ad observation, its dated source is mandatory. Existing independent employment and Search-responsibility verification remain separate and mandatory for operational drafts.

The reviewer must explicitly ask whether swapping the company name leaves the message equally relevant. A failed substitution test flags weak personalization and caps company insight at 10/30 and commercial angle at 5/15: the total cannot exceed 70, however polished the copy. A draft without traceable company insight receives no company-insight or core-evidence points and is blocked. Missing core evidence receives no evidence points and cannot be outweighed by writing quality.

Existing factual accuracy, source grounding and approved-claim checks still apply. Unsupported assertions reported by the reviewer, including claims omitted from the writer's ledger, and deterministic unsupported-number/SERP/identity failures override the numerical threshold. A good core insight does not excuse a fabricated claim elsewhere in the sequence.

## Draft Studio, approval and history

Draft Studio displays the total, decision, five components with rationales, company-name substitution explanation, evidence references, blocking reasons and concrete improvements. It explicitly labels the score as an editorial heuristic. Unsaved edits and invalidated/locked content show the prior assessment as historical.

Each assessment is bound to a canonical content fingerprint covering the sequence identity, strategy, creative plan and messages, including citation/assertion metadata. Human edits clear the current critic and approval and schedule the existing quality-review stage. The old assessment remains attached to the earlier immutable draft version. A byte-identical regeneration preserves the historical assessment while the current assessment remains pending; history cannot authorize approval.

Server reads and content approval recheck the current assessment, component total, citations, factual checks and content fingerprint. Client-side button disabling is supplementary. A stored `PASS` or a manually inflated total is insufficient. Current eligibility/dependency checks continue before and after provider work. Changes to email, employment, history, suppression, approved knowledge or research still invalidate approval through the existing mechanisms.

Legacy JSON records without OIQ remain parseable. They are **not grandfathered into approval**: an unscored draft must be regenerated/reviewed, and an old approval lacking a current OIQ assessment is invalidated. No provider call occurs merely to read a legacy record. Older version history may display without a score.

All content remains review-first. `canSend`, `canEnroll` and automatic approval remain false. A HOLD or REJECTED contact cannot generate operational drafts even if an independently evaluated research example earns a high OIQ score.

## Controlled review-decision examples

These are synthetic acceptance tests with scripted reviewer judgments, **not a live OpenAI benchmark or measured sales results**.

| Example                                                                                    | Earlier quality label / proposed score | OIQ outcome                                                                                |
| ------------------------------------------------------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------ |
| HarborGrid trial/demo measurement inquiry, exact business/recipient sources, no SERP claim | Mocked PASS; components total 93       | **93, ready for human quality review**, subject to all gates                               |
| Generic Growth-role product pitch, with unused company fact IDs retained                   | Mocked perfect component scores        | **Below 65, BLOCKED**: the core company fact is not traceable to an assertion in the email |
| Interchangeable company-name framing despite available sources                             | Mocked 100                             | **70, REVISE** after the substitution caps; cannot be approved                             |
| Strong 93-point core insight plus an unsupported wasted-spend assertion elsewhere          | Mocked high components                 | **93, BLOCKED** by factual failure regardless of score                                     |
| Branded-ad insight citing absent/stale SERP evidence                                       | Mocked PASS                            | **BLOCKED**; optional-data absence cannot support a claimed observation                    |
| Exact scores of 85, 84, 65 and 64 with valid source support                                | Mocked PASS                            | Ready, REVISE, REVISE and BLOCKED respectively                                             |

Tests also cover unsupported percentages hidden from the assertion ledger, incorrect citations, bad quotes, future source dates, unchanged eligibility/sending restrictions, version history, human edits, legacy approvals and stale client PASS labels.

## Persistence, costs and limits

- Existing versioned run JSON and Draft Studio history hold the assessment; no Prisma schema change or migration is needed.
- No new agent, research provider, model stage, dependency or per-email call. OIQ is returned in the existing `QUALITY_REVIEW` structured response. Totals, source resolution, read/approval checks and content fingerprints run locally.
- Existing model/token limits, retry limits, budgets, locking and usage/cost accounting remain active. The extra instructions and response fields consume tokens, and a 65–84 score can invoke the existing bounded revision. No unverified billing or reply-rate claim is made.
- Semantic judgments about usefulness, entailment and natural language remain model-dependent. Narrow deterministic safeguards complement the independent critic and human review; the score is not proof of factual accuracy or live-provider readiness.

Validation uses synthetic fixtures and mocks only. No live provider calls, CRM writes, sends, enrollment, Production changes or deployed migrations are required. Database integration tests are intentionally skipped when running without an isolated test database. Exact executed check results and commit are recorded in the delivery response.

## Executed validation

- TypeScript: passed (`--noEmit --incremental false`).
- ESLint: passed with no warnings/errors.
- Full Vitest: **1,105 passed, 0 failed, 5 skipped**; 109 test files passed and the database-test file intentionally skipped. No deployed database was accessed.
- Production build: passed after the final history-preservation correction.
- Local Chromium: OIQ score, five components, source links, draft editing and no horizontal overflow verified at **375 / 768 / 1440 px**, using real components and explicitly synthetic transport/data. This is not deployed authentication or live-provider validation.
- Formatting and Git whitespace checks: passed.

The remote branch's newer documentation-only commit `93991ac768f44fcebda330fda1ad1c302e941933` is preserved. No application-code difference from the tested baseline was introduced by it.

## OIQ files changed

- `src/features/agent-workforce/dashboard/draft-studio-panel.test.tsx`
- `src/features/agent-workforce/dashboard/draft-studio-panel.tsx`
- `src/features/agent-workforce/gate-a-contracts.ts`
- `src/server/agent-workforce/business-quality.test.ts`
- `src/server/agent-workforce/creative-agents.ts`
- `src/server/agent-workforce/dashboard/service.ts`
- `src/server/agent-workforce/draft-studio/engine.test.ts`
- `src/server/agent-workforce/draft-studio/engine.ts`
- `src/server/agent-workforce/orchestrator.ts`
- `src/test/workforce-fixtures.ts`
- `docs/agent-workforce-oiq.md`
- `src/features/agent-workforce/dashboard/oiq-review.tsx`
- `src/features/agent-workforce/oiq-contracts.ts`
- `src/server/agent-workforce/oiq.test.ts`
- `src/server/agent-workforce/oiq.ts`
