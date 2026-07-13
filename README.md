# Primelis Outbound Intelligence

Internal sales intelligence and messaging foundation for Primelis Signal.

## Scope

This foundation is Signal-only and English-only. It does not include automated
email sending, LinkedIn automation, CRM integration, pricing generation, public
signup, analytics dashboards, or fake performance data.

## Stack

- Next.js App Router
- TypeScript strict mode
- Tailwind CSS
- PostgreSQL with Prisma
- Supabase Auth private preview
- Zod
- pnpm
- ESLint
- Prettier
- Vitest

## Database

PostgreSQL is the intended database. Copy `.env.example` to `.env` and set
`DATABASE_URL` to either a local PostgreSQL database or a Supabase PostgreSQL
connection string.

The foundation deliberately does not invent credentials and does not switch the
production design to SQLite.

Useful commands:

```bash
pnpm install
pnpm prisma:validate
pnpm prisma:generate
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

### Local PostgreSQL

1. Create a local PostgreSQL database.
2. Copy `.env.example` to `.env`.
3. Set `DATABASE_URL` to the local PostgreSQL connection string.
4. Set `DIRECT_URL` to the same value unless your migration workflow needs a
   separate direct connection.
5. Run:

```bash
pnpm prisma:validate
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
```

### Supabase PostgreSQL

1. Create a Supabase project and use the PostgreSQL connection string.
2. Set `DATABASE_URL` to the pooled or app connection string appropriate for the
   runtime.
3. Set `DIRECT_URL` to the direct database connection string for migrations.
4. Run the same Prisma validation, generate, migration, and seed commands.

Supabase Auth is required for private preview access. Supabase Storage is not
required.

## Private Preview Authentication

The app uses Supabase Auth magic links for invited users only. Public signup
must remain disabled in the Supabase dashboard. The app also passes
`shouldCreateUser: false` when requesting magic links, so users must be invited
or created in Supabase Auth before they can receive access.

Roles are trusted from the application `User` table, not from client fields or
user-editable metadata. Supported private preview roles are:

- `SALES`: stored internally as `SALES_USER`
- `KNOWLEDGE_ADMIN`: stored internally as `KNOWLEDGE_ADMIN`

An invited user must have a matching row in `User.email`. On first successful
login, the app links the Supabase Auth user id to `User.authUserId`. If no
matching profile row exists, authentication succeeds at Supabase but the app
does not grant workspace access.

Minimal invite and role assignment flow:

1. Invite or create the user in Supabase Auth.
2. Insert or update the matching application profile row with the user email and
   one of the two trusted roles.
3. Keep public signup disabled.
4. Configure the Supabase Auth site URL and redirect URLs for the private
   preview deployment, including `/auth/callback`.

Required environment labels:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public"
DIRECT_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public"
NEXT_PUBLIC_SUPABASE_URL="https://PROJECT_REF.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="PUBLIC_ANON_OR_PUBLISHABLE_KEY"
NEXT_PUBLIC_APP_URL="https://PRIVATE_PREVIEW_APP_URL"
AI_PROVIDER=""
OPENAI_API_KEY=""
OPENAI_MODEL=""
```

Do not add a service-role key unless a future server-only admin operation truly
requires it. No service-role key is required for the current private preview.

### Deployment Readiness

Use Vercel with the same environment labels configured in project settings. The
build command is:

```bash
pnpm build
```

Prisma Client generation runs during install through `postinstall`. Apply
migrations deliberately before preview use:

```bash
pnpm prisma:validate
pnpm prisma:generate
pnpm prisma migrate deploy
```

Do not run migrations automatically on every request. Do not reset the database.
Rollback is the normal Vercel deployment rollback plus restoring the previous
database backup if a migration needs to be reversed.

### Fixture Fallback

When `DATABASE_URL` is unavailable in development or test, the application uses
the fixture adapter explicitly. This keeps local screens usable while the
database is not configured. Production does not silently fall back to fixtures:
`DATABASE_URL` is required.

The active adapter is selected in `src/server/repositories/adapter-factory.ts`.
Repository interfaces live in `src/server/repositories/types.ts`, with fixture
and Prisma implementations behind the same service boundaries.

### Migrations And Seed

The initial migration SQL lives under `prisma/migrations/`. If no database is
configured, migration SQL can still be reviewed safely. Once `DATABASE_URL` and
`DIRECT_URL` are configured, run:

```bash
pnpm prisma:migrate
pnpm prisma:seed
```

The seed uses generic development data only. It does not include real Primelis,
Signal, customer, competitor, savings, pricing, or performance claims.

### Troubleshooting

- `DATABASE_URL` missing: development/test use fixture fallback; production
  fails intentionally.
- `DIRECT_URL` missing: set it to the direct PostgreSQL connection for Supabase
  migrations, or to `DATABASE_URL` for local PostgreSQL.
- Prisma Client outdated: run `pnpm prisma:generate` after schema changes.
- Database unavailable: run fixture-backed tests and defer migration/seed until
  a database connection is configured.

## Knowledge Safety Principles

- Factual claims must be traceable to one or more source documents.
- Claims cannot be approved without a source.
- Approved and unapproved knowledge are separated by application helpers.
- Restricted, draft, rejected, archived, and needs-review material must not be
  returned by approved-knowledge helpers.
- Generated drafts are structurally separate from approved knowledge and cannot
  become approved knowledge automatically.

## Approved-Only Retrieval

Generation-facing retrieval must use the approved-knowledge query layer. These
helpers return only `APPROVED` records and exclude `DRAFT`, `NEEDS_REVIEW`,
`RESTRICTED`, `ARCHIVED`, and `REJECTED` material. Restricted material is never
returned by default generation helpers.

Admin-facing review queries live separately and may retrieve non-approved
records for review workflows. UI filtering is not treated as a safety boundary.

## Status Transitions

Review status changes go through the centralized transition service. Only
`KNOWLEDGE_ADMIN` can approve, restrict, archive, reject, or return items to
review.

Allowed transition matrix:

- `DRAFT` -> `NEEDS_REVIEW`, `ARCHIVED`
- `NEEDS_REVIEW` -> `APPROVED`, `RESTRICTED`, `REJECTED`, `ARCHIVED`
- `APPROVED` -> `RESTRICTED`, `ARCHIVED`, `NEEDS_REVIEW`
- `RESTRICTED` -> `NEEDS_REVIEW`, `ARCHIVED`, `REJECTED`
- `ARCHIVED` -> `NEEDS_REVIEW`
- `REJECTED` -> `NEEDS_REVIEW`

Archived and rejected items cannot move directly to `APPROVED`; they must first
return to `NEEDS_REVIEW`. Successful transitions create review-history entries.
Failed transitions return structured errors and do not create history.

## Claim Invariants

Factual claims require at least one source before approval. Multiple sources are
supported. Removing the final source from an approved factual claim is blocked,
which preserves traceability rather than silently changing approval state.

## Generated Draft Separation

AI generation, retrieval, embeddings, and LLM APIs are not implemented yet. The
`GeneratedDraft` boundary exists only to protect future workflows:

- A generated draft is not knowledge.
- A generated draft cannot be approved.
- A generated draft cannot appear in approved-knowledge queries.
- A generated draft cannot become a claim or knowledge item directly.
- It may only become a knowledge submission through explicit submit-for-review.
- Generated-draft submissions default to `NEEDS_REVIEW` and preserve origin
  metadata.

## Fixture Adapter Architecture

Current services use in-memory fixture adapters. Server-side boundaries exist
for creating submissions, transitioning review status, retrieving approved
knowledge, and submitting generated drafts for review. These boundaries validate
inputs with Zod and return structured success/error results.

The adapter shape is intentionally swappable so a future Prisma/PostgreSQL
adapter can replace fixtures without changing the safety rules or UI permission
model.
