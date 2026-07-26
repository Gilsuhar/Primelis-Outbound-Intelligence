# Phase 6 - Proof and Case Study Intelligence Audit

## Status

Completed locally after Phase 5 commit `f54589a`. No push or deployment was performed.

## Architecture Reused

- Reused the existing `CaseStudy`, `CaseStudyMetric`, `SourceDocument`, and approved knowledge models.
- Reused the existing Create Outreach, Build Sequence, Reply to Prospect, and Ask Signal Brain service boundaries.
- Added one shared proof policy instead of creating a parallel generation system.

## What Changed

- Added a central proof-selection policy that chooses at most one approved, source-backed case study for a workflow.
- Added proof validation after generation so unsupported percentages, non-selected customer names, or repeated proof metrics are rejected.
- Build Sequence now filters all available case studies down to one selected proof before calling the provider.
- Create Outreach applies proof selection only when the user enables case-study proof.
- Reply to Prospect can now retrieve approved case studies and use one selected proof for value, pricing, deck, ROI, savings, MQL, SQL, or pipeline follow-up replies.
- Ask Signal Brain now recommends a context-selected case study instead of using the first available case-study record.

## Data Sources

- Case-study customer names come from approved `CaseStudy` records and approved external wording.
- Metrics come from approved case-study wording and `CaseStudyMetric` rows.
- Source references come from linked `SourceDocument` records.
- Non-proof product facts and objection responses continue to come from approved `KnowledgeItem` records.

## Blocking Versus Warning Behavior

- Blocked:
  - Output mentions a non-selected case-study customer.
  - Output uses a percentage or percent claim that is not present in the selected proof.
  - Output repeats the selected proof metric too many times.
  - Output uses numeric proof when no proof was selected.
- Warning / guidance:
  - No eligible case-study proof exists.
  - A proof record is selected and should be framed as observed proof, not a guarantee.
  - Legacy restrictions are allowed only when the approved record text indicates outbound/external approval.

## Workflow Impact

- Sequences should now use proof more deliberately: one selected case study, usually in step 2 or step 3.
- Reply flows can answer later-stage value and commercial questions with source-backed proof rather than generic explanation.
- Signal Brain can explain which case study is safest to use and why.

## Tests Added Or Updated

- Added `src/features/proof/proof-policy.test.ts`.
- Updated Build Sequence tests for one selected proof and proof-validation rejection.
- Updated Reply to Prospect tests to verify proof is included for value/commercial follow-up replies.

## Data Limitations

- Case-study selection is deterministic and based on approved internal records only.
- No live internet research, HubSpot calls, or external enrichment is used in this phase.
- Proof matching depends on case-study approved wording, titles, source links, and available industry/persona context.
