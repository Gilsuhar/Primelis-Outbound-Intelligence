# Pilot Smoke Test Checklist

Run this checklist before inviting the pilot team and again during the first pilot session. Use safe synthetic inputs unless a real customer/prospect is explicitly approved for internal testing.

## Setup

- Confirm preview URL opens.
- Confirm public signup remains disabled in Supabase.
- Confirm one invited `SALES_USER` can sign in.
- Confirm one invited `KNOWLEDGE_ADMIN` can sign in.
- Confirm both users have matching application `User.email` rows.
- Confirm server variables are configured without exposing secrets.
- Confirm HubSpot is not part of this pilot unless separately approved.

## Viewports

Test each role at:

- 390 x 844
- 768 x 1024
- 1440 x 900

Check:

- No horizontal scrolling
- No clipped buttons
- Long text wraps
- Mobile menu opens and closes
- Active navigation is clear
- User email and role are visible
- Sign out works

## SALES_USER Routes

- `/`
- `/playbook`
- `/account-research`
- `/icp-insights`
- `/create-outreach`
- `/build-sequence`
- `/reply-to-prospect`
- `/ask-signal-brain`
- `/do-not-contact`

Check:

- Sales navigation appears.
- Admin navigation does not appear.
- Direct admin URLs redirect or block access.
- Loading states are clear.
- Duplicate submissions are blocked.
- Errors are safe and understandable.
- Copy buttons work.
- Generated output keeps paragraph spacing.
- Internal labels do not appear.

## KNOWLEDGE_ADMIN Routes

- `/knowledge-library`
- `/add-knowledge`
- `/review-queue`
- `/imported-signal-review`
- `/account-research/import`
- `/do-not-contact/import`
- `/claims/[test-claim-id]`

Check:

- Admin navigation appears.
- Sales routes still work.
- Review actions require admin access.
- Approval requires a source.
- Final source removal is blocked for approved factual claims.
- Restricted records are not exposed in sales generation.
- Failed actions show safe errors.
- Successful actions show accurate confirmation.

## Sales Scenario A: Limited Information

Input:

- Company: synthetic unknown company
- Website: optional
- No competitor, CPC, spend, savings, or proof context

Run:

- Account Research
- Create Outreach
- Build Sequence

Pass:

- Uses safe conditional language.
- Does not invent facts.
- Does not force proof.
- Shows claims to avoid.

## Sales Scenario B: Strong Ecommerce Fit

Input:

- Fashion, retail, or ecommerce account
- Paid Search or Performance persona
- Case study requested only if relevant

Pass:

- Angle is practical and direct.
- At most one approved case study appears.
- Metrics are tied to the correct customer.
- Results are not presented as guarantees.

## Sales Scenario C: B2B Lead Generation

Input:

- B2B SaaS or lead-generation account
- Demand generation, growth, or paid search persona

Pass:

- Does not assume ecommerce.
- Lead-related language is used only when appropriate.
- No unsupported MQL or SQL claim appears.

## Reply Scenario D: Dashboard Objection

Input:

- Prospect says they already use a dashboard or auction insights.

Pass:

- Answers monitoring versus action.
- Does not criticize the dashboard.
- Does not restart the full pitch.
- Ends with a soft next step.

## Reply Scenario E: Agency Handles It

Input:

- Prospect says their agency manages branded search.

Pass:

- Positions Signal as complementary.
- Does not criticize the agency.
- Asks a relevant process question.

## Reply Scenario F: Does Not Want To Pause Ads

Input:

- Prospect is uncomfortable pausing branded ads.

Pass:

- Explains lower-bid mode.
- Keeps technical accuracy.
- Does not pressure the prospect.

## Reply Scenario G: Pricing Or Fee Structure

Input:

- Prospect asks how commercials work.

Pass:

- Answers the question first.
- Uses approved pricing/commercial information only.
- Does not invent terms.

## Reply Scenario H: Advanced Follow-Up

Input:

- Deck already sent.
- Pricing/value already explained.
- Prospect needs next step.

Pass:

- Does not resend the deck.
- Does not repeat pricing.
- Does not restart the pitch.
- Suggests a concise walkthrough, pressure-test, or technical review.

## Reply Scenario I: Polite Decline

Pass:

- Short and respectful.
- No objection fighting.
- No aggressive follow-up.

## Reply Scenario J: Strong Rejection

Pass:

- Minimal respectful response.
- No continued selling.

## AI Failure Checks

Use safe preview or local test conditions only.

- Missing OpenAI configuration falls back safely.
- Provider failure does not expose raw errors.
- Empty output is not saved as success.
- Malformed output is rejected.
- Duplicate sequence steps are rejected.
- Unsupported proof is rejected.
- User input remains available for retry where practical.

## Import Checks

Use synthetic CSV files only.

- Valid file previews before writing.
- Missing required columns show a safe error.
- Malformed row is reported.
- Duplicate row is skipped or reported.
- Empty file is handled safely.
- Very long values do not break the UI.
- Sales user cannot import.
- Imported data is not approved automatically.

## Pilot Exit Criteria

Pass limited pilot when:

- No critical blocker appears.
- No high blocker remains unresolved.
- Both roles can sign in and complete required workflows.
- No role leak occurs.
- No restricted or unapproved proof appears.
- No unsupported company facts appear.
- Mobile at 390 x 844 is usable.
- Users can report feedback with the pilot template.

Block pilot when:

- Admin access leaks to sales users.
- Restricted knowledge appears in generation.
- Secrets or raw provider errors appear.
- Production falls back to fixtures.
- A primary workflow cannot be completed.
- Generated outputs repeatedly fail safety or quality validation.

