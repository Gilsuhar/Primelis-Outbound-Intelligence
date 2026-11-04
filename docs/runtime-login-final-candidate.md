# One-time restricted runtime LOGIN execution candidate

Reviewed implementation base: 62f02fb536f2cb4ed20f2f4b267524852e9ada7c.
Target: agent-workforce-preview / txfxfrlhtvzwgluhnbpw only.
This candidate changes documentation only. The activation runner, password adapter,
workflow, SQL guards, 11 migrations, Prisma schema and lockfile remain byte-for-byte
unchanged from that reviewed commit. No credential was generated or retrieved.

## Read-only evidence collected on 2026-11-04

Supabase management metadata confirmed the exact project, organization ID
ernouvntcojrxlahtbcr, us-west-2, ACTIVE_HEALTHY and PostgreSQL 17.11.
A boolean-only identity query matched the independently pinned cluster fingerprint,
database and administrative identity. A subsequent explicit READ ONLY transaction
evaluated the 16 fixed preflight conditions from activationAuditSql("preflight").
All 16 passed, including both transaction/default read-only settings. No row content,
password, password hash or fingerprint value was returned; only condition booleans.

- One approved confirmed, nonanonymous email/password Auth identity.
- One matching SALES_USER profile and exactly one intended identity/role-scoped SELECT policy.
- recycler_preview_app: NOLOGIN, password absent, nonprivileged, no inherited role membership.
- Only the five approved profile-column reads; no unexpected effective object access,
  write/ownership privileges or role settings. The reviewed administrator management
  membership remains exactly as provisioned, without SET or INHERIT capability.
- All 11 completed migration names/checksums, 50 expected tables, reviewed schema
  baseline, RLS and denied anon/authenticated access match. No extra application data.

These are management-channel observations, not proof of the future runner's pooler
connection. Actual-client verify-full, pinned CA/hostname, endpoint and fingerprint
checks remain mandatory during execution. No credentialed local psql session was run.

## Security review

The owner-only GitHub guard binds immutable repository/owner IDs, exact approved SHA,
SHA-named branch creation, non-force/non-update event, first attempt, environment and
sole Branch rule. Reruns, ordinary pushes, tags, schedules and dispatch are rejected.
The fixed workflow invokes only activate-runtime-login.mjs --plan followed by
activate-runtime-login.mjs --activate-runtime-login, with no retries or recovery path.

Only the password for recycler_preview_app can reach the private prompt adapter.
Input must be canonical base64url encoding of exactly 32 bytes, explicitly retained,
and different from the administrator password. No alternate target/role, TLS override,
extra URL parameter, application administrator fallback or local .env is accepted.
The trusted runner holds the staged secret in memory; JavaScript cannot guarantee
memory zeroization. It is not copied into command arguments, runtime password files,
Docker environment, workflow output, artifacts, caches or source.

The pinned native psql client reads fixed SQL from a file and gate/password responses
from private stdin, with no TTY. It releases SQL only after actual-client TLS evidence.
All 16 checks precede password delivery and run again inside the transaction. Native
\password and ALTER ROLE ... LOGIN are in that same transaction. COMMIT is withheld
until in-transaction checks and schema/privilege digests match. Failure before COMMIT
closes/rolls back the connection; a lost COMMIT acknowledgement is UNKNOWN, never a
reason to retry. A separate strict-TLS, read-only administrator postcheck verifies
LOGIN/SCRAM presence, restrictions, unchanged ACLs/memberships, history, schema and RLS.
Only this role's authorized LOGIN bit is normalized in the privilege comparison.
The administrator connection remains privileged and setup-only.

Local mocked tests prove the gates and failure control flow. The pinned Linux client
and real restricted-runtime Prisma acceptance have not been executed on this Windows
host. Live role password authentication and application-profile reads remain a separate
authorized acceptance step; successful administrator postchecks alone do not prove them.

## Owner-only credential staging (instructions, not executed)

1. In the existing approved password manager, create a new private item for this
   dedicated Preview role. Use its cryptographic **random bytes/key** facility for
   exactly 32 fresh bytes (256 bits), never a human password or a reused secret.
   Encode those bytes as base64url: standard Base64 with `+` changed to `-`, `/` to `_`,
   and trailing `=` removed. The result is exactly 43 characters. Perform encoding
   only in the trusted local manager/tool; never use an online encoder. A generator
   of arbitrary 43-character passwords is not equivalent and may fail canonical checks.
   If the approved manager cannot generate/encode raw random bytes, stop and identify
   that limitation before selecting an approved offline generator. Do not improvise
   with chat, terminal-output commands or workflow-generated credentials.
2. Save the credential in that encrypted private item before any staging. Keep it
   distinct from both the database administrator and Auth-user passwords. The owner
   must attest generation, uniqueness and retention; format validation cannot prove
   entropy. Do not use the sequential-byte test fixture.
3. Construct and retain the URL privately in the same manager using these exact fields:

   | Field | Required value |
   | --- | --- |
   | Scheme | postgresql |
   | Username | recycler_preview_app.txfxfrlhtvzwgluhnbpw |
   | Password | The retained 43-character base64url credential |
   | Host | aws-1-us-west-2.pooler.supabase.com |
   | Port | 5432 |
   | Database path | /postgres |
   | Query | sslmode=require&sslaccept=strict&connection_limit=1 |

   Base64url characters are URL-unreserved: use the retained value unchanged, with no
   percent encoding, padding, quotes, spaces, fragment or additional parameters.
   Do not place a populated URL in a command, file, chat, screenshot or diagnostic.
   The later Prisma runtime guard adds the pinned CA; the activation client separately
   enforces libpq verify-full. Neither accepts insecure certificate validation.
4. Open GitHub repository Settings → Environments → agent-workforce-preview-setup.
   Through the secret-entry interface, add environment Secret PREVIEW_RUNTIME_DATABASE_URL
   containing only the privately constructed URL. Use approved password-manager
   transfer/autofill; avoid clipboard history/cloud sync and clear transient clipboard
   content if the transfer uses it. Never use a CLI argument or shell echo pipeline.
   GitHub cannot return the stored value, so retain the original in the manager.
5. Add environment Variable PREVIEW_RUNTIME_CREDENTIAL_ATTESTATION with exactly
   `unique-random-32-bytes-retained`, only after steps 1–4 are complete.
6. Leave PREVIEW_SETUP_DATABASE_URL and PREVIEW_SETUP_APPROVED_ENDPOINT unchanged.
   The endpoint must remain `aws-1-us-west-2.pooler.supabase.com:5432`.
   Do not modify Vercel or copy administrator credentials into the application.

No password generation, password retrieval, GitHub setting changes or Vercel secret
changes are authorized or performed by this preparation task.

## Exact commit and one-time branch binding

Use the final commit reported with this candidate (not the implementation-base SHA).
It cannot be embedded into its own commit. Obtain it locally without exposing secrets:

```powershell
$candidateSha = git rev-parse HEAD
$executionBranch = 'codex/preview-migration-txfxfrlhtvzwgluhnbpw-' + $candidateSha
```

Set environment Variable PREVIEW_SETUP_APPROVED_SHA to that full reviewed SHA.
Replace old deployment rules with **one Branch rule**, exactly $executionBranch,
with no old Branch or Tag rules. Keep required reviewers disabled and administrator
bypass disabled; owner authorization remains enforced by the workflow and API checks.
Do not enable Actions debug output. No other environment additions are required.

The root vercel.json excludes exactly `codex/preview-migration-txfxfrlhtvzwgluhnbpw-*`
from native Vercel Git deployments; other branches including main retain their behavior.
This is not a universal guarantee against unrelated external automation: final
publication preflight must recheck current GitHub/Vercel automation and remote absence.
No branch is published by this task. The exact execution ref is created locally only.

Before publication, verify saved metadata, secret presence (not value), GitHub owner,
branch absence, project health and SSL Enforcement, and deployment exclusions. Obtain
separate explicit one-time publication/activation approval. Do not publish the ordinary
preparation branch, update an existing execution branch or replay a failed attempt.

The workflow's fresh live checks immediately before writing remain authoritative.
Today's successful database audit is not a substitute for them. Any failure stops
the attempt; no automatic credential replacement, NOLOGIN recovery or grant expansion.

## Validation

Executed locally on 2026-11-04 with credentials stripped and external networking
blocked by the existing validation wrapper:

| Check | Result |
| --- | --- |
| Focused runtime-login suite | 609 passed, 0 failed, 0 skipped (109 activation-specific tests) |
| Security | 212 passed, 0 failed, 0 skipped |
| Authentication/UI | 122 passed, 0 failed, 0 skipped |
| TypeScript / ESLint / Prisma validation | Passed |
| actionlint 1.7.12 | Passed; optional shellcheck not installed/executed |

Suites overlap; counts must not be added as unique tests. Final publication-file and
history secret-scan results are reported with the commit. No build, database mutation
or live credential login is implied by mocked test results.

References: [PostgreSQL psql password handling and file input](https://www.postgresql.org/docs/17/app-psql.html)
and [PostgreSQL connection parameters](https://www.postgresql.org/docs/17/libpq-connect.html#LIBPQ-PARAMKEYWORDS).
