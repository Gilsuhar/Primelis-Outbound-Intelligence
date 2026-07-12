# Primelis Outbound Intelligence

Internal sales intelligence and messaging foundation for Primelis Signal.

## Scope

This foundation is Signal-only and English-only. It does not include AI generation,
automated email sending, LinkedIn automation, CRM integration, pricing generation,
web research, production authentication, analytics dashboards, or fake performance data.

## Stack

- Next.js App Router
- TypeScript strict mode
- Tailwind CSS
- PostgreSQL with Prisma
- Supabase-ready authentication placeholders
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

AI generation is not implemented yet. The `GeneratedDraft` boundary exists only
to protect future workflows:

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
