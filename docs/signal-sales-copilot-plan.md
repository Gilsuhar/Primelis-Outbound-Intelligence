# Signal Sales Copilot — implementation plan

This feature branch is an isolated development track based on the existing Primelis Outbound Intelligence application. Do not merge to main before tests and review.

## Target workflow
1. Intake HubSpot contacts owned by the authorized user, with deduplication.
2. HOLD until company revenue >= USD 30M, employee count >= 80, senior paid-search ownership, current employment, email verification, and Outreach contact history are confirmed.
3. Build an evidence-linked prospect and company brief from permitted sources.
4. Choose one account-specific angle and an approved, industry-relevant case study.
5. Draft four **email** steps in the **same thread**, with a human review gate:
   - Step 1: tailored account/person insight (day 1).
   - Step 2: manual real SERP screenshot and factual observation (day 4). If no verified screenshot, HOLD step 2; never fabricate.
   - Step 3: different Signal capability + approved, context-matched social proof (day 9).
   - Step 4: concise low-pressure CTA (day 15).
6. Send/enroll only after explicit approval and successful Outreach integration.
7. Track user edits, positive replies, and meetings to inform later strategies.

## Evidence and safety requirements
- Similarweb traffic and spend figures are estimates, not direct evidence of a particular SERP ad or exact savings.
- Record evidence URL/source, date, market, keyword, device, observation and usage permission.
- Do not claim competitor ads, customer results, savings, or screenshots without verified sources and approved usage rights.
- Re-engagement requires at least four calendar months since last outbound, no suppression/active sequence/conflicting opportunity, fresh independent email verification.
- Missing history or eligibility data means HOLD, not READY.
- No secrets in client code or committed files.

## Implementation sequence
1. Review existing sequence, strategy, proof, and prospect-intelligence tests.
2. Implement four-email same-thread policy and step-2 screenshot gate with tests.
3. Improve case-study matching by industry, persona, pain, and verified metric permissions.
4. Add provider adapters and integration tests for HubSpot, Similarweb, email verification, and Outreach.
5. Simplify mobile review dashboard.
