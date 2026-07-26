# Phase 7: Reply Intelligence and Objection Handling

## Scope

Phase 7 focused only on Reply to Prospect quality, objection handling, and reply safety. It continued from Phase 6 proof and case-study intelligence without changing HubSpot, auth, pricing configuration, the OpenAI model, deployment settings, or account-status behavior.

## Workflows Reviewed

- Reply to Prospect
- Draft refinement safety
- Approved knowledge retrieval for replies
- Conversation-stage protection for pasted LinkedIn or email threads
- Phase 6 proof selection and validation boundaries

## Changes Made

- Added a reply-intelligence layer that normalizes pasted conversation history into prospect, seller, and unknown turns.
- Added latest-prospect-message detection so the system answers the current prospect message instead of replying to an older deck or pricing request.
- Expanded prospect intent detection for pricing, fee structure, ROI/value, data sources, dashboards, internal tools, agencies, vendors, pause objections, referrals, wrong contact, vacation, priority/timing, declines, and mixed intent.
- Added per-intent response policies that are sent to the AI provider and also used by deterministic fallback behavior.
- Updated OpenAI reply prompting to use approved knowledge as source of truth while allowing general B2B knowledge only for tone, angle, and buyer concern framing.
- Strengthened fallback replies so safe output is still useful when OpenAI is unavailable or fails validation.
- Added output validation that blocks leaked internal labels, raw JSON, invented attachments, invented meetings, unsupported pricing figures, duplicate paragraphs, and missing direct answers for pricing or data-source questions.
- Strengthened draft-refinement safety for exact commercial figures and invented attachment/calendar/meeting commitments.

## Blocking and Warning Behavior

- Strong rejection produces a minimal stop response and does not keep selling.
- Pricing and fee questions answer the commercial basis without inventing prices, tiers, discounts, POCs, or ROI.
- Data-source questions must mention live Google and Bing search-result monitoring plus only approved Ads, Search Console, and conversion context.
- Dashboard or monitoring objections separate visibility from action logic.
- Agency and vendor objections do not attack the agency or vendor.
- Pause objections explain lower-bid mode as an alternative to full pausing.
- Long conversation histories preserve previous context but answer the latest prospect question first.

## Data and Safety Notes

- No live web research or scraping was added.
- No HubSpot work was started.
- No pricing model or commercial terms were changed.
- No secrets, environment files, generated Prisma client files, migrations, or customer data were committed.
- Phase 6 proof selection remains the gate for case-study use and metric mentions.

## Tests Added or Updated

- Added reply-intelligence unit tests for intent classification, conversation normalization, latest prospect detection, and unsafe output rejection.
- Added Reply to Prospect service tests for fee-structure, data-source, dashboard, pause, agency, strong rejection, and long-history follow-up cases.
- Added draft refinement safety tests for exact commercial figures and invented follow-up commitments.

## Verification

- `pnpm prisma:validate` passed.
- `pnpm prisma:generate` passed.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm test` passed: 267 passed, 1 skipped.
- `pnpm build` passed.

## Remaining Risks

- Medium: Unlabeled pasted conversations can still be ambiguous if seller and prospect messages are pasted without clear separation. The new heuristics reduce the risk but cannot perfectly infer every thread.
- Low: OpenAI can still return weak copy; validation now rejects unsafe output, and deterministic fallback keeps the workflow usable.
- Low: Industry-specific phrasing depends on approved knowledge and user-supplied context. No live web enrichment was added by design.
