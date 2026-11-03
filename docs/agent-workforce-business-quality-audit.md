# Agent Workforce business-quality audit

Baseline: published `730241d128ba49e608bf205e1d9a64663314a2bb`, branch `feature/agent-workforce-foundation`. The local baseline has the identical Git tree (`068ade61772d72f2d4bd4255669f4927ed39cf0d`). This is an offline quality audit. No live provider calls, Vercel configuration/access, database access, migrations, real prospect records, sending or enrollment are involved.

## What the evidence establishes

The examples below are **human-authored, explicitly synthetic golden targets**, not outputs obtained from a real OpenAI call. They exercise the actual schemas, qualification, source/quote validation, strategy/writer/reviewer boundaries, deterministic quality checks, ordering and draft gates with controlled model responses. They establish acceptance behavior, not live writing quality, conversion performance or meeting probabilities. No fictional evidence is loaded into operational views or storage.

The application continues to use its existing server-side LLM for original writing. No production email-template library, vertical-specific email generator, new provider, database table or paid dependency was introduced.

## Problems and corrections

| Finding                                                                                           | Improvement                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strategy could cite a job title alone and still advance to writing                                | Require cited company business context plus verified prospect relevance. A title alone produces INSUFFICIENT_EVIDENCE before a writing call. Eligibility remains a separate gate.                                                                  |
| Prompts allowed plausible business commentary without testing whether it earns a reply            | Shared commercial rubric asks: why this company, why this person, which branded-search decision, which supporting evidence, and why reply? Generic growth news is context, not a campaign diagnosis.                                               |
| Existing mock sequences repeated the same business statement and product pitch in all four emails | Replace the weak test double with distinct touches. Check repeated substantive sentences across messages; bounded revision still requires a separate factual/commercial critic.                                                                    |
| Draft Studio guidance prescribed a progression while other instructions promised creative freedom | Remove the contradictory mandatory progression. Evidence and four-touch delivery remain strict; tone, length, narrative, supporting angles and CTA wording remain contextual.                                                                      |
| Some obvious invented or overgeneralized SERP statements relied entirely on the model critic      | Detect uncited first-person ad-observation claims and universal/persistent advertiser assertions. One observed snapshot cannot establish sustained activity, universal absence or savings.                                                         |
| Strategy equality depended on JSON property insertion order                                       | Compare structured values rather than string serialization, preserving identity and every strategy value.                                                                                                                                          |
| Queue order did not reflect the strength of a reviewed opportunity                                | Use categorical evidence tiers, described below; never invent conversion or meeting-likelihood numbers.                                                                                                                                            |
| Company discovery, extraction and grounding repeated for another contact at the same account      | Reuse fresh reviewed public company quotations within the same operator, company identity and target market. Preserve original observation times and clamp expiry; contact research, strategy, final grounding and eligibility remain independent. |

## Synthetic persona assessment

| Fictional persona                                            | Verified fixture context                                                                                       | Strongest defensible conversation                                                                                   | Decision                                                                       |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Maya Chen, Head of Global Paid Search, CedarTrail Outfitters | Direct UK/German retail stores; explicit Search bidding-policy remit; one UK mobile brand-ad snapshot          | Coverage rules by market; obtain separate German evidence before comparing conditions                               | READY in isolated qualification fixture; opportunity is not proof of waste     |
| Elliot Reed, VP Growth, HarborGrid                           | Self-service trial and enterprise demo paths; independently corroborated Search acquisition and pipeline remit | Incrementality measurement for distinct intent/journeys, rather than attributing every branded visit to acquisition | READY in isolated fixture; no SERP or Similarweb assumed                       |
| Nadia Brooks, CMO, Meridian Ledger                           | Savings and mortgage journeys; explicit Search-investment and measurement-policy oversight                     | Protection boundaries and acquisition policy, addressed at executive level rather than assuming daily bid operation | READY in isolated fixture; no compliance-product capability or savings promise |
| Jordan Vale, Senior Paid Social Manager                      | Paid Social only, Search responsibility explicitly absent                                                      | NO_PITCH                                                                                                            | REJECTED; no draft                                                             |
| Sam Rivera, relevant Search leader                           | Strong account evidence and a dated snapshot, but historical coverage/complaint authority incomplete           | Useful research opportunity; resolve historical evidence first                                                      | HOLD; no draft regardless of priority                                          |

READY above denotes the existing engine's isolated contact qualification result. It is not outreach approval, live historical authority, or permission to send. All example sequences remain unapproved with sending and enrollment disabled.

## Before and after: research and outreach

The **before** examples describe the previous test baseline and code behavior, not a live model experiment. The old mock gave every company an outdoor-retail premise and repeated its opener across the sequence. The new targets expose that weakness instead of treating a mocked PASS as evidence of commercial quality.

**Research/strategy before:** “The company sells directly online. The verified role concerns paid search.” This establishes broad relevance but does not identify a decision or useful next exchange. A position-only citation could also advance.

**Research/strategy after, SaaS:** HarborGrid's sourced trial/demo distinction and Elliot's verified Search/pipeline remit support a question about separating navigational intent from enterprise evaluation. Current campaign setup, brand-query mix and incrementality are unknown. No competitor activity, traffic estimates or wasted spend are asserted. The discarded competitor-defense angle lacks an observed competitor ad. The useful reply is the buyer's perspective on the measurement distinction, not an immediate demo commitment.

**Outreach before, old mock:** “Test Company sells outdoor equipment through its online store. Signal monitors branded search conditions. Business context: would a short discussion be useful?” Subsequent touches repeated the first two sentences and changed the purpose label.

**Outreach after, SaaS golden sequence:**

1. Subject: **Brand search and the demo journey**

   I would separate trial intent from enterprise evaluation before debating brand-search efficiency. HarborGrid offers a self-service analytics trial and a separate enterprise demo journey. I do not know how those paths are measured today, but that distinction might be a useful starting point. Is it relevant to how you evaluate branded Search?

2. Subject: **Re: Brand search and the demo journey**

   The practical question for me would be which brand queries deserve protection even when other advertisers are not visible. Product evaluation and navigation may call for different decisions; that is a hypothesis to test, not a finding about your campaigns. Would a brief outline be useful?

3. Subject: **Re: Brand search and the demo journey**

   Could a brand-search test be judged on incremental qualified pipeline rather than the paid channel's reported conversions alone? That would need your own measurement design and data. If that is relevant, I would be interested in your perspective.

4. Subject: **Re: Brand search and the demo journey**

   No need to make time if this sits outside your current priorities. I will leave the measurement question with you.

Other reference openings deliberately use different premises:

- **E-commerce:** “CedarTrail Outfitters sells outdoor equipment directly through UK and German online stores. I would be curious whether brand coverage decisions differ between them. One UK mobile snapshot cannot tell us how Germany behaves, or whether either market is overspending.”
- **Financial-services CMO:** “Which journeys would you want to protect regardless of a brand-search efficiency test? Meridian Ledger offers UK savings accounts and mortgage applications through separate online journeys. I would start with that protection boundary, rather than assume every branded visit should be treated alike.”

The complete three reference sequences and their exact evidence/strategy mapping are in `src/test/workforce-quality-fixtures.ts`. They are never supplied to production prompts as interchangeable templates.

## Opportunity ordering

`OBSERVED_SIGNAL` → `GROUNDED_HYPOTHESIS` → `RESEARCH_REQUIRED` → `NO_PITCH`. These are evidence-strength categories, **not** numerical performance predictions or eligibility decisions. Rejected contacts remain after non-rejected candidates in the queue; filtering and all existing workflows remain intact.

A promotable opportunity requires current, quoted sources, completed assessment/review, cited company context, corroborated prospect responsibility and a useful reviewed hypothesis. Cited SERP observations must be current and belong to the run. An observed advertiser is not automatically a competitor. Low confidence, title-only support, missing citations, failed reviews or expired sources downgrade priority.

The dashboard uses the latest matching full research record, not its truncated source preview, to evaluate citations. A high-priority HOLD contact may appear above an eligible but weaker hypothesis; it still cannot generate operational drafts. No priority field is consulted by qualification, suppression, historical clearance or human approval.

## Efficiency and boundaries

- Existing per-contact idempotency, batch cursors, retry limits, draft dependency hashes and regeneration limits remain unchanged. No bulk prompt combines different contacts.
- A safe company reuse skips three normal model operations: discovery/web search, account extraction and the company grounding critic. It also avoids the corresponding public-page reads. The existing final research grounding still runs for the new person.
- Reuse requires the same actor-scoped store, exact company name/domain and market, completed reviewed company evidence, unexpired run and public sources younger than 24 hours. Private/provider-person sources, mismatched identity, broken quotes, stale/future observations and personal context are refused. Only account facts and exact quotations are copied, with original source times and no expiry extension. The stage records `COMPANY_REUSED`; a visible limitation states that this stage did not verify new developments or firmographics.
- No person research, eligibility, email/employment verification, history, SERP observations, drafts or approval for another person are reused. A cache miss follows the existing bounded research path. Reuse is limited to the existing store's recent actor-scoped run window; it is not a new global company cache.
- No new paid request stages, providers or dependencies. Stronger checks can invoke the existing bounded revision where weak copy previously passed. The rubric adds prompt tokens to existing calls, which the unchanged token/cost ledger records. Actual net billing savings require provider measurements; the tests establish skipped operations, not dollar savings.

## Acceptance and limitations

Coverage includes five personas, three distinct editorial goldens, actual qualification outcomes, title-only refusal, unsupported savings, invented ad observations, misleading persistent/absence SERP statements, generic compliments, empty follow-ups, repeated substantive sentences, bounded revision despite a mocked PASS, priority independent of eligibility, full-source ranking, cache freshness/identity/privacy and cross-operator isolation. Existing tests continue to cover budgets, approval invalidation, suppression, provider failure and duplicate requests.

Narrow deterministic checks do not prove semantic entailment or commercial excellence. The independent critic must still inspect all text, including misleading questions and claims omitted from the assertion ledger. Human review remains mandatory. No live provider evaluation, deliverability check, conversion experiment or ten-prospect creative-diversity assessment was performed. Existing live integration and historical-authority blockers from the production-readiness audit remain unresolved.

The full suite is run without `TEST_DATABASE_URL`: the five isolated PostgreSQL tests intentionally skip so this task never accesses a database. Final command results and commit are recorded in the delivery response.

## Executed validation

- TypeScript (`tsc --noEmit --incremental false`): passed.
- ESLint: passed with no remaining warnings/errors.
- Full Vitest: **1,073 passed, 0 failed, 5 skipped**, across 109 files (108 passed, one database-test file skipped). The 43 added cases cover business quality, opportunity ordering and safe company reuse.
- Final prompt follow-up: 32 relevant tests passed after the last editorial clarification; these are part of the suite, not additional distinct cases.
- Production build: passed; repeated after the final prompt clarification before committing.
- Formatting and Git whitespace checks: passed.

No database, live-provider or deployed-browser result is implied by these commands.

## Changed files

- `src/features/agent-workforce/dashboard/contracts.ts`
- `src/server/agent-workforce/creative-agents.ts`
- `src/server/agent-workforce/creative-intelligence.test.ts`
- `src/server/agent-workforce/dashboard/service.test.ts`
- `src/server/agent-workforce/dashboard/service.ts`
- `src/server/agent-workforce/evidence-validation.ts`
- `src/server/agent-workforce/orchestrator.ts`
- `src/server/agent-workforce/prospect-research/engine.test.ts`
- `src/server/agent-workforce/prospect-research/engine.ts`
- `src/server/agent-workforce/research-agents.ts`
- `src/test/workforce-fixtures.ts`
- `docs/agent-workforce-business-quality-audit.md`
- `src/server/agent-workforce/business-quality.test.ts`
- `src/server/agent-workforce/commercial-quality.ts`
- `src/server/agent-workforce/company-reuse.test.ts`
- `src/server/agent-workforce/company-reuse.ts`
- `src/server/agent-workforce/opportunity-priority.ts`
- `src/test/workforce-quality-fixtures.ts`
