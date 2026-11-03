# Dedicated Preview initialization (prepared, not executed)

Target verified read-only on 2026-11-03: `agent-workforce-preview`, project
`txfxfrlhtvzwgluhnbpw`, Primelis (`ernouvntcojrxlahtbcr`), **us-west-2**.
Neither legacy Primelis project nor any other reference is permitted. The user provisioned
the project separately. This implementation has not run migrations, created credentials/users,
or configured Vercel. See [verification and execution sequence](preview-project-verification.md).

1. Recheck the management identity against `scripts/preview/verified-target.json` and obtain
   separate schema-initialization approval. Verify that no application objects have appeared.
   Record the approved direct endpoint from Connect; do not infer identity from the name alone.
2. In an isolated operator shell, supply only `PREVIEW_SETUP_PROJECT_NAME`,
   `PREVIEW_SETUP_APPROVED_PROJECT_REF`, `PREVIEW_SETUP_APPROVED_ENDPOINT`,
   `PREVIEW_SETUP_DATABASE_URL` and `PREVIEW_SETUP_APPROVAL=initialize:<approved-ref>` through secure
   configuration. The URL is the administrator's direct port-5432 connection with strict TLS.
   Do not place it in Vercel, source files or shell command arguments. Clear DATABASE_URL/DIRECT_URL.
3. `node scripts/preview/setup.mjs --plan` validates without connecting. After **separate migration
   approval**, `node scripts/preview/setup.mjs --execute-approved-initialization` checks that public
   has no relations or types and invokes Prisma migrate deploy for the exact eleven migration names.
   Before this check, it matches a SHA-256 fingerprint of PostgreSQL's system identifier against
   the independently inspected project. The digest is metadata, not a credential. It allows the
   platform's pre-existing `rls_auto_enable` routine; it does not claim the whole database is empty.
   It refuses Vercel and unapproved CI execution, legacy identities, fallback credentials and insecure/unknown URL
   options. It never invokes seed, research or workers. Child diagnostics are suppressed.
   The narrowly scoped manual GitHub Actions path and explicitly approved session-pooler support
   are documented in [the cloud migration runner](preview-cloud-migration-runner.md). Direct
   connectivity still requires a working network path; IPv6 availability is never assumed.
4. After separate role approval, apply all of `scripts/preview/runtime-role.sql` on that project
   in one batch with stop-on-error. Its transaction checks the observed cluster fingerprint and
   completed migration history before any mutation. It creates a NOLOGIN role
   without ownership, DDL, writes, sequence access or BYPASSRLS. After explicit user binding, set a
   role password securely and enable LOGIN through separately approved administration. Do not reuse
   any production password. Audit effective grants, memberships and PUBLIC privileges before use.
   `bind-test-user.sql` independently checks the same cluster fingerprint, database/operator,
   NOLOGIN restricted role, absence of memberships and User RLS before inserting anything.
   Never strip these guards, substitute a project-name GUC, or execute only part of a script.
   If the project is restored, recreated or cloned, stop for fresh management/database verification
   before reviewing the fingerprint pin. The pin is not a defense against an administrator editing
   these scripts; use the reviewed files and the verified TLS endpoint together.
5. Only profile SELECT of id/authUserId/email/name/role is needed by authenticated synthetic Recycler
   review. RLS requires a separately installed approved-user policy. No auth-schema or integration
   table grants are needed. Other application pages may fail closed with this restricted role;
   do not grant broad access to make them work. Direct Prisma does not populate auth.uid().

## Branch configuration matrix

Every manual binding below is **Preview + exact branch**
`codex/cloud-release-candidate-20261102-192938`, never Production. Vercel's identity variables are
platform-provided. Verify effective values; matching names do not establish resource isolation.

| Names | Required value/source | Exposure |
| --- | --- | --- |
| PREVIEW_APPROVED_VERCEL_PROJECT_ID | prj_sicQocH4juE1Nr5gGpSA61mThxBT, equal VERCEL_PROJECT_ID | server |
| PREVIEW_APPROVED_BRANCH | exact branch above, equal VERCEL_GIT_COMMIT_REF | server |
| PREVIEW_APPROVED_SUPABASE_PROJECT_REF | newly approved project reference | server |
| PREVIEW_APPROVED_DATABASE_ENDPOINT | exact new project's Connect pooler host:6543 (or approved direct host:5432) | server |
| PREVIEW_APPROVED_DATABASE_ROLE | recycler_preview_app | server |
| PREVIEW_DATABASE_URL | dedicated runtime role; pooled username recycler_preview_app.<ref>; /postgres; sslmode=require&sslaccept=strict; pooler pgbouncer=true&connection_limit=1 | secret, server |
| NEXT_PUBLIC_PREVIEW_SUPABASE_PROJECT_REF | same new reference | public |
| NEXT_PUBLIC_PREVIEW_SUPABASE_URL | exact https://<ref>.supabase.co | public |
| NEXT_PUBLIC_PREVIEW_SUPABASE_PUBLISHABLE_KEY | new project's publishable key only | public |
| DATABASE_URL, DIRECT_URL, PREVIEW_DIRECT_URL | neutralize inherited bindings with empty branch-specific values; no admin URL | server |
| NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_APP_URL | neutralize inherited production bindings; Preview Auth uses explicit Preview variables and Vercel HTTPS host | public |
| OPENAI_API_KEY, OPENAI_MODEL, AI_PROVIDER, HUBSPOT_ACCESS_TOKEN and every inherited provider/Outreach/encryption/worker secret | neutralize exact inherited names; no live integrations or paid execution | server |
| LOCAL_DEV_LOGIN, LOCAL_DEV_SESSION_TOKEN, SUPABASE_SERVICE_ROLE_KEY, PREVIEW_SETUP_* | absent; never transfer setup/local/admin secrets | server |

The inheritance audit must cover all current bindings, not just this known list. Unknown bindings
require review. No flag enables providers, CRM, refresh, writes or workers under Preview policy.
Do not add a cron schedule. Verify project-level install/build overrides remain pnpm install and
pnpm build without migration hooks. The automated hook test and offline production build cover the
repository commands; they cannot certify Vercel dashboard overrides.

## Rollback and remaining checks

If initialization fails, stop; the tool deliberately rejects a nonempty schema on retry. Inspect
Prisma migration metadata securely before approving recovery. Never reset a database automatically.
Revoke the dedicated runtime role's LOGIN and disable the branch deployment before removing its
neutralizing overrides. Retain the isolated project for diagnosis unless deletion is separately
approved. No Production resource or secret is changed by this procedure.

Live verification still required: ownership, actual effective privileges/RLS, installed schema,
test-user binding, strict TLS connection and auth, deployment protection, effective branch env and
absence of inherited credentials. Configuration validation is not proof of these facts.
