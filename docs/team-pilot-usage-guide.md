# Team Pilot Usage Guide

## Purpose

Primelis Outbound Intelligence is an internal Signal workspace for learning the product, checking account fit, creating careful outbound, building short sequences, replying to prospects, and keeping sales claims tied to approved knowledge.

The pilot is for a small internal team only. Every generated message must be reviewed before use.

## Intended Users

- `SALES_USER`: researches accounts, creates outreach, builds sequences, replies to prospects, checks Do Not Contact, and uses the Playbook.
- `KNOWLEDGE_ADMIN`: does everything a sales user can do and also reviews knowledge, manages sources, handles imports, and controls approval status.

## Login

1. Use the private preview URL.
2. Sign in with the invited Primelis account.
3. If access is pending, confirm that the email exists in Supabase Auth and has a matching application user row.
4. Do not enable public signup.

## Recommended Workflow Order

1. Start on Home.
2. Review Signal Playbook when unsure.
3. Check Do Not Contact before prospecting.
4. Run Account Research.
5. Create a first outreach message.
6. Build a short sequence if the account is safe.
7. Use Reply to Prospect when a real reply comes in.
8. Use Ask Signal Brain for product, proof, objection, or claim-safety questions.
9. Escalate uncertain proof or pricing questions to a knowledge admin.

## Account Research

Use Account Research to decide whether there is enough context to proceed. Treat recommendations as guidance, not verified facts for outbound. Unknown fields must stay unknown.

Do not turn suggested personas into invented employees.

## Create Outreach

Use Create Outreach for one concise first message. Keep the brief tight. If the app says an account is restricted, suppressed, or already active, do not bypass the warning unless the workflow explicitly allows an override and you have a valid reason.

Review before sending:

- Company facts
- Proof
- Savings or performance claims
- Tone
- CTA

## Build Sequence

Use Build Sequence for a short multi-step flow. Each step should have a distinct job. Avoid repeating the same proof or CTA across steps.

The generated sequence is not automatically sent. HubSpot export is outside this rollout unless separately approved.

## Reply to Prospect

Paste the relevant conversation history and make sure the latest prospect message is included. The reply should answer the current question first, then move to a simple next step.

For advanced follow-ups where a deck, value explanation, or pricing answer was already shared, the reply should not restart the pitch.

## Ask Signal Brain

Use Ask Signal Brain for quick internal guidance:

- What can we safely claim?
- How does Signal work?
- Which proof is approved?
- How should we answer an objection?
- What should we avoid saying?

Do not use it to invent live account research or customer-specific facts.

## Playbook

Use the Playbook as the source for product explanation, ICP, personas, US-market guidance, objections, case-study rules, winning message patterns, and claims to avoid.

## Do Not Contact

Search the company or domain before outreach. If the account is blocked or suppressed, stop and escalate.

## Admin Tools

Knowledge admins can review records, manage sources, and transition status. Factual claims require a source before approval. Restricted, rejected, archived, draft, and needs-review knowledge must not be used as approved proof.

## Claims To Avoid

Do not say:

- A company wastes money unless verified.
- A specific CPC, spend, revenue, MQL, SQL, or savings number unless approved and sourced.
- A case-study result is guaranteed for another company.
- Signal replaces an agency or dashboard.
- Signal always pauses branded ads. Lower bids and coverage protection are also part of the method.

## Data Safety Rules

- Do not enter real sensitive customer data during pilot testing.
- Anonymize prospect examples in feedback.
- Do not paste secrets, API keys, private contract terms, or confidential personal data.
- Do not send generated content without human review.
- Report unsupported facts immediately.

## Known Limitations

- Signed-in browser QA must be completed with real pilot users before wider rollout.
- Prisma integration tests require a safe `TEST_DATABASE_URL`; they remain skipped without it.
- HubSpot export is limited and not part of this rollout unless approved separately.
- The app does not scrape the web or enrich live accounts automatically.
- The AI can improve wording and reasoning but must stay inside approved product, proof, and safety boundaries.

## Feedback

Use `docs/pilot-feedback-template.md`. Mark severity clearly and avoid customer-sensitive content by default.

