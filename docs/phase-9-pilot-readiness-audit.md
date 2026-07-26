# Phase 9 Pilot Readiness Audit

## Scope

Phase 9 reviewed Primelis Outbound Intelligence for a controlled internal pilot with a small authenticated Primelis team. The review continued from Phase 8 and did not add HubSpot work, web research, scraping, analytics, automated sending, external integrations, pricing changes, authentication architecture changes, OpenAI model changes, or broad prompt rewrites.

This phase is documentation and readiness only. No product code changes were required because no confirmed critical pilot blocker was found in the local code and automated test pass.

## Starting State

- Branch: `main`
- Phase 8 commit: `95ee074b05608316677418bc3e86ea6a533c6940`
- Phase 8 short hash: `95ee074`
- Phase 8 message: `feat: improve signal playbook and onboarding`
- Working tree before Phase 9: clean
- Application build before Phase 9: passed

## Environment Tested

- Local repository checkout
- Fixture-backed local/test mode where `DATABASE_URL` is unavailable
- Automated unit, component, service, auth, import, proof, and build checks
- No production data was used
- No real prospect data was committed
- No secrets or environment files were committed

Authenticated browser QA could not be completed safely inside this environment because there was no legitimate signed-in Supabase `SALES_USER` and `KNOWLEDGE_ADMIN` browser session or test credentials available to this task. The app correctly relies on Supabase Auth and the application `User` table. This audit does not fake signed-in route access.

## Pilot Roles

### SALES_USER

Should see:

- Home
- Signal Playbook
- Account Research
- ICP Insights
- Create Outreach
- Build Sequence
- Reply to Prospect
- Ask Signal Brain
- Do Not Contact

Can perform:

- Research accounts
- Check do-not-contact status
- Generate outreach, sequences, replies, and Signal Brain answers
- Refine generated drafts
- Submit generated drafts for review where the workflow exposes that action
- Use approved knowledge and approved proof only

Must not see:

- Knowledge Library
- Add Knowledge
- Review Queue
- Imported Signal Review
- Claim Details
- Account Import
- Do Not Contact Import
- Admin-only evidence inspection
- Restricted, archived, rejected, draft, or needs-review knowledge in generation-facing retrieval

### KNOWLEDGE_ADMIN

Should see:

- All sales routes
- Knowledge Library
- Add Knowledge
- Review Queue
- Imported Signal Review
- Account Import
- Do Not Contact Import
- Claim Details

Can perform:

- All sales actions
- Review and transition knowledge records
- Approve, restrict, reject, archive, or return records to review according to the transition matrix
- Manage sources
- Review imported Signal records
- Run import workflows against safe test files

Must preserve:

- Source requirement for factual approval
- Final-source removal block for approved factual claims
- Restricted content separation
- Server-side authorization on admin actions

## Routes Reviewed

Public/auth routes:

- `/login`
- `/auth/callback`

Sales routes:

- `/`
- `/playbook`
- `/account-research`
- `/icp-insights`
- `/create-outreach`
- `/build-sequence`
- `/reply-to-prospect`
- `/ask-signal-brain`
- `/do-not-contact`

Admin routes:

- `/knowledge-library`
- `/add-knowledge`
- `/review-queue`
- `/imported-signal-review`
- `/account-research/import`
- `/do-not-contact/import`
- `/claims/[claimId]`

The route model was checked against `src/lib/private-preview-auth.ts`, page-level `requireCurrentUser` / `requireRole` usage, `src/lib/navigation.ts`, and `src/components/app-shell.tsx`.

## Browser QA Status

Required signed-in viewports:

- 390 x 844
- 768 x 1024
- 1440 x 900

Actual result:

- Authenticated browser routes reached: none
- Reason: no legitimate signed-in Supabase pilot sessions or test credentials were available in this task
- Unauthenticated route and build-level checks remain valid
- Manual signed-in checklist created in `docs/pilot-smoke-test-checklist.md`

This remains a condition before inviting the pilot team.

## Sales Workflow Coverage

Automated coverage exists for:

- Account Research fit, insufficient information, suppression, unknown fields, persona categories, claims to avoid, and downstream handoff
- Create Outreach approved-only retrieval, channel restrictions, optional proof, unsupported fact handling, persona variation, fallback behavior, empty-output rejection, and draft persistence
- Build Sequence suppression blocking, approved-only retrieval, one-case-study proof rules, duplicate-step rejection, persona/tone variation, fallback behavior, and generated-draft separation
- Reply to Prospect latest-message handling, fee structure, data-source questions, dashboard objection, lower-bid alternative, agency objection, strong rejection, long-history follow-up, and commercial repetition blocking
- Ask Signal Brain approved-only retrieval, pricing/POC blocking, ICP/persona answers, proof guidance, unsupported-claim catching, and deterministic fallback
- Draft refinement versioning, provider failure preservation, cross-user draft access, and internal-label/safety checks
- Do Not Contact search, empty states, imported suppression merge, and account-status blocking

Manual signed-in pilot verification is still required for copy buttons, loading states, duplicate submission UX, paragraph spacing, mobile menu behavior, and sign out.

## Admin Workflow Coverage

Automated coverage exists for:

- Admin route policy
- Admin navigation scoping
- Sales users blocked from admin review actions
- Status transition matrix
- Approval source requirement
- Final-source removal block for approved factual claims
- Review history creation on successful transitions
- Imported Signal review policy, bulk approval limits, missing approved wording, restricted usage, source filters, and competitor-related approval safety
- Knowledge library filtering
- Add Knowledge validation
- Claim detail restricted/missing-source flags
- Company/contact import and suppression import authorization and validation

Manual signed-in pilot verification is still required for complete admin browser workflows using designated test records.

## End-to-End Pilot Scenarios

These scenarios should be executed with anonymized or fixture-safe inputs during the pilot smoke pass.

### Scenario A: New account with limited information

Input:

- Company name only
- No verified competitor, CPC, spend, or proof context
- Run Account Research, Create Outreach, and Build Sequence

Expected:

- No invented competitor bidding
- No invented spend, CPC, savings, or employee names
- Conditional language only
- No forced proof
- Clear claims to avoid

Coverage:

- Covered by Account Research, Create Outreach, and Build Sequence service tests
- Browser execution pending

### Scenario B: Strong ecommerce fit

Input:

- Ecommerce/fashion or retail company
- Paid Search or Performance persona
- Optional approved case study requested

Expected:

- Practical branded-search efficiency angle
- Industry-relevant proof if available
- At most one approved case study
- Metrics tied to the correct customer
- No guarantee language

Coverage:

- Covered by proof policy and Build Sequence/Create Outreach proof tests
- Browser execution pending

### Scenario C: B2B lead-generation account

Input:

- B2B SaaS or lead-generation account
- Growth, demand generation, or paid search persona

Expected:

- B2B-relevant proof only
- Lead-related metrics remain correctly attributed
- No ecommerce assumptions
- No unapproved MQL/SQL claims unless sourced

Coverage:

- Covered by approved proof filtering and service-level safety tests
- Browser execution pending

### Scenario D: Existing dashboard objection

Input:

- Prospect says they already have a dashboard or auction insights view

Expected:

- Answer monitoring versus action directly
- Do not criticize their current dashboard
- Do not restart the full pitch
- Soft next step

Coverage:

- Covered by Reply to Prospect tests
- Browser execution pending

### Scenario E: Agency handles it

Input:

- Prospect says an agency manages branded search

Expected:

- Position Signal as complementary
- Do not criticize the agency
- Ask a process question
- No unsupported assumptions

Coverage:

- Covered by Reply to Prospect tests
- Browser execution pending

### Scenario F: Does not want to pause branded ads

Input:

- Prospect objects to pausing branded ads

Expected:

- Explain lower-bid mode as an alternative
- Preserve technical accuracy
- Keep tone low-pressure

Coverage:

- Covered by Reply to Prospect tests
- Browser execution pending

### Scenario G: Pricing or fee structure

Input:

- Prospect asks how commercials work

Expected:

- Answer directly with approved pricing/commercial information only
- Do not invent package prices or terms
- Propose a review only after answering

Coverage:

- Covered by Reply to Prospect commercial-question tests
- Browser execution pending

### Scenario H: NinjaTrader-style advanced follow-up

Input:

- LinkedIn thread where deck was already sent
- Pricing or value already explained
- Prospect needs next-step help after multiple seller messages

Expected:

- Do not resend or re-explain the deck
- Do not repeat pricing
- Do not restart the pitch
- Recommend a concise walkthrough, pressure-test, technical review, or focused discussion
- Respect conversation history

Coverage:

- Covered by Reply to Prospect latest-turn and long-history follow-up tests
- Browser execution pending

### Scenario I: Polite decline

Input:

- Prospect says it is not relevant or timing is wrong

Expected:

- Short, respectful reply
- No objection fighting
- No aggressive follow-up

Coverage:

- Covered by strong/polite rejection reply behavior
- Browser execution pending

### Scenario J: Strong rejection

Input:

- Prospect strongly rejects the outreach

Expected:

- Minimal respectful response
- No continued selling

Coverage:

- Covered by Reply to Prospect tests
- Browser execution pending

## Proof-Safety Results

Automated checks verify:

- Generation-facing queries return approved records only
- Restricted, draft, needs-review, archived, and rejected records are excluded
- Competitor objection material is excluded where unsafe
- At most one selected case-study proof company is used in a sequence
- Unsupported percentages and non-selected proof customers are blocked
- Case-study proof can be used only when selected and relevant
- Metrics remain tied to selected proof
- Historical results are not treated as guarantees
- Refinement validation blocks unsupported commercial and proof changes

Manual signed-in pilot checks still need to confirm user-visible copy is not confusing and does not display internal labels.

## Trust-Boundary Results

Reviewed and covered by tests:

- User-provided context is kept separate from verified internal knowledge
- Imported data remains enrichment or review data, not approved knowledge
- Model inference is not treated as fact
- Unknown fields remain unknown
- Account Research recommendations do not become factual outreach claims
- Suggested personas are role categories, not invented employees
- Claims-to-avoid are carried into downstream workflows

## AI Failure Testing

Automated checks cover:

- Missing API key / deterministic fallback
- Provider status displayed without secrets
- Empty output rejected before persistence
- Build Sequence output without usable sequence steps rejected
- Malformed or unsafe output blocked by validation boundaries
- Duplicate or near-duplicate sequence steps rejected
- Unsupported proof output rejected
- Internal-label leakage blocked
- Failed provider refinement preserves the previous version
- User-facing errors are sanitized

Safe live provider timeout testing was not performed against production configuration. That should be simulated only in local mocks or a safe preview environment.

## Database And Fixture Results

Reviewed and covered by tests:

- Fixture mode is allowed when `DATABASE_URL` is unavailable outside production
- Production cannot silently use fixture mode
- Prisma mode is selected when `DATABASE_URL` is configured
- Approved-only fixture proof rules are enforced in service tests
- Fixture users include both `SALES_USER` and `KNOWLEDGE_ADMIN`
- Seed data is generic development data and not real customer/prospect data

Remaining risk:

- The Prisma integration harness remains skipped unless `TEST_DATABASE_URL` is configured. No production database was used for Phase 9.

## Import Results

Automated import tests cover:

- Valid preview without writes
- Missing required headers
- Malformed domains, emails, URLs, dates, and formulas
- Duplicate rows
- Existing conflicts
- Empty/invalid CSV behavior through row validation paths
- Long/suspicious values through validation and sanitization helpers
- Confirmation writes only after valid preview
- Sales users blocked from imports
- Partial invalid imports avoided
- Imported suppression blocks outreach actions
- Imported company classification remains review-only enrichment, not approved knowledge

Manual signed-in admin import smoke testing remains required with safe synthetic CSV files.

## Onboarding Results

Phase 8 onboarding content and tests cover:

1. What Signal does
2. Where a sales user should start
3. Account research workflow
4. Create Outreach workflow
5. Build Sequence workflow
6. Reply to Prospect workflow
7. Proof usage
8. Claims to avoid
9. Ask Signal Brain usage
10. Escalation/handoff expectations

Manual pilot observation should confirm whether a new seller can complete the workflow without explanation.

## Defects Found

No confirmed critical or high pilot blocker was found in the local code and automated test review.

Confirmed limitations:

- Signed-in browser QA could not be completed in this task
- Prisma integration test remains skipped without a safe test database
- Admin import UX still needs live signed-in verification with synthetic files
- Mobile layout is covered by component-level tests and manual checklist, not a full authenticated browser pass

## Defects Fixed

No code defects were fixed in Phase 9. Documentation was added to make pilot execution, feedback, and smoke testing explicit.

## Quality Checks

- `pnpm prisma:validate`: passed after supplying temporary non-secret local test values for `DATABASE_URL` and `DIRECT_URL` in the command environment only. The first run failed because `DIRECT_URL` was not present in the local shell.
- `pnpm prisma:generate`: passed.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm test`: passed, 271 passed and 1 skipped across 45 test files.
- `pnpm build`: passed.

The single skipped test is the Prisma integration harness that requires `TEST_DATABASE_URL`. It was not run because no safe temporary PostgreSQL test database was available in this task.

## Remaining Risks By Severity

### Critical blockers

- None found in local code review and automated tests.

### High blockers

- None found in local code review and automated tests.

### Medium issues

- Authenticated browser QA is still pending for both roles.
- Prisma integration behavior is not verified against a safe temporary PostgreSQL test database.
- Admin import workflows need live signed-in verification with synthetic files.

### Low issues

- Full mobile visual QA is pending behind authentication.
- Copy actions and generated-output spacing need live browser confirmation.
- Pilot users may still need a short kickoff explaining when to use each workflow.

## Pilot Success Criteria

Approve the limited internal pilot only if:

- Each pilot user can sign in without public signup
- Sales users cannot reach admin-only routes or actions
- Admin users can complete review workflows on test records
- Account Research can be completed without assistance
- Create Outreach output is usable with limited editing
- Build Sequence output is coherent and does not repeat proof incorrectly
- Reply to Prospect answers the latest prospect message without restarting the pitch
- No unsupported company facts appear
- No unapproved or restricted proof appears
- No raw provider, database, stack trace, or secret-like error appears
- No critical mobile navigation blocker appears at 390 x 844
- Users understand the workflow order from Home and Playbook

Pass threshold:

- All critical/high criteria pass
- No role leak
- No restricted knowledge leak
- No production fixture fallback
- No unapproved proof in generation

Concern threshold:

- One or more medium issues remain, but there is a manual workaround and no safety risk.

Blocker threshold:

- Any unauthorized admin access, restricted knowledge leak, secret exposure, customer data leak, production fixture fallback, unapproved claim entering generation, primary workflow unusable, or frequent malformed AI output.

## Feedback Process

Use `docs/pilot-feedback-template.md` for every pilot issue or output-quality note. Users should anonymize prospect/company content unless the issue cannot be understood without it. Screenshots are helpful but should avoid sensitive customer data.

## Rollout Recommendation

APPROVE WITH CONDITIONS

The application is ready for a limited internal pilot only after a signed-in smoke pass is completed with one legitimate `SALES_USER` and one legitimate `KNOWLEDGE_ADMIN` in the preview environment. Automated coverage and local build quality are strong, but Phase 9 cannot honestly mark browser-authenticated route coverage as complete without real sessions.

Conditions before inviting the four-person pilot team:

- Run `docs/pilot-smoke-test-checklist.md` with both roles
- Use synthetic or approved-safe test inputs only
- Confirm no mobile blocker at 390 x 844
- Confirm production/preview environment variables are set without exposing secrets
- Keep HubSpot export disabled unless already configured and intentionally tested separately
