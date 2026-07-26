# Phase 2 Role And Knowledge Safety Audit

Repository: `Gilsuhar/Primelis-Outbound-Intelligence`

Audit date: 2026-07-26

Base commit: `fed966a9384e9104beadb273fa795c6e3cd79a4f`

## Scope

This phase covered server-side role enforcement, admin route and server-action
protection, approved-only knowledge retrieval, claim/source invariants, and
generation safety boundaries.

No HubSpot integration work was started. No UI redesign was performed. No
environment files, secrets, generated artifacts, or personal/customer data were
added. Outreach, sequence, reply, and commercial copy strategy were not
intentionally changed.

## Supported Roles

The application roles currently supported by the repository are:

- `SALES_USER`
- `KNOWLEDGE_ADMIN`

Authenticated Supabase users are resolved into application users in
`src/lib/auth/server.ts`. The app profile is loaded through
`resolveApplicationUser`, which matches by Supabase `authUserId` first and then
by normalized email. Page-level role checks use `requireCurrentUser` and
`requireRole("KNOWLEDGE_ADMIN")`. Server actions use actor wrappers in
`src/lib/auth/action-actor.ts` so client-provided actor or creator ids are not
trusted.

## Route Matrix

| Route | Authentication | Required role | Enforcement location | Server-side protection | Direct URL risk |
| --- | --- | --- | --- | --- | --- |
| `/login` | No | Public | Login page | Yes | Low |
| `/auth/callback` | No | Public callback | Callback route | Yes | Low |
| `/` | Yes | `SALES_USER` or `KNOWLEDGE_ADMIN` | Page calls `requireCurrentUser` | Yes | Low |
| `/playbook` | Yes | `SALES_USER` or `KNOWLEDGE_ADMIN` | Page calls `requireCurrentUser` | Yes | Low |
| `/account-research` | Yes | `SALES_USER` or `KNOWLEDGE_ADMIN` | Page calls `requireCurrentUser` | Yes | Low |
| `/icp-insights` | Yes | `SALES_USER` or `KNOWLEDGE_ADMIN` | Page calls `requireCurrentUser` | Yes | Low |
| `/create-outreach` | Yes | `SALES_USER` or `KNOWLEDGE_ADMIN` | Page calls `requireCurrentUser` | Yes | Low |
| `/build-sequence` | Yes | `SALES_USER` or `KNOWLEDGE_ADMIN` | Page calls `requireCurrentUser` | Yes | Low |
| `/reply-to-prospect` | Yes | `SALES_USER` or `KNOWLEDGE_ADMIN` | Page calls `requireCurrentUser` | Yes | Low |
| `/ask-signal-brain` | Yes | `SALES_USER` or `KNOWLEDGE_ADMIN` | Page calls `requireCurrentUser` | Yes | Low |
| `/do-not-contact` | Yes | `SALES_USER` or `KNOWLEDGE_ADMIN` | Page calls `requireCurrentUser` | Yes | Low |
| `/knowledge-library` | Yes | `KNOWLEDGE_ADMIN` | Page calls `requireRole` | Yes | Low |
| `/add-knowledge` | Yes | `KNOWLEDGE_ADMIN` | Page calls `requireRole` | Yes | Low |
| `/review-queue` | Yes | `KNOWLEDGE_ADMIN` | Page calls `requireRole` | Yes | Low |
| `/imported-signal-review` | Yes | `KNOWLEDGE_ADMIN` | Page calls `requireRole` | Yes | Low |
| `/claims/[claimId]` | Yes | `KNOWLEDGE_ADMIN` | Page calls `requireRole` | Yes | Low |
| `/do-not-contact/import` | Yes | `KNOWLEDGE_ADMIN` | Page calls `requireRole` | Yes | Low |
| `/account-research/import` | Yes | `KNOWLEDGE_ADMIN` | Page calls `requireRole` | Yes | Low |

`src/lib/private-preview-auth.ts` mirrors these route groups for private-preview
access checks. Hidden navigation is not treated as authorization.

## Server Action Matrix

| Action | Authentication | Required role | Enforcement location | Direct action risk |
| --- | --- | --- | --- | --- |
| `requestLoginLink` | No | Public login | Login action | Low |
| `continueWithGoogle` | No | Public login | Login action | Low |
| `signOutAction` | Session operation | Current session | Login action | Low |
| `assessAccountResearchAction` | Yes | `SALES_USER` or `KNOWLEDGE_ADMIN` | `withAuthenticatedCreator` | Low |
| `researchCompanyWebsiteAction` | Yes | `SALES_USER` or `KNOWLEDGE_ADMIN` | `withAuthenticatedCreator` | Low |
| `enrichCompanyAndContactsAction` | Yes | `SALES_USER` or `KNOWLEDGE_ADMIN` | `withAuthenticatedCreator` | Low |
| `checkAccountStatusAction` | Yes | `SALES_USER` or `KNOWLEDGE_ADMIN` | `withAuthenticatedCreator` | Low |
| `generateCreateOutreachAction` | Yes | `SALES_USER` or `KNOWLEDGE_ADMIN` | `withAuthenticatedCreator` | Low |
| `generateBuildSequenceAction` | Yes | `SALES_USER` or `KNOWLEDGE_ADMIN` | `withAuthenticatedCreator` | Low |
| `pushSequenceToHubSpotAction` | Yes | `SALES_USER` or `KNOWLEDGE_ADMIN` | `withAuthenticatedCreator` plus suppression checks | Low |
| `generateReplyToProspectAction` | Yes | `SALES_USER` or `KNOWLEDGE_ADMIN` | `withAuthenticatedCreator` plus service actor check | Low |
| `askSignalBrainAction` | Yes | `SALES_USER` or `KNOWLEDGE_ADMIN` | `withAuthenticatedCreator` | Low |
| Draft refinement actions | Yes | `SALES_USER` or `KNOWLEDGE_ADMIN` | `withAuthenticatedCreator` | Low |
| `createKnowledgeSubmissionAction` | Yes | `SALES_USER` or `KNOWLEDGE_ADMIN` | `withAuthenticatedCreator` | Low |
| `reviewImportedSignalRecordAction` | Yes | `KNOWLEDGE_ADMIN` | `withAuthenticatedReviewActor` plus service review policy | Low |
| `bulkReviewImportedSignalRecordsAction` | Yes | `KNOWLEDGE_ADMIN` | `withAuthenticatedReviewActor` plus service review policy | Low |
| `previewSuppressionImportAction` | Yes | `KNOWLEDGE_ADMIN` | `withAuthenticatedReviewActor` plus service admin check | Low |
| `confirmSuppressionImportAction` | Yes | `KNOWLEDGE_ADMIN` | `withAuthenticatedReviewActor` plus service admin check | Low |
| `previewCompanyContactImportAction` | Yes | `KNOWLEDGE_ADMIN` | `withAuthenticatedReviewActor` plus service admin check | Low |
| `confirmCompanyContactImportAction` | Yes | `KNOWLEDGE_ADMIN` | `withAuthenticatedReviewActor` plus service admin check | Low |

`createKnowledgeSubmissionAction` intentionally allows authenticated users to
create review submissions. It does not approve, reject, restrict, archive, or
publish knowledge.

## Repository And Service Boundaries

Admin/review-only flows can return non-approved records for review pages:

- Imported Signal review retrieval
- Knowledge library and review queue retrieval
- Claim detail retrieval by id
- Review-history and status-transition flows

Generation-facing flows must use approved-only material:

- Create Outreach
- Build Sequence
- Reply to Prospect
- Ask Signal Brain
- Shared approved claim and proof-selection helpers
- Fixture and Prisma repository adapters

## Authorization Defects Found And Fixed

The Reply to Prospect service relied on the authenticated server action wrapper
but did not independently verify the actor at the service boundary. This was
hardened so direct service calls require an existing `SALES_USER` or
`KNOWLEDGE_ADMIN` actor before generating a reply.

Actor wrappers were covered with regression tests to confirm that client-supplied
`creatorId`, `actorId`, or role-like values are ignored and replaced with the
session-resolved application user.

## Knowledge-Safety Defects Found And Fixed

Some generation-facing case-study queries allowed `NEEDS_REVIEW` case studies to
be retrieved alongside `APPROVED` records. This could have allowed review-only
proof to enter Create Outreach, Build Sequence, or Ask Signal Brain prompts.

The queries were tightened to `APPROVED` only, and service-level eligibility
filters now reject any record with a present `approvalStatus` other than
`APPROVED`. This provides a second boundary in case a repository implementation
or fixture returns broader data.

## Approved-Only Retrieval Paths

Create Outreach passes only records that satisfy source, channel, text, and
approved-status eligibility into the AI provider. Case-study proof is restricted
to approved records.

Build Sequence applies the same approved-only filtering to product knowledge,
messages, objections, and case-study proof before prompt construction.

Reply to Prospect retrieves approved knowledge only and re-filters records before
they can be used as response context.

Ask Signal Brain combines approved playbook records, approved knowledge items,
and approved case studies. Restricted, rejected, archived, draft, and
needs-review records are excluded from model context.

## Claim And Source Invariants

The central status-transition matrix in `src/features/review/status-transition.ts`
continues to enforce allowed transitions and role requirements.

Factual claims cannot be approved without at least one source. Approved factual
claims cannot lose their final source. Failed transitions do not create review
history entries, while successful transitions do. Generated drafts remain
separate from approved claims and cannot be converted into approved knowledge
without review.

## Generation Input Boundaries

The reviewed generation services pass structured briefs, approved facts, source
references, approved examples, and safety policy to the provider layer. Raw
database objects are not serialized into prompts. User-provided account context
stays in the request brief and is not promoted into verified product truth.

Prompt tone, copy strategy, and commercial structure were intentionally left
unchanged in this phase.

## Tests Added Or Updated

- `src/lib/auth/action-actor.test.ts`
- `src/lib/private-preview-auth.test.ts`
- `src/server/services/create-outreach-service.test.ts`
- `src/server/services/build-sequence-service.test.ts`
- `src/server/services/reply-to-prospect-service.test.ts`
- `src/server/services/ask-signal-brain-service.test.ts`
- `src/test/server-only.ts`
- `vitest.config.ts`

Coverage added for session actor enforcement, admin route classification,
client-provided actor overwrites, service actor authorization, exclusion of
draft, needs-review, restricted, archived, and rejected knowledge, and approved
case-study filtering in generation.

## Remaining Risks

Critical:

- None found.

High:

- None found.

Medium:

- Prisma integration tests remain skipped unless a test database is configured,
  so SQL filters are primarily validated through service and repository-unit
  coverage in this local run.
- `transitionReviewStatus` in `src/server/services/review-status-service.ts`
  still resolves actors through fixture user data. No current app route or
  action exposes this legacy path directly, but it should be repository-backed
  before any new production caller uses it.
- Middleware gates private-preview session presence, while page and action code
  enforce application profile and role access. This is acceptable in the current
  app, but central route-role middleware could reduce duplication later.

Low:

- Local Windows sandboxing can require elevated process permission for Prisma,
  Vitest/esbuild, and Next.js build workers.
- Authenticated users can submit knowledge for review through
  `createKnowledgeSubmissionAction`; this is not a publishing action, but the
  behavior should remain explicit in product policy.

## Recommended Phase 3 Scope

- Add a real database-backed Prisma integration test profile for approved-only
  retrieval and review transitions.
- Add provider diagnostics for OpenAI fallback rate, malformed output, and model
  status.
- Decide separately whether route-role checks should also be centralized in
  middleware.
- Treat HubSpot ownership, deal-stage, and activity sync as a separate scoped
  phase.
