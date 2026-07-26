# Phase 8: Signal Playbook and Onboarding

## Starting Point

- Phase 7 full commit hash: `04b8c1f7a29719ef4b2e8c085eacf7af33bdbdf0`
- Phase 7 short commit hash: `04b8c1f`
- Phase 7 commit message: `feat: improve reply intelligence and objection handling`
- Branch: `main`
- Working tree before Phase 8: clean

## Current Playbook Architecture

- Route: `/playbook`
- Data service: `getSignalPlaybookData`
- UI: `PlaybookClient`
- Stable guidance source: code-defined playbook content in `playbook-content.ts`
- Dynamic approved content source: imported Signal review records
- Proof source: approved case-study records only after this phase
- Role behavior: Playbook is available to signed-in users; manager approval remains visible only to knowledge admins.

## Content-Source Strategy

Phase 8 keeps a safe hybrid architecture:

- Stable onboarding, workflow, qualification, and claims-to-avoid guidance remains code-defined.
- Approved product truth remains data-backed where imported approved records are available.
- Case-study proof is filtered to `APPROVED` records only.
- Example wording is treated as phrasing guidance, not as verified factual proof.
- Restricted, archived, or unapproved proof is not shown in the Playbook proof section.

## Section Structure

Added or strengthened:

- Start Here
- Product Guide
- Qualify an Account
- How to Work
- Objections
- Case Studies
- AE Handoff
- Claims to Avoid
- Progress

## Product Guidance

Added concise explanations for:

- Signal overview
- Solo Bidder
- CPC Optimization
- Incrementality
- Monitoring versus automation

Each product section includes safe explanation guidance and explicit claims to avoid.

## ICP and Persona Guidance

Preserved existing ICP and persona sections, while removing unsupported numeric company-size and spend thresholds from general guidance. Company size and spend are now described as qualification signals only when verified or supported.

## Research Workflow Guidance

Added a practical account-research process:

- Confirm company identity and domain.
- Identify business model, markets, and likely ownership.
- Review approved internal knowledge.
- Separate approved facts, user-provided context, and assumptions.
- Check Do Not Contact and recent account activity.
- Choose proof only when approved and relevant.
- Record claims to avoid before generating copy.

## Outreach Guidance

Added outbound principles:

- Start with the prospect process.
- Use one clear problem and one CTA.
- Avoid over-personalization without evidence.
- Use proof sparingly.
- Avoid fake urgency and unsupported account-specific claims.
- Avoid over-explaining Signal in first-touch messaging.

## Reply Guidance

Mapped Phase 7 reply-intelligence behavior into Playbook guidance for:

- Deck request
- Pricing or fee structure
- ROI or value
- Data-source question
- Existing dashboard or monitoring
- Agency, internal tool, or vendor
- Does not want to pause
- Timing, referral, or decline

Each item explains what to answer first, what to avoid, and the appropriate next step.

## Proof Guidance

- The Playbook service now returns only approved case studies.
- The Playbook UI also filters case studies to `APPROVED` as defense in depth.
- Hardcoded supplemental case-study fallback cards were removed.
- Case-study metrics must remain tied to their customer and source.

## Qualification Guidance

Added:

- Strong signals
- Weak signals
- Deal risks
- Discovery questions

The section remains guidance, not a rigid scoring model.

## Handoff Guidance

Added AE handoff guidance for:

- Company, domain, prospect, and role
- Problem identified
- Confirmed facts versus assumptions
- Current process, agency, dashboard, vendor, or internal tool
- Relevant markets and open questions
- Proof shared
- Objections raised
- Commercial discussion status
- Technical questions
- Risks and next step

No CRM or HubSpot handoff claim was added.

## Claims to Avoid

Added a visible claims-to-avoid section covering:

- Unsupported overspend claims
- Unsupported competitor bidding claims
- Unsupported CPC or bid-strategy claims
- Guaranteed savings or incrementality
- Transferring one customer's percentage to another prospect
- Invented deck, attachment, meeting, calendar, pricing, integrations, customers, agencies, vendors, or internal tools
- Claims that Signal replaces the paid-search team or agency

## Workflow Guide

Added guidance for:

- Account Research
- ICP Insights
- Create Outreach
- Build Sequence
- Reply to Prospect
- Ask Signal Brain
- Do Not Contact
- Knowledge Library

Each tool now has purpose and when-not-to-use guidance.

## Onboarding Changes

- The Playbook now opens to Start Here.
- Start Here shows a five-step onboarding path.
- Recommended workflow order is visible.
- Content architecture guidance is visible to sales users.
- Admin-only approval remains in Progress and is still manager-only.

## Navigation Changes

- Added tabs for Start Here, Product, Handoff, and Claims to Avoid.
- Reused the existing horizontal tab navigation.
- No new route, dependency, or broad redesign was added.

## Tests Added

- Added playbook content tests for onboarding, product guide, workflow guide, qualification, handoff, claims to avoid, and Phase 7 reply-intent guidance.
- Updated Playbook UI tests for Start Here, Product, approved-only proof, Handoff, Claims to Avoid, and manager-only progress behavior.
- Added Signal Playbook service test to verify approved-only case-study filtering.

## Defects Fixed

- Removed unapproved hardcoded supplemental case-study fallback display.
- Removed unsupported numeric size and spend thresholds from general ICP guidance.
- Added service and UI filtering so restricted or archived proof is not shown in the case-study proof section.

## Remaining Risks

- Medium: Some legacy wording examples still include historical language in the winning-message library. They are labeled as examples, but future review should continue tightening wording quality.
- Medium: Playbook navigation is still tab-based rather than URL hash deep-link based.
- Low: Product truth depends on imported approved records being present in the configured database.
- Low: The onboarding checklist is local UI state only and does not persist progress across sessions.

## Recommended Phase 9 Scope

- Signed-in QA with the real production-like dataset.
- Team rollout checklist.
- Validate Playbook on 390px mobile with real users.
- Confirm approved proof inventory with GTM stakeholders.
- Review winning-message examples for final send-readiness.
- Pilot readiness and feedback capture.

## Confirmations

- HubSpot was not started.
- No live web research or scraping was added.
- No automated sending was added.
- No external integrations were added.
- Pricing and commercial terms were not changed.
- The OpenAI model was not changed.
- Authentication was not changed.
- No secrets, environment files, generated files, migrations, or customer data were committed.
