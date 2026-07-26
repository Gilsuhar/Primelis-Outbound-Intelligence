# Limited Pilot Rollout Plan

## Scope

Run a controlled internal pilot with 2-3 users before wider use. The pilot should validate workflow clarity, output quality, proof safety, role separation, and mobile usability.

Recommended participants:

- 1-2 sales users
- 1 knowledge admin

Recommended duration:

- 5 business days
- Extend only if no critical or high blockers appear

## Workflows To Test

- Home onboarding
- Signal Playbook
- Do Not Contact
- Account Research
- Create Outreach
- Build Sequence
- Reply to Prospect
- Ask Signal Brain
- Knowledge review with safe test records
- Import preview with synthetic CSV files

## Not Approved For Broad Use Yet

- Automated sending
- LinkedIn automation
- Full HubSpot sync
- Live enrichment
- Web scraping
- Analytics-driven rollout decisions
- Production customer-data import without a separate review

## Data Users Must Not Enter

- API keys or secrets
- Private contract terms
- Sensitive customer data
- Personal prospect data not needed for testing
- Real customer CSV imports
- Unapproved case-study metrics

## Before Pilot

- Confirm participant emails.
- Confirm Supabase Auth invitations.
- Confirm application roles.
- Confirm deployment commit.
- Confirm approved knowledge is current enough for pilot use.
- Confirm no sensitive test data is required.
- Complete signed-in smoke test for `SALES_USER` and `KNOWLEDGE_ADMIN`.
- Confirm OpenAI provider status is visible and safe.
- Confirm HubSpot is not part of the pilot unless intentionally configured.

## During Pilot

- Use anonymized examples where possible.
- Review generated content before sending.
- Report unsupported facts immediately.
- Report proof attribution errors immediately.
- Record workflow, severity, and expected versus actual result.
- Stop using any affected workflow for Critical issues.
- Keep messages concise and avoid turning AI output into approved proof.

## Critical Escalation

Stop the affected workflow immediately if any of these occur:

- Unauthorized admin access
- Restricted data exposure
- Secret exposure
- Customer-data exposure
- Unapproved proof appearing in generation
- Wrong customer metric attribution
- Production fixture fallback
- Automated sending unexpectedly occurs

## After Pilot

- Collect feedback templates.
- Classify issues by severity.
- Review generated examples for unsupported claims.
- Review proof and case-study usage.
- Decide whether to expand, fix, or pause.
- Run the full regression suite.
- Prepare a wider rollout decision only after signed-in QA and issue review.

