# Prospect verification and qualification

Implemented on `feature/agent-workforce-foundation`, based on published `8841398`. Existing application authentication, dashboards, CRM connectors, sync jobs, PostgreSQL models and draft approval rules remain in place. No Production deployment or database migration is performed by this change.

## Audit: inherited versus completed here

Already implemented: fixed HubSpot owner, creation/assignment admission, numeric employee and USD revenue thresholds, senior Search/CMO policy, Paid Social exclusion, independent email/employment requirements, email-edit checks, positive suppression blocks, calendar-month cooldown, source provenance, stale-evidence checks, read-only HubSpot/Outreach synchronization, identity matching, sync checkpoints/leases and fresh integration diagnostics. Drafts remained pending human review.

Previously incomplete: per-gate historical authority; explicit unresolved-provider decisions; structured employer/title/seniority/Search verification; a runtime independent verification adapter and bounded retry endpoint; evidence-based verification status in the operational workspace.

This change adds those contracts, adapters and deterministic report integration. Each review returns `qualification.status = ELIGIBLE | HOLD | REJECTED`, gates with `CLEAR | BLOCKED | UNKNOWN`, resolution, evidence, source IDs, timestamps, freshness, missing scope/visibility requirements and next action. Existing `READY | HOLD | REJECTED` contracts are preserved: ELIGIBLE corresponds to READY, never approval. The new report can only tighten the existing decision. It cannot overrule a rejection or bypass draft checks.

Reports are recomputed from current evidence and the explicit evaluation time; immutable existing ProspectSource snapshots retain raw inputs, provider proof and verification attempts for audit. No new tables, migrations or infrastructure are required. The prior integration migration must already be applied to the isolated Preview database.

## Historical authority

A negative flag or empty result is not clearance. Historical proof optionally includes `authority` with state `COMPLETE | PARTIAL | UNRESOLVED_PROVIDER`, sources, checkedAt, through, identity match, permission verification, all-user history, retention completeness and supporting evidence. Legacy observations without authority remain readable but cannot clear operational historical gates.

Current opportunity clearance requires complete HubSpot contact and primary-company deal associations, successful reads and recognized pipeline-stage closedness. Incomplete pages, unreadable resources or unknown stages cannot clear it. A full HubSpot read attaches an authority receipt for this current-state check.

Cooldown and historical suppression clearance require authoritative cross-source HubSpot/Outreach coverage; sequences require authoritative Outreach visibility. Authority and integration checks expire after 24 hours. Employee, role and independent verification evidence retain the existing 30-day maximum age. Positive safety blocks are retained conservatively even when stale; unknown/future/contradictory evidence cannot erase a block.

An observed recent outbound email blocks immediately even if absolute history coverage is incomplete. Passing cooldown requires authoritative latest-outbound/never-contacted evidence; the clamped four-calendar-month anniversary is unchanged.

**Remaining provider limitation:** currently connected resource contracts do not establish complete Outreach retention, all-user visibility or complete bounce/complaint coverage. The Outreach adapter explicitly attaches `UNRESOLVED_PROVIDER`, not fabricated negative clearance. A generic 403 lists required scopes/user visibility to review; it cannot identify exactly which permission is absent. No administrator flag or UI toggle can manufacture historical authority. A supported authoritative source must be implemented and live-verified before these gates can pass.

## Independent email and employment providers

The server-only `VerificationAdapter` receives a kind and bound identity and returns strictly validated structured evidence, or null when unavailable. Identity binds HubSpot record ID, name, current email, company domain, last email edit timestamp and email source. A source change, edit or employer/person mismatch invalidates evidence. CRM email values are labeled HUBSPOT intake; originating ZoomInfo/Surfe provenance is not guessed from undocumented CRM metadata.

### Optional ZeroBounce email validation

`EMAIL_VERIFICATION_PROVIDER=ZEROBOUNCE` and `ZEROBOUNCE_API_KEY` enable the real HTTPS v2 validate endpoint. **This is an optional paid service requiring an authorized account and validation credits. No credits/account are provided by this application.** No requests occur automatically on dashboard load or CRM sync.

A valid response must match the requested address and explicitly identify a non-free mailbox on the current company's domain, with no cautionary substatus. Invalid, catch-all, unknown, abuse/spamtrap and incomplete responses do not verify a prospect. The adapter never changes an address to a suggested alternative. Employment and ownership of a specific mailbox are not inferred from deliverability; independent current employment remains a separate mandatory gate.

The API key is sent using the provider's query authentication, but the request URL is never logged, persisted or returned. Evidence retains a locally identified receipt, normalized response assessment and observation timestamp, clearly labeling the receipt as local rather than inventing a provider record ID. The direct endpoint was implemented against the documented API shape; **it has not been tested with a live key**.

### Authorized verification gateway

For an existing approved provider service, configure:

- `VERIFICATION_GATEWAY_URL`: authorized public HTTPS base URL, no credentials/query/fragment.
- `VERIFICATION_GATEWAY_TOKEN`: least-privilege server bearer credential.
- `VERIFICATION_GATEWAY_PROVIDER_ID`: exact expected provider identity.
- `EMAIL_VERIFICATION_PROVIDER=GATEWAY` for gateway email validation (also the default when a gateway is configured).

The adapter POSTs `/email` or `/employment` with `{ version: 1, kind, identity }`. This is a verification operation only; the gateway contract must not send email, enroll prospects or modify CRM data. Browser callers cannot select a URL, provider, token or verification result.

Responses must match `src/features/sales-agent/verification/contracts.ts` exactly. Common proof: configured providerId, sourceRecordId, HTTPS sourceUrl without embedded secrets, checkedAt, independent flag and nonempty evidence. Email response: kind, bound identity, status `VERIFIED | INVALID | CATCH_ALL | UNKNOWN | STALE`, businessEmail and proof.

Employment response: kind, bound identity, status, exact current employerDomain, current flag, role, seniority `C_LEVEL | VP | DIRECTOR | HEAD | LEAD | OTHER | UNKNOWN`, searchResponsibility `PROVEN | ABSENT | UNKNOWN`, responsibilityScope `PAID_SEARCH | PAID_SOCIAL_ONLY | MIXED | UNKNOWN`, responsibilityEvidence and proof. Title alone never proves Search responsibility. Unknown seniority, missing responsibility support, conflicting scope or an uncorroborated employer cannot yield verification. Independently verified Paid Social-only profiles are rejected by the existing policy.

ZoomInfo can be integrated through an authorized gateway returning actual independent validation evidence and its timestamp; simply echoing a ZoomInfo, HubSpot, Surfe or Boring green flag does not satisfy this contract. Provider IDs containing CRM-only/Boring/Surfe labels cannot create independent verification observations. A gateway is a **configurable HTTP integration**, not a pre-existing hosted service: none is supplied or assumed. Employment remains unresolved until an authorized source/service is connected. Assistant-side CRM plugins do not supply credentials to the deployed application.

## Safe retry and persistence

`POST /api/sales-agent/verification` accepts only `{ contactId, kind, requestKey }`. Existing Google/Supabase app authentication, exact same-origin checks, Preview-only mutation guards and the existing `INTEGRATION_OPERATOR_USER_ID` restriction apply. Other signed-in users cannot consume the operator's provider account. Current authorized owner/intake and a HubSpot identity observation within 24 hours are required; email validation additionally requires known email edit history.

The existing actor lock claims a request lease and appends a RUNNING evidence snapshot before provider I/O. Calls are outside database transactions. Repeated keys, active leases, fresh completed determinations and nextRetryAt suppress duplicate requests. There are at most three attempts per contact/kind/provider identity within the retry window, with at least one minute between attempts; exhausted budgets require a day before a new attempt. At most one bounded HTTP retry follows short 429/5xx delays, so paid providers may consume credits on retried calls. Long Retry-After delays are persisted rather than slept through. Authentication errors, network exceptions and malformed results do not become verification.

Completion rechecks current identity and request key under the actor lock. Racing email edits cannot receive stale proof. Failures/unconfigured providers remain explicit FAILED/UNRESOLVED_PROVIDER attempts and force affected gates to UNKNOWN; old positive observations cannot disguise a newer unresolved attempt. Verification never clears suppression, history or CRM opportunity gates. Results and attempts use the existing versioned evidence JSON; no credential is stored in that JSON.

## Runtime variables and live testing

Additional names: `EMAIL_VERIFICATION_PROVIDER`, `ZEROBOUNCE_API_KEY`, `VERIFICATION_GATEWAY_URL`, `VERIFICATION_GATEWAY_TOKEN`, `VERIFICATION_GATEWAY_PROVIDER_ID`. None is a public/browser variable. Existing `INTEGRATION_OPERATOR_USER_ID`, database/auth and HubSpot/Outreach variables remain required for operational use.

No new HubSpot or Outreach scopes are requested. Existing requirements are in `docs/read-only-integrations.md`. Gateway permissions are service-specific read/verify access to independently sourced email and professional employment evidence, not CRM writes. ZeroBounce requires validation API access/credits.

The implementation workspace has no runtime verification credentials and its published allowlist excludes provider API hosts. All provider tests use isolated fictional responses. No live email or employment verification is claimed. On Preview, first configure an authorized provider, confirm data-processing permission and provider-host egress, then use the prospect workspace's explicit retry action on one authorized contact. Inspect proof, freshness and the full gate report; full historical clearance remains a separate unresolved capability.
