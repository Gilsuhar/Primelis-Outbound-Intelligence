# Signal Agent Workforce — implementation contract

Status: approved product direction; **not yet implemented**. Branch: `feature/agent-workforce-foundation`. This document is the source of truth for the next implementation, not a claim that integrations exist.

## North star
A daily, evidence-led multi-agent sales workflow for Primelis Signal. The user supplies accounts and optionally prospects. Agents research companies, identify and verify additional relevant prospects where permitted, investigate brand-search signals, select a grounded sales angle, and write a **fresh, prospect-specific** four-email sequence. The user approves prospect selection and exact sequence content before any Outreach write. Outreach owns scheduling, sending and engagement tracking.

**Do not rebuild Primelis Outbound, add more canned email templates, or present deterministic fixture generation as autonomous research.**

## Core pipeline
1. **Daily intake**: account domain, optional provided prospect identifiers, campaign constraints, owner and run date. Support manual entry and daily queue ingestion; deduplicate by account/person/run.
2. **Account research agent**: research business model, relevant products/markets, growth/search context and dated source links. Every claim carries evidence and confidence; unavailable sources remain unavailable.
3. **Prospect discovery agent**: verify user-provided people; optionally suggest more from authorized providers. Keep suggested prospects in a separate PENDING_APPROVAL state. Never silently contact them.
4. **Brand SERP investigator**: collect verifiable brand-query observations with market, device, timestamp and capture/source; separate single snapshots from persistent patterns. Never infer savings, CTR or competitor activity without sufficient evidence.
5. **Sales strategist**: choose a defensible hypothesis and angle (competitor defense, spend efficiency, incrementality, or another evidence-supported angle), or NO_PITCH if evidence is insufficient. Explain why the chosen angle is better than alternatives.
6. **Sequence architect (LLM)**: generate four individually written emails per prospect, not template substitutions. Use research and strategy as inputs; maintain narrative progression, differentiated hooks and low-friction CTAs. Do not claim unseen data or unapproved customer outcomes.
7. **Evidence/quality critic**: check factual grounding, contact relevance, duplicate angles, specificity, readability, sales quality and approved proof scope. Revise if needed, otherwise HOLD.
8. **Human review**: show research, citations, proposed prospects, strategy rationale, four editable emails and review flags. Approval must be explicit, actor-attributed and tied to an immutable content version.
9. **Outreach handoff**: after explicit approval and fresh suppression/contact-history checks, map prospect + personalized sequence content + step timing into authorized Outreach objects. Verify API support for sequence creation/step editing/enrollment first; never assume one sequence per prospect is supported by the account. If unsupported, use a separately approved compatible strategy; do not silently fall back to shared templates. Idempotent writes, dry run, audit trail and reconciliation are mandatory.
10. **Feedback loop**: ingest engagement results when permitted, learn which evidence-backed approaches perform, without auto-changing approved sends.

## State and data contracts
- `DailyRun`: id, owner, input accounts, scheduled date, stage/status, cost/usage, retry metadata.
- `AccountBrief`: domain, market, verified facts, sources, search observations, missing evidence, updatedAt.
- `ProspectCandidate`: person/company identity, source, role, verification, suppression/history, origin (user/provider), approval status.
- `SalesHypothesis`: angle, supporting evidence IDs, alternative angles, uncertainties, no-pitch decision.
- `PersonalSequence`: prospectId, four message drafts, subject/threading, suggested delays, evidence mapping, version, quality review, status.
- `Approval`: actor, approved version hash, timestamp, explicit scope (prospect + sequence + Outreach handoff).
- `OutreachHandoff`: idempotency key, target object IDs, step mapping, result/error, audit log.

Statuses: QUEUED → RESEARCHING → NEEDS_EVIDENCE / NEEDS_PROSPECT_APPROVAL / READY_FOR_REVIEW → APPROVED → HANDOFF_PENDING → SYNCED / HANDOFF_FAILED. REJECTED and NO_PITCH are terminal for the current version. Approval invalidates when content materially changes.

## Guardrails
- Source-grounded claims only; uncertainty is visible. No invented SERP checks, verified emails, approved case studies, savings or meeting promises.
- Provider permissions, account scope, retention and privacy requirements are respected. No scraping behind access controls.
- Respect existing qualification, independent verification, suppression, opt-out, opportunity and four-calendar-month reengagement rules. Unknown history means HOLD.
- Never send/enroll from demo mode. Production sending stays disabled until Outreach capabilities, explicit permissions and approval workflow are verified.
- Use a real LLM provider for strategy/creative generation and real authorized research connectors. Deterministic fixtures and templates are tests, not the production intelligence path.
- Preserve existing working auth, Preview deployment and `main`. New work stays on feature branch until reviewed.

## UX contract
Daily queue of accounts/prospects; concise per-prospect research brief; visible source links and timestamps; recommended angle; **four editable emails**; approve/reject controls; handoff and Outreach status. Use distinct restrained accent colors to distinguish **sales angles** (not invented factual confidence). Clearly separate suggested from approved prospects. Mobile review must be usable.

## Delivery order and acceptance gates
**Gate A — real intelligence on one manually entered account + prospect:** select a real authorized LLM and research source; run actual research, source-backed strategy, unique four-email generation and critic; persist outputs. Prove that two different prospects produce meaningfully different sequences. No Outreach writes.
**Gate B — daily queue + prospect discovery:** scheduled/retriable jobs, deduplication, source-linked candidate suggestions, separate prospect approval, costs and audit logs.
**Gate C — Outreach integration:** inspect connected account's API scopes/object semantics and available sequence capabilities; implement dry-run and preview; verify approved content maps to correct prospect, sequence, steps and timing; only then allow approved handoff.
**Gate D — production hardening:** integration tests against authorized sandbox accounts, error recovery, audit, monitoring and deployment review.

## Immediate implementation prerequisites
1. Inspect existing app's auth, Prisma schema, qualification, evidence store, provider adapters and approved-proof library. Reuse, don't duplicate.
2. Determine the available LLM provider/key via secure configuration; do not hardcode secrets.
3. Confirm which real research connectors and Outreach API permissions are available; label blocked integrations explicitly.
4. Implement Gate A on this branch and demonstrate **actual** model-generated, citation-grounded output. A new UI alone does not satisfy Gate A.

## Success metric
For a supplied real company and real prospect, the user can review dated sources, understand the chosen angle, see four original non-repetitive emails, approve or reject them, and identify every unsupported claim. Later, an approved prospect-specific sequence is correctly represented in Outreach without the app sending mail itself.
