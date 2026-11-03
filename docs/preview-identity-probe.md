# One read-only identity probe (Phase 4N)

Local preparation only. Do not rerun 41713003598 or update any previously published branch.
The target remains dedicated Preview project `txfxfrlhtvzwgluhnbpw`.

## Execution method

Reuse `.github/workflows/preview-database-setup.yml`, its existing GitHub-hosted runtime, environment,
owner authorization and deployment-excluded branch namespace. This revision replaces the full verifier's
two commands with exactly one credential-bearing command:

```sh
node scripts/preview/diagnose-identity.mjs --diagnose-identity
```

No new service, workflow file, dispatch mechanism or initialization path is introduced. The diagnostic
internally validates the plan before I/O; its approval operation remains `verify:txfxfrlhtvzwgluhnbpw`.
The name `preview-migration` is retained solely to reuse the existing owner checks and Vercel exclusion.
This revision cannot apply migrations through its workflow.

Read-only GitHub metadata inspection found the existing workflow active, zero registered self-hosted
runners, and the previous Ubuntu hosted job completed. The current local operator process has no
`PREVIEW_SETUP_DATABASE_URL`. Its absence does not establish that no other operator runtime exists,
but none with secure access to this secret has been verified. GitHub returns secret metadata, not its
value; it cannot safely be extracted to a local process. Reuse the environment's existing injection.
[Secret API](https://docs.github.com/en/rest/actions/secrets#get-an-environment-secret),
[hosted runner lifecycle](https://docs.github.com/en/actions/concepts/runners/github-hosted-runners).

## Exact boundary

- Pinned actions, Node 24.22.1, pnpm 9.12.0 and frozen dependencies are prepared without the database secret.
  Install lifecycle scripts remain disabled; explicit Prisma generation is local and has no database input.
- Only the last step receives the existing environment secret. No secret is read back, copied or changed.
- Before database access, the existing guard checks repository/owner IDs, actor, exact approved SHA,
  workflow identity, new-branch event, attempt 1 and saved environment policy. Three GitHub metadata GETs
  validate the run, environment and branch rule. Ordinary pushes, updates, force pushes and reruns fail.
- The existing probe sends only PostgreSQL SSLRequest, validates the pinned Supabase CA and hostname,
  then disconnects. Prisma uses that same verified CA with `sslmode=require`, `sslaccept=strict` and the
  approved session-pooler endpoint. No insecure TLS fallback exists.
- One authenticated connection path issues exactly the existing fixed identity SELECT and disconnects.
  It checks database name, login and effective roles, both superuser flags, the independently pinned
  cluster fingerprint and both read-only settings. Missing values fail closed.
- No history query, schema comparison, application query, SET/role change, repair, migration, reset,
  seed or retry occurs. Importing the shared planner cannot enter the initializer's guarded CLI.
- Output is only `[]` on success or an array of allowlisted failure identifiers on failure (exit 1).
  Identity fields and raw provider errors are never printed. `[]` does not verify schema/history/RLS.

Condition identifiers are documented in [the identity diagnosis](preview-identity-diagnosis.md).
They include `DATABASE_NAME`, `SESSION_USER`, `EFFECTIVE_ROLE`, `CLUSTER_FINGERPRINT`,
`TRANSACTION_READ_ONLY`, `DEFAULT_TRANSACTION_READ_ONLY`, both `*_ROLE_NOT_SUPERUSER` checks and
result-count/shape checks. Connection failures use fixed `TLS_*`, `IDENTITY_QUERY_*` or
`PREVIEW_SETUP_*` identifiers, never raw messages.

## Residual privilege risk

The existing credential is a privileged administrator credential, **not least-privilege**. Rejecting
superuser status does not remove its other administrative rights. The startup read-only option may not
be honored by the managed pooler; that is an unresolved hypothesis this SELECT is intended to test.
Consequently database-enforced read-only protection is not established before the SELECT. An `off`
result fails immediately, with no repair or subsequent query. The reviewed code has no write operation,
but a compromised runner/dependency or altered code possessing this credential could still write.
Pinned review, frozen dependencies, restricted secret scope and owner-only authorization reduce that risk;
they do not turn an administrator password into a database-enforced read-only credential.

## Approval and one execution (not performed)

1. Review the final local Phase 4N commit. Record its full SHA as `DIAGNOSTIC_SHA`; do not use a mutable
   branch name as approval. Keep all existing published branches and failed runs unchanged.
2. Separately authorize changing only the existing environment's non-secret approval metadata:
   `PREVIEW_SETUP_APPROVED_SHA=DIAGNOSTIC_SHA` and exactly one Branch rule named
   `codex/preview-migration-txfxfrlhtvzwgluhnbpw-DIAGNOSTIC_SHA`. Remove the previous rule; retain no Tag rules.
   Keep administrator bypass disabled and the existing owner-operated reviewer policy unchanged.
3. Leave `PREVIEW_SETUP_DATABASE_URL` unchanged and retain approved endpoint
   `aws-1-us-west-2.pooler.supabase.com:5432`. Recheck metadata without retrieving secret values.
4. Explicitly authorize Gilsuhar (ID 79252537) to publish that exact commit to that new branch once and
   run this identity-only probe using the existing privileged secret, acknowledging the risk above.
   Before publication, verify authenticated publisher, clean reviewed snapshot, absent remote branch,
   exact metadata and retained Vercel exclusion. Push only the exact SHA-to-branch refspec, with no force.
5. Observe that one run. If no run starts or any check fails, stop. Do not retry, recreate/update the
   branch or fall back to the initializer. Retain only sanitized identifiers for diagnosis.

No approval is implied for full verification, credential changes, role/Auth provisioning or deployment.
The workflow change does not yet authorize execution: the saved environment still approves the old SHA.
