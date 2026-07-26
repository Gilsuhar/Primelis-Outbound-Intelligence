# Phase 1 Repository Audit

Repository: `Gilsuhar/Primelis-Outbound-Intelligence`

Audit date: 2026-07-26

## Scope

This audit covers repository truth and QA baseline only. No HubSpot integration
work was started, no Supabase settings were changed, no environment variables or
secrets were edited, and outreach, sequence, reply, and Signal Brain generation
behavior was not intentionally changed.

## Architecture Summary

The application is a Next.js App Router application written in strict
TypeScript. Product workflows live under `src/app`, UI feature modules live
under `src/features`, and server-side workflow logic lives under
`src/server/services`.

The database target is PostgreSQL through Prisma. The Prisma schema is in
`prisma/schema.prisma`, and Prisma Client is created through `src/lib/prisma.ts`.
Repository-level persistence abstractions live under `src/server/repositories`.
The adapter factory uses Prisma when `DATABASE_URL` exists and fixture fallback
only outside production when `DATABASE_URL` is missing.

## Primary Routes

Sales-user routes:

- `/`
- `/playbook`
- `/account-research`
- `/icp-insights`
- `/create-outreach`
- `/build-sequence`
- `/reply-to-prospect`
- `/ask-signal-brain`
- `/do-not-contact`

Knowledge-admin routes:

- `/knowledge-library`
- `/add-knowledge`
- `/review-queue`
- `/imported-signal-review`
- `/account-research/import`
- `/do-not-contact/import`
- `/claims/[claimId]`

## Authentication And Roles

Supabase Auth is used for the private preview. The app currently supports both
Google OAuth and magic-link sign-in. Magic-link initiation passes
`shouldCreateUser: false`.

Access is not granted by Supabase Auth alone. After Supabase authenticates the
user, `src/lib/auth/server.ts` resolves a matching application `User` record by
`authUserId` or normalized email. If no application user exists, the callback
signs the user out and redirects to login with an access-denied state.

Application roles are:

- `SALES_USER`
- `KNOWLEDGE_ADMIN`

Sales pages call `requireCurrentUser`. Admin pages call
`requireRole("KNOWLEDGE_ADMIN")`. Server actions use authenticated actor
wrappers so the creator/reviewer id comes from the session, not from client
input.

## AI Implementation

The AI provider layer is in `src/server/services/ai-provider.ts`.

When `AI_PROVIDER="openai"` and `OPENAI_API_KEY` are configured, the server uses
the OpenAI Responses API with `OPENAI_MODEL` or the default `gpt-5.4-mini`.
OpenAI is used by these workflow providers:

- Create Outreach: `src/server/services/create-outreach-provider.ts`
- Build Sequence: `src/server/services/build-sequence-provider.ts`
- Reply to Prospect: `src/server/services/reply-to-prospect-provider.ts`
- Ask Signal Brain: `src/server/services/ask-signal-brain-provider.ts`
- Draft refinement through the shared provider boundary

Each workflow starts with deterministic generation or policy-derived context,
then OpenAI can rewrite or improve the output using approved facts, source
references, safety policy, and workflow-specific writing instructions. If OpenAI
is missing, unavailable, rate-limited, unauthorized, or returns malformed JSON,
the service fails safely to deterministic output and surfaces provider status in
the result.

## Approved Knowledge And Safety

Approved-knowledge helpers return only approved material and keep draft,
restricted, archived, rejected, and needs-review material out of generation
context. Claims require source traceability before approval. Generated drafts are
stored separately from approved knowledge and cannot become approved knowledge
without explicit submit-for-review flow.

Do Not Contact and account status services check known suppression, client,
opportunity, and recent activity data before generation or export actions. The
HubSpot push service also checks suppression records before creating HubSpot
objects.

## HubSpot Status

The current repository already contains a limited HubSpot export service in
`src/server/services/hubspot-push-service.ts`. It uses
`HUBSPOT_PRIVATE_APP_TOKEN` when configured, searches or creates a company,
creates a note, and creates a review task.

This audit did not start or expand HubSpot integration. Remaining HubSpot work
should be treated as Phase 2+.

## QA Baseline

Commands run:

- `pnpm install`
- `pnpm prisma:validate`
- `pnpm prisma:generate`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm build`

Results:

- `pnpm install`: passed after allowing pnpm to update `node_modules`.
- `pnpm prisma:generate`: passed.
- `pnpm prisma:validate`: passed with temporary process-only database URLs
  because the local shell did not provide `DIRECT_URL`.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed after excluding local generated `outputs/` artifacts.
- `pnpm test`: passed with elevated process permission required by Windows for
  Vitest/esbuild worker spawning.
- `pnpm build`: passed with elevated process permission required by Windows for
  Next.js worker spawning.

Test count:

- 37 test files total.
- 36 passed.
- 1 skipped Prisma integration harness.
- 213 tests total.
- 212 passed.
- 1 skipped.

## Issues Fixed In Phase 1

`pnpm lint` failed because ESLint scanned the local `outputs/` artifact folder
and hit an inaccessible temporary directory. The fix adds `outputs/` to
`.gitignore` and `outputs/**` to the ESLint flat-config ignores. This prevents
generated artifacts from blocking QA or being committed.

No product behavior was changed.

## Remaining Risks

Critical:

- None found in this audit.

High:

- Production still depends on correct Vercel/Supabase environment variables.
  Missing `DATABASE_URL`, `DIRECT_URL`, Supabase URL/key, or OpenAI key will
  cause expected runtime limitations or safe fallback behavior.

Medium:

- Prisma integration tests are skipped unless a test database is configured.
- HubSpot export is a limited note/task push and not a full CRM sync,
  suppression resolver, or ownership workflow.
- Middleware gates session presence, while application user and route-role
  authorization are enforced in callback, pages, and server actions. This is
  acceptable for the current app, but route-access middleware could be expanded
  later for earlier redirects.

Low:

- Local Windows sandboxing may require elevated process permission for pnpm
  install, Vitest/esbuild, Next build workers, and Prisma engine access.

## Recommended Phase 2

- Add a dedicated test database profile so Prisma integration tests can run in
  CI.
- Add a small internal diagnostics page or server endpoint for OpenAI provider
  status, model name, and last safe-fallback reason.
- Decide whether HubSpot should remain a simple note/task export or become a
  real CRM integration with ownership, deal stage, and activity sync.
- Add production observability for generation provider status and fallback rate.
- Add route-access middleware coverage if earlier admin redirects become
  important.
