# Recycler qualification and review boundaries

The collection pipeline now composes the unchanged Phase 1 safety evaluator with mandatory business
qualification before returning decisions. `qualification.ts` evaluates server-owned, identity-bound
receipts: exact HubSpot owner 1087915602 (24 hours), both company thresholds (80 employees AND USD30M
annual revenue), senior explicit Search responsibility (30 days), and complete opportunity clearance
(24 hours). CMO still requires Search evidence. Paid Social-only and below-threshold companies are
excluded; incomplete/ambiguous/stale evidence remains HOLD. Outreach-only records remain visible but
cannot enter the eligible list without an established HubSpot ownership record. Duplicate identities
remain HOLD; the review displays at most one row per HubSpot ID without combining their evidence.

Phase 1 remains independently testable and is a safety sub-evaluation, not full business eligibility.
The application collection path uses `evaluateQualifiedRecyclerBatch`. Existing authoritative
suppression, sequence, independent employment/email validation and calendar-month checks all remain.
Boring/HubSpot/Surfe/manual provider labels cannot claim independent validation. ZoomInfo is not
automatically trusted: a current independent identity-bound receipt and expiry are still required.

Outreach mailing interpretation is unchanged: deliveredAt is a delivery observation, retained as
DELIVERED rather than relabeled SENT. No sentAt value is invented. Missing delivery/outbound timestamps
or visible-history-only collection cannot prove no contact. Pagination completion is distinct from
all-user/retention coverage. Regression tests preserve missing-sentAt and suppression-gap cases.

The review displays all statuses and missing evidence, qualification provenance/timestamps, company,
role, HubSpot ID, draft-readiness caveats and a conditional screenshot recommendation. Search and
status filters affect display; CSV retains the complete evaluation or eligible Top 50. Formula
injection protection remains. Eligibility does not authorize sending or enrollment.

The UI demonstration still contains only fictional observations and no invented positive verification
receipts. Complete positive receipts exist solely in tests. No live collector for company/role,
opportunity, independent verification or full historical authority was activated. Those producers
remain blockers to any real eligible Top 50. No schema migration, CRM write or paid call was added.
