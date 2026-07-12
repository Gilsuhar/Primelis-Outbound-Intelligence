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
