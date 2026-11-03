# Draft-only isolated Preview readiness — October 17, 2026

Scope: `feature/agent-workforce-foundation`, source baseline `eb1323f`. GitHub API confirmed repository pull/push permissions. The shell's Git proxy was unreachable; the exact latest source tree was retrieved and checked using the connected GitHub API. Existing local history was retained.

## Audit and product decision

Reviewed the repository's production-readiness audit, business-quality audit, OIQ implementation and first-live-run checklist. No separately named independent pre-launch audit was present in the latest repository or attached to this request. This change addresses the specific P0/P1 findings described in the task; it does not claim to close an unseen independent report.

Agent Workforce prepares editorial content, never sends or enrolls. `DRAFT_ALLOWED` and strict send eligibility are separate decisions. Unknown history, employment or verification does not prevent review-only writing. Confirmed invalid current email, irrelevant persona, suppression, unsubscribe, bounce, complaint, conflicting opportunity, outside-owned intake and known company ICP exclusions prevent drafting and expensive research. Existing four-calendar-month, active-sequence, employment, independent email and authoritative history rules still determine eligibility without relaxation. Content approval never grants sending permission.

The Daily Engine retains incomplete Outreach sync as an error and, after bounded retries, continues editorial processing from already synchronized HubSpot records. The daily report is PARTIAL, never a successful history import. Missing/failed research can lead to Insight-led writing without pretending research succeeded. Verification and eligibility remain separate.

## Writing and review

- EVIDENCE_LED reuses current reviewed research, quotes and sources. Draft validation checks supplied sources and claims without requiring an exact public-page spelling of the intake job title. Independent employment verification remains mandatory for send eligibility.
- INSIGHT_LED removes unverified account/person facts, SERP observations and opportunity assertions from writer context. Approved Signal knowledge and relevant role context are mandatory. The existing strategist, creative writer and independent reviewer perform the same bounded workflow; no templates or new agent are added.
- OIQ keeps its evidence-led weights and absolute unsupported-claim blocks. In Insight-led mode, the 30-point component evaluates professional insight specificity and the 25-point component evaluates approved-knowledge grounding/accuracy. Search relevance, commercial angle and writing retain 20/15/10 points. A company-swap result is disclosed, but is not a compulsory account-personalization cap in this mode. Generic benefits can still score poorly. Scores are editorial judgments, not response probabilities.
- Knowledge references link approved registry sources. No observation timestamp is invented for knowledge records without one. Missing SERP is acceptable for conditional questions; an alleged observation without evidence blocks review.
- Draft Studio displays mode, limitations and current eligibility. Version history, edits, regeneration, content-only approval and dependency invalidation remain. Temporary database/provider check failures hide content and disable actions without overwriting valid saved versions; confirmed dependency changes invalidate approvals.

## Security preparation — not applied

`20261017130000_restrict_application_data_api` is an additive, unapplied Prisma SQL migration. It enables RLS and revokes PUBLIC/anon/authenticated table privileges on the application's explicit model and relationship table list, including migration history. It preserves unrelated Legacy tables, Auth schemas, existing policies and server role grants. Application data is accessed by server Prisma; browser clients use Supabase Auth, not direct table access.

Before an administrator applies it **to isolated Preview only**:

1. Confirm the project is independent of Production and take a database/grant backup. Review every named table and dependent view/function/RPC; existing custom views and SECURITY DEFINER functions require separate live privilege inspection.
2. Confirm the Prisma server connection is the table owner or an appropriately authorized server role. A non-owner without policies will fail closed after RLS. Do not grant broad browser privileges to fix it.
3. Run the existing migrations in order only under a separately authorized maintenance operation with the isolated database and direct URLs explicitly selected. No migration was executed by this task.
4. Verify signed-out and signed-in Data API clients cannot read/write application tables; verify authenticated server UI/API operations still work. SQL was statically reviewed, not executed against any database.
5. Recovery: keep API access closed. Restore reviewed server-role grants from the backup if necessary; do not disable RLS or blindly restore public grants. No destructive down migration is provided.

Auth binding requires a server-verified `getUser()` identity with a confirmed email and rejects anonymous users. User-editable metadata cannot establish verification. Existing allowlist, conflicting-binding checks and atomic null-binding guard remain.

## Exact Preview configuration

New Preview-only bindings:

- `NEXT_PUBLIC_PREVIEW_SUPABASE_PROJECT_REF`
- `NEXT_PUBLIC_PREVIEW_SUPABASE_URL`
- `NEXT_PUBLIC_PREVIEW_SUPABASE_PUBLISHABLE_KEY`
- `PREVIEW_DATABASE_URL`
- `PREVIEW_DIRECT_URL` (maintenance operator only; application runtime does not read it)

The URL must match the explicitly selected Preview project reference. Database direct host or Supabase pooler username must refer to the same project. Generic `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` and anonymous keys are never Preview fallbacks. An administrator must independently verify that the selected project is not Production; code cannot infer credential ownership. Production/local configuration retains its existing names. Preview OAuth URLs must use a valid deployment host, without falling back to the configured Production app URL.

Also required for a real draft: `INTEGRATION_OPERATOR_USER_ID`, preapproved application User, Google provider/redirect configuration in the isolated Auth project, approved EMAIL-scoped Signal PRODUCT knowledge with approved sources, `OPENAI_API_KEY`, supported configured model and existing cost/pricing/budget configuration. HubSpot read-only authentication and a successful owner-scoped sync are required to supply a real contact. Outreach, independent verification, Similarweb and SERP are not required for Insight-led editorial drafting; they remain necessary where strict send eligibility or an evidence claim depends on them.

No environment values, provider secrets, deployment settings or Production data were inspected or changed. No new paid provider or infrastructure dependency was added. AI generation still incurs existing configured model charges under existing limits.

## Sunday isolated test

Current decision: **NO-GO until isolation/access-control prerequisites are verified.** The actual engine lifecycle, using controlled synthetic model responses, proves that a HOLD contact can receive a four-email review-only draft without becoming send-eligible. This is not live model or API acceptance.

After administrator verification of the bindings and table-access fix:

1. Access the protected Preview through existing authorized Vercel access. Sign in with the preapproved, confirmed Google identity. Do not disable protection.
2. Synchronize one authorized owner's HubSpot contact (`1087915602`) into isolated Preview. Keep Outreach history UNKNOWN if unavailable.
3. Open its existing workspace and select Prepare / refresh drafts. Without verified research, expect INSIGHT_LED, explicit research limitations, strict HOLD and NOT SEND ELIGIBLE.
4. Confirm three real paid stages (strategy, writing, review), four distinct emails, approved-knowledge references, model usage and OIQ. Inspect every account/person claim for invented observations.
5. Edit, re-review and approve content only. Change relevant evidence and confirm invalidation. Confirm no sends, enrollments or CRM writes.
6. Only after a successful authenticated real run should the isolated test be accepted. Keep the daily scheduler disabled pending separate live validation.

No deployment, migration or live-provider run was performed by this change.

## Executed validation

TypeScript and ESLint passed. Full Vitest: **1,144 passed, 0 failed, 5 skipped** across 114 files. The five isolated PostgreSQL tests were skipped because no explicit local fixture database was selected; no database was accessed or migrated. The production build passed. Synthetic lifecycle/model results do not establish live API access, live writing quality, Preview isolation, deployed RLS or successful Google sign-in.

## Files changed from the published baseline

- `.env.example`
- `docs/agent-workforce-draft-only-preview-readiness.md`
- `prisma/migrations/20261017130000_restrict_application_data_api/migration.sql`
- `src/app/api/sales-agent/workforce/route.test.ts`
- `src/app/auth/callback/route.test.ts`
- `src/app/auth/callback/route.ts`
- `src/features/agent-workforce/dashboard/dashboard-client.test.tsx`
- `src/features/agent-workforce/dashboard/draft-studio-panel.test.tsx`
- `src/features/agent-workforce/dashboard/draft-studio-panel.tsx`
- `src/features/agent-workforce/dashboard/oiq-review.tsx`
- `src/features/agent-workforce/gate-a-contracts.ts`
- `src/features/agent-workforce/oiq-contracts.ts`
- `src/lib/auth/env.test.ts`
- `src/lib/auth/env.ts`
- `src/lib/auth/profile-binding.test.ts`
- `src/lib/auth/server.ts`
- `src/lib/preview-isolation.test.ts`
- `src/lib/preview-isolation.ts`
- `src/lib/prisma.ts`
- `src/server/agent-workforce/business-quality.test.ts`
- `src/server/agent-workforce/commercial-quality.ts`
- `src/server/agent-workforce/creative-agents.ts`
- `src/server/agent-workforce/daily/engine.test.ts`
- `src/server/agent-workforce/daily/engine.ts`
- `src/server/agent-workforce/daily/handlers.test.ts`
- `src/server/agent-workforce/daily/handlers.ts`
- `src/server/agent-workforce/dashboard/service.ts`
- `src/server/agent-workforce/draft-access.test.ts`
- `src/server/agent-workforce/draft-access.ts`
- `src/server/agent-workforce/draft-studio/engine.test.ts`
- `src/server/agent-workforce/draft-studio/engine.ts`
- `src/server/agent-workforce/evidence-validation.ts`
- `src/server/agent-workforce/http.ts`
- `src/server/agent-workforce/knowledge-agent.ts`
- `src/server/agent-workforce/lifecycle.test.ts`
- `src/server/agent-workforce/oiq.test.ts`
- `src/server/agent-workforce/oiq.ts`
- `src/server/agent-workforce/orchestrator.test.ts`
- `src/server/agent-workforce/orchestrator.ts`
- `src/server/agent-workforce/outreach-writing-mode.ts`
- `src/server/agent-workforce/prospect-research/engine.ts`
- `src/server/agent-workforce/store.ts`
- `src/server/integrations/store.ts`
- `src/server/repositories/adapter-factory.ts`
- `src/server/sales-agent/approved-draft-proof.ts`
- `src/server/sales-agent/evidence-store.ts`
- `src/test/workforce-fixtures.ts`
