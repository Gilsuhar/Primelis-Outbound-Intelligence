# Pre-Push Release Checklist

Use this before any push. Do not push until every required item is confirmed.

## Repository

- Current branch confirmed.
- Working tree clean.
- Commit order reviewed.
- Local commits reviewed against `origin/main`.
- No force-push planned.
- Git remote verified.

## Safety

- No secrets committed.
- No `.env` files committed.
- No credentials committed.
- No generated build output committed.
- No `.next` committed.
- No `node_modules` committed.
- No logs committed.
- No coverage output committed.
- No real customer data committed.
- No prospect personal data committed.
- No unexpected migration committed.

## Scope

- No HubSpot implementation added.
- No external research integration added.
- No scraping added.
- No analytics tracking added.
- No automated sending added.
- No pricing changes added.
- No authentication architecture changes added.
- No OpenAI model changes added.
- No production settings modified.

## QA

- `pnpm prisma:validate` passed.
- `pnpm prisma:generate` passed.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm test` passed.
- `pnpm build` passed.
- Phase 9 recommendation is acceptable.
- Signed-in QA completed or explicitly pending with documented blocker.

## After Push

- Confirm Vercel build starts from the expected commit.
- Confirm deployment status.
- Confirm preview URL opens.
- Run signed-in smoke checklist if not already completed.
- Know rollback path: revert deployment in Vercel and restore database backup only if a migration was intentionally applied.

