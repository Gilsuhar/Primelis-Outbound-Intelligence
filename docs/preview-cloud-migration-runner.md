# One-time cloud Prisma initialization (prepared locally, not executed)

Workflow: `.github/workflows/preview-database-setup.yml`.
Source snapshot: `59aaee2e23667ee333802791ba995861474d85fb` (not a Git parent).
Publish only from the isolated `codex/cloud-publication-snapshot-20261103` branch/repository.
See [GH013 snapshot preparation](publication-snapshot.md); the original release history is preserved
separately and must not be included in the replacement publication.
Only target: `txfxfrlhtvzwgluhnbpw`, Primelis, us-west-2, with the independently verified
cluster fingerprint in `scripts/preview/verified-target.json`. No migration SQL was rewritten.

## Chosen execution method: explicit owner-only setup-tag publication

Publish only a new lightweight tag pointing to the reviewed release-candidate commit:
`agent-workforce-preview-setup-txfxfrlhtvzwgluhnbpw-<full-reviewed-sha>`.
The repository owner must personally initiate the push using their own authenticated GitHub account.
**Publishing this exact tag is approval to execute the migrations immediately after preflight.**
There is no second reviewer or subsequent approval click. Do not publish it as a connectivity test.
Ordinary branch pushes, pull requests, schedules and workflow reruns cannot initialize the database.
The tag must encode the exact approved commit and target, and its environment policy must match
that exact tag, not a wildcard. Use the final reviewed replacement snapshot SHA, not the source SHA.

The owner is pinned to GitHub user **Gilsuhar**, numeric ID **79252537**, and the repository to
ID **1299364799** (verified through GitHub metadata). Before starting the job or exposing its
environment secret, the job condition requires these repository/owner IDs, the owner's actor ID
and login, the same triggering actor, and a push-event sender with the owner's ID and User type.
The guarded initializer then reads GitHub's actual run metadata and checks its actor and triggering
actor IDs/types, repository ID/current owner, event, attempt and SHA. Missing or contradictory
metadata fails closed before TLS/database access. Commit author names/emails and tag text do not
authenticate the publisher. No collaborator, bot, fork, transferred repository or rerun is accepted.

Use the owner's personal authenticated Git connection, not a shared credential, deploy key, GitHub
App or automation token. GitHub account attribution authenticates the account; it does not prove a
human was physically at the keyboard or protect against compromised owner credentials. The owner
and administrators who can modify trusted code/environment settings remain within the trust boundary.
No new service, identity provider, paid plan or personal token inside the workflow is required.

GitHub loads a push-triggered workflow from the pushed ref. Unlike workflow_dispatch, this does not
require registering the workflow on main. No branch is pushed and no main change is necessary.
The read-only check found no `.github/workflows` directory on main, and the Actions UI showed its
initial workflow setup page. No existing dispatcher is required.

Vercel's native Git integration deploys branch pushes; tag/release deployment requires additional
automation. This workflow contains no Vercel command or deployment credential. A tag-only push
therefore avoids the native branch deployment trigger. The latest read-only check found no repository
webhooks, no configured Actions workflows, no Vercel project webhooks, and only the standard Vercel
and ChatGPT Codex Connector GitHub Apps. Recheck if configuration changes before publication;
do not publish if a custom tag deployment consumer is introduced or remains unverified.
Do not push the release branch as part of this operation or assume its Preview is isolated.

## Required GitHub configuration (not created by this change)

Update the existing environment **agent-workforce-preview-setup** only after approval:

| Setting | Required configuration |
| --- | --- |
| Required reviewers | Disabled; the authenticated owner's exact-tag push is the explicit authorization |
| Prevent self-review | Not applicable without a reviewer rule; no independent approval dependency |
| Administrator bypass | Disabled |
| Deployment branches and tags | Custom policy: exactly `agent-workforce-preview-setup-txfxfrlhtvzwgluhnbpw-<full-reviewed-sha>`, **tag** type; no other rules or wildcards |
| Environment secret `PREVIEW_SETUP_DATABASE_URL` | Only the dedicated Preview administrator connection, supplied through GitHub's secure secret UI |
| Environment variable `PREVIEW_SETUP_APPROVED_ENDPOINT` | Exact verified host:5432 from this project's Connect panel; no password or URL |
| Environment variable `PREVIEW_SETUP_APPROVED_SHA` | Full reviewed commit SHA containing the final workflow and guards, not the old base commit |

Do not create repository/organization secrets with this connection name or allow inherited values
to substitute for a missing environment secret. Verify its environment scope administratively before
publication. No Production connection, provider secret, Supabase management token or service-role key
is required. The temporary `github.token` has only contents:read and actions:read. The launcher checks
the current run's owner identity and commit, the environment's administrator-bypass setting and exact
tag policy using read-only GitHub REST requests. Unknown,
unavailable or contradictory metadata stops execution before database authentication.

The repository is public, personally owned by Gilsuhar, with main as default branch. This mechanism
uses standard Actions actor contexts, read-only run APIs and an environment with an exact tag policy;
it does not require an Enterprise approval feature. Before replacement publication, reverify that
reviewers remain disabled and administrator bypass remains disabled. Replace the old SHA and old
tag policy with this snapshot's final reviewed commit. Do not leave both tag rules.
The endpoint variable was verified as `aws-1-us-west-2.pooler.supabase.com:5432`; the setup secret's
existence was checked by metadata only. No secret value has been read or changed.

## Endpoint and TLS requirements

Two explicitly approved connection forms are supported, with no automatic fallback:

- Direct: `db.txfxfrlhtvzwgluhnbpw.supabase.co:5432`, username `postgres`, database `postgres`.
  Supabase direct endpoints normally require IPv6 unless a separately configured IPv4 option exists.
  **GitHub-hosted runners are not assumed to have working IPv6.**
- Shared **session** pooler: exact `aws-N-us-west-2.pooler.supabase.com:5432` host copied from this
  project's Connect panel, username `postgres.txfxfrlhtvzwgluhnbpw`, database `postgres`.
  `N` is not a guessed value: verify the actual endpoint first. Shared poolers can serve multiple
  projects, so the project-specific username and database fingerprint are mandatory. Supabase
  documents session pooling as an IPv4-capable connection suitable for migrations. This preserves
  the PostgreSQL session semantics Prisma 5.22.0 needs; the frozen version is not upgraded to the
  newer Prisma version used in current Supabase quickstart examples. Port 6543/transaction pooling,
  `pgbouncer=true`, other regions and lookalike hosts are rejected.

The secret must use `postgresql:` and exactly `sslmode=require&sslaccept=strict`, with the password
properly URI-encoded. The endpoint must match the separately approved environment variable.
An SSLRequest probe verifies TCP reachability, TLS 1.2+, trusted certificate chain and hostname before
sending any database credentials. Prisma separately requires strict TLS. No tunnel, certificate
validation bypass, arbitrary query parameters or endpoint retry/fallback is introduced.

The runner's actual network and certificate trust have **not** been tested. If the selected endpoint
requires a CA not trusted by Node/Prisma, stop for reviewed CA distribution support; do not change
sslaccept or install an unverified certificate. No paid IPv4 add-on is provisioned. The actual session
pooler hostname must still match the approved endpoint at execution; the format used in tests is synthetic.

## Manual publication and execution process (future approval required)

1. Review and commit this local snapshot on `codex/cloud-publication-snapshot-20261103`, then
   separately approve publication and execution. Confirm a clean worktree, the exact final commit,
   the destination repository and no custom tag deployment consumer as described above. Publication
   exposes that commit and its reachable history in this public repository: repeat the publication
   secret/private-data scan before pushing. Preserve the original worktree and recovery archive.
2. Configure and verify the environment above with the exact final SHA/tag, confirm runner
   minutes/billing policy, approve the
   actual session-pooler endpoint or direct IPv6 path, and inject only the dedicated Preview secret.
   No credentials should be copied through chat, source files, dispatch inputs or command arguments.
3. After explicit approval, publish **only** the exact reviewed SHA to the new tag. Use the verified
   remote repository URL and this single refspec; do not use --all, --tags, --follow-tags or --force.
   This must be issued as Gilsuhar using the owner's own authenticated Git identity. It requires
   no Windows database connection or local credential setup. The prepared local commit must first
   be published; GitHub cannot execute unpublished local files.

   ```text
   git -c push.followTags=false push https://github.com/Gilsuhar/Primelis-Outbound-Intelligence.git <reviewed-full-sha>:refs/tags/agent-workforce-preview-setup-txfxfrlhtvzwgluhnbpw-<reviewed-full-sha>
   ```

   No force update or existing-tag reuse is allowed. A normal branch push cannot trigger this job.
   The workflow job rejects noncreation, deletion and forced events; its script independently
   verifies the exact tag, SHA, workflow revision, owner identity and environment policy before database access.
4. Monitor the run in the repository Actions page. No additional approval is expected; the tag push
   already authorized execution. Do not use administrator bypass or debug logging. If identity,
   endpoint, TLS, fingerprint or any other check fails, stop; do not rerun or recreate the tag.
5. The job checks out exactly github.sha with checkout credentials disabled. Pinned actions and Node,
   pnpm 9.12.0 and the frozen lockfile are used. Dependency lifecycle scripts are disabled; only Prisma
   client generation runs explicitly, before the database secret is injected. No build, seed or worker.
6. The existing guarded script runs `--plan`, then `--execute-approved-initialization`. Plan mode has
   no network/database effects. Execution validates GitHub owner attribution, TLS and fingerprint,
   requires an empty application schema and applies the eleven original files through Prisma 5.22.0.

## Verification and failure handling

The reviewed manifest pins SHA-256 of LF-normalized SQL, Prisma schema and lockfile. Applied migration
checksums are compared against the **actual bytes** of each checked-out file, matching Prisma's
tracking and avoiding a false checksum claim across Windows/Linux line endings.

Success requires all eleven distinct migration names in order, exact checksums, finished timestamps,
no rolled-back records and exactly one applied step each; the exact reviewed table inventory; RLS on
all application/history tables; no anon/authenticated table privileges; zero seeded application rows,
Auth users, runtime roles or public policies. A read-only Prisma schema diff must also return zero
(no drift). The diff uses schema datasource configuration, not a URL in command arguments, and does
not use a shadow database or execute generated SQL. Prisma does not compare every PostgreSQL feature;
RLS and API privileges are checked separately.

Only sanitized status/counts are printed. Database URLs, passwords, raw Prisma errors and database
records are not logged or uploaded. No diagnostic artifacts/cache are uploaded with credentials.

- Preflight failure: no migration was invoked.
- `PREVIEW_SETUP_MIGRATION_FAILED_POSSIBLY_PARTIAL`: inspect Prisma history read-only; committed DDL
  may remain. No automatic repair, resolve, reset, rollback or retry.
- `PREVIEW_SETUP_APPLIED_VERIFICATION_FAILED`: Prisma completed, but post-checks failed. Do not report
  verified success and do not rerun initialization. Inspect the failed invariant read-only.
- `SCHEMA_INITIALIZED_AND_VERIFIED`: all checks completed successfully.

Concurrent jobs are serialized without cancelling an in-flight run. GitHub rerun attempts are
rejected; recreating the tag is prohibited operationally, and a fresh event still fails the nonempty
schema check after a successful/partial initialization. The 15-minute timeout can interrupt a run;
treat that as potentially partial. If failure occurs, stop and inspect; do not create a replacement
tag or run without a fresh review and explicit authorization. After verified completion, separately
remove the environment setup secret/disable this
one-time workflow. No role activation, Auth setup or application deployment is authorized here.

## References

- [GitHub manual dispatch](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)
- [GitHub authenticated actor and repository contexts](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts)
- [GitHub workflow run identity metadata](https://docs.github.com/en/rest/actions/workflow-runs#get-a-workflow-run)
- [GitHub push and tag workflow triggers](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#push)
- [Environment protection and plan limits](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
- [Vercel Git integration](https://vercel.com/docs/git)
- [Vercel tag/release deployment requires automation](https://vercel.com/kb/guide/can-you-deploy-based-on-tags-releases-on-vercel)
- [Supabase Prisma/session pooler connections](https://supabase.com/docs/guides/database/prisma)
- [Supabase database connectivity](https://supabase.com/docs/guides/database/connecting-to-postgres)
