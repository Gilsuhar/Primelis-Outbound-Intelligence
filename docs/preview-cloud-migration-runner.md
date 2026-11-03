# One-time cloud Prisma initialization

## Phase 4J: final TLS-corrected execution candidate

This preparation commit is a documentation-only child of
`4bcc72f4532b86e61e6d29f05384146d37407914`; it retains that reviewed TLS implementation without
runtime changes. Use the full SHA of this preparation commit for the next approval. Its exact
execution branch is `codex/preview-migration-txfxfrlhtvzwgluhnbpw-<full-preparation-commit-sha>`.
Preparing a local branch is not authorization to push it or execute migrations.

Reverification on 2026-11-03 confirmed that the checked-in CA matches the official dashboard download,
with the fingerprint recorded below and validity from 2021-04-28 through 2031-04-26. The Node probe
passes that PEM as `ca`. The guarded initializer supplies the same file through Prisma's `sslcert`
parameter to its verification client, migration subprocess and schema-diff subprocess, retaining
`sslmode=require&sslaccept=strict`. Prisma 5.22.0 loads it as a root certificate; Node and Prisma use
different TLS implementations, so this is the same explicit trust anchor, not a claim that their
platform trust stores are identical. No real Prisma authentication or migration was exercised here.
The prior Node 24.22.1 strict TLS handshake passed without changing the approved endpoint.

Required operator changes after candidate review, only in `agent-workforce-preview-setup`:
1. Set `PREVIEW_SETUP_APPROVED_SHA` to the full preparation commit SHA.
2. Replace the old deployment rule with exactly one **Branch** rule matching the execution branch
   above. Leave no old Branch rules or Tag rules.
3. Retain `PREVIEW_SETUP_APPROVED_ENDPOINT=aws-1-us-west-2.pooler.supabase.com:5432` and the existing
   environment-scoped `PREVIEW_SETUP_DATABASE_URL`. Do not change credentials or append `sslcert`
   to the stored URL; that parameter is generated internally from the pinned local file.
4. Keep required reviewers and administrator bypass disabled, with custom branch policies enabled.
5. Obtain a fresh read-only preflight and separate explicit publication approval. Verify the owner is
   Gilsuhar (79252537), the exact commit/worktree, the branch is absent remotely, and all saved metadata.

Only the approved owner creating the exact SHA-named branch for the first time can authorize the job.
Repository identity, commit, before-SHA, creation/update/force-push/rerun checks, project fingerprint,
strict TLS, migration checksums and Vercel Git deployment exclusion are unchanged. All 11 migration
SQL files, Prisma schema and frozen dependency lockfile are unchanged. Preserve runs 41654114864 and
41659291052 and both previously published branches; never rerun or update them. Runner connectivity,
database authentication/privileges, unchanged live fingerprint/empty schema, migration completion and
post-migration checks remain execution-time requirements. A failure requires diagnosis and separate
approval, never an automatic retry, reset, seed or role/Auth provisioning.

## Current status: local TLS trust correction, not authorized for publication

Run 41659291052 for `3a889b5dfccef93c356ec4e5199ce4e78e6b6f84` passed plan validation,
then stopped with `PREVIEW_SETUP_TLS_CONNECTIVITY_FAILED`, before DB authentication or migrations.
Read-only verification found zero public tables, no Prisma history, zero Auth users and no application
role. Preserve that run and published branch; no rerun, update or recreation is permitted.

On 2026-11-03, a credential-free check using Node 24.22.1 resolved the approved hostname over IPv4,
connected to port 5432 and received the PostgreSQL SSLRequest acceptance byte. The original probe
failed with `SELF_SIGNED_CERT_IN_CHAIN`. With the independently downloaded Supabase root CA, the
same strict probe passed both chain and hostname validation. This demonstrates a missing trust anchor
in the original implementation. The original runner discarded its underlying error, so its precise
exception cannot be recovered; local success does not prove future GitHub runner connectivity.

The setup-only patch includes the public CA and pins its SHA-256 X.509 fingerprint, CA flag,
self-signature and validity period. It supplies that CA explicitly to Node TLS and, after the original
URL passes every existing guard, appends an internal `sslcert` path for Prisma 5.22.0. The stored secret
must still contain exactly `sslmode=require&sslaccept=strict`; do not add a trust path to the secret.
All Prisma connections (fingerprint checks, migration and schema diff) use the same reviewed CA.
There is no runtime certificate download or global trust-store modification. Certificate replacement
requires review. `rejectUnauthorized: true`, original-host SNI/hostname verification and TLS >=1.2 remain.

CA provenance (public certificate, no private key):
- Official dashboard configuration: https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json
- HTTPS download used by that configuration: https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt
- DER SHA-256: `807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA`
- Valid until 2031-04-26. The filename's `prod` denotes Supabase's hosted-service CA, not a Production
  database credential. Target identity and endpoint guards remain Preview-only.
- Supabase trust guidance: https://supabase.com/docs/guides/platform/ssl-enforcement
- Prisma 5.22.0 parser/root loading: https://github.com/prisma/prisma-engines/blob/5.22.0/quaint/src/connector/postgres/url.rs
  and https://github.com/prisma/prisma-engines/blob/5.22.0/quaint/src/connector/postgres/native/mod.rs

Credential-free diagnostic, manually run only when authorized:
```sh
node scripts/preview/diagnose-tls.mjs --system-trust
node scripts/preview/diagnose-tls.mjs --pinned-ca
```
Each invocation makes at most one connection to the fixed approved public endpoint. It sends only
the eight-byte PostgreSQL SSLRequest and TLS handshake, never a startup/authentication packet or SQL.
No URL, password, secret or hostname argument is accepted. Output contains only fixed categories.
The system-trust comparison retains certificate verification; it never accepts untrusted certificates.

Original error coverage: all socket errors (including DNS, TCP and reset errors), socket end, the
10-second deadline, any SSL response other than exactly `S`, TLS errors/end, unauthorized certificates,
unacceptable protocol and hostname mismatch became the same `PREVIEW_SETUP_TLS_CONNECTIVITY_FAILED`.
Synchronous transport errors were not consistently sanitized. The patch retains the top-level code
and adds an allowlisted category: DNS failures, TCP refusal/unreachability/reset, separate DNS/TCP timeouts,
SSL-response timeout/rejection, TLS timeout/handshake failure, untrusted/expired/not-yet-valid
certificate, hostname mismatch, failed certificate authorization or rejected TLS version. Unknown
errors remain generic, and raw exception messages, peer certificate fields and connection details
are never emitted. Premature close and synchronous throws now fail closed with cleanup.

A new reviewed commit and never-used SHA-named execution branch are necessary. After separate approval,
update only the environment approved SHA and exact single Branch rule to that commit; keep the endpoint,
secret, owner identity, disabled administrator bypass and Vercel exclusion unchanged. First verify the
new metadata and branch absence. Publishing that branch would execute migrations, so do not publish it
as a diagnostic. This local patch has not been pushed or run on GitHub. Rollback is local only; never
force-update a published execution branch. No migration, schema or lockfile change is part of the patch.

## Historical configuration correction (superseded by the TLS correction above)

Run 41654114864 registered and executed from the setup branch for commit
`1ea5bb2f9719e774a7bd4916bd31e645bc35a239`, then stopped at `--plan` with
`PREVIEW_SETUP_CONFIGURATION_REJECTED`. Read-only verification found no migration-history table,
application tables, Auth users or application role. No migration ran. Preserve that published branch
and run unchanged; do not rerun, recreate or update them.

The operator subsequently reported only `APPROVED_ENDPOINT_MATCH` for the original URL, then
confirmed the corrected Session Pooler URL passed the offline checker with `[]`. Missing TLS query
parameters were an earlier hypothesis, not the confirmed sole defect. The approved endpoint remains
`aws-1-us-west-2.pooler.supabase.com:5432`. No URL or credential value was disclosed or read.
The corrected local copy is validated; its presence in the GitHub secret is not independently verified.

1. In a trusted PowerShell 7 session, run the existing offline checker:
   `& 'C:\Users\USER\Documents\ChatGPT\New project\rc-tools\phase4h-check-private-url.ps1'`.
   Enter the original URL only into its hidden prompt. Do not paste it into chat, command arguments,
   a source file or logs. The original worktree remains pinned to the checker's reviewed commit.
2. Use only the operator-validated corrected Session Pooler URL for this dedicated project. Keep its
   correct tenant, endpoint, port, database and password encoding. Its query already passes the strict
   checks for exactly `sslmode=require` and `sslaccept=strict`; do not append these parameters again.
3. The required offline result is `[]` (reported by the operator). If the candidate URL is edited again,
   repeat the hidden-input check and require `[]` before updating the environment secret.
4. The operator updates only the existing **environment-scoped** `PREVIEW_SETUP_DATABASE_URL` secret
   in `agent-workforce-preview-setup` through GitHub's secure UI. Never create a repository-scoped
   substitute. GitHub cannot return the plaintext secret; local validation proves only the supplied
   original/candidate copies, not the server's encrypted value. No secret update is performed here.
5. This documentation-only child commit provides a fresh reviewed SHA without changing the workflow,
   initializer, owner checks, TLS, database fingerprint, migration files or Vercel deployment exclusion.
   Before publication, set `PREVIEW_SETUP_APPROVED_SHA` to this new commit and replace the environment
   rule with exactly one Branch rule: `codex/preview-migration-txfxfrlhtvzwgluhnbpw-<new-full-sha>`.
   Preserve the approved endpoint, secret scope, disabled reviewers and disabled administrator bypass.
6. Complete a fresh read-only preflight, including secret metadata, exact branch absence and unchanged
   deployment controls. Obtain separate explicit approval to publish that one new branch as Gilsuhar.
   No push, workflow rerun, database access or deployment is authorized by this preparation.

An empty offline diagnostic result is not proof of runner connectivity, password validity or trusted
TLS. Those are checked by the unchanged guarded initializer on a separately approved first attempt.
No application code change or relaxation of a security check is needed for this configuration correction.

Workflow: `.github/workflows/preview-database-setup.yml`.
Source snapshot: `59aaee2e23667ee333802791ba995861474d85fb` (not a Git parent).
Publish only the reviewed commit from the isolated clean-history preparation worktree.
See [GH013 snapshot preparation](publication-snapshot.md); the original release history is preserved
separately and must not be included in the replacement publication.
Only target: `txfxfrlhtvzwgluhnbpw`, Primelis, us-west-2, with the independently verified
cluster fingerprint in `scripts/preview/verified-target.json`. No migration SQL was rewritten.

## Chosen execution method: explicit owner-only setup-branch creation

Create only a new dedicated branch pointing to the reviewed release-candidate commit:
`codex/preview-migration-txfxfrlhtvzwgluhnbpw-<full-reviewed-sha>`.
The repository owner must personally initiate the push using their own authenticated GitHub account.
**Creating this exact branch is approval to execute the migrations immediately after preflight.**
There is no second reviewer or subsequent approval click. Do not publish it as a connectivity test.
Ordinary branch pushes, pull requests, schedules and workflow reruns cannot initialize the database.
The branch must encode the exact approved commit and target, and its environment policy must match
that exact branch, not a wildcard. Use the final reviewed replacement snapshot SHA, not the source SHA.

The owner is pinned to GitHub user **Gilsuhar**, numeric ID **79252537**, and the repository to
ID **1299364799** (verified through GitHub metadata). Before starting the job or exposing its
environment secret, the job condition requires these repository/owner IDs, the owner's actor ID
and login, the same triggering actor, and a push-event sender with the owner's ID and User type.
The guarded initializer then reads GitHub's actual run metadata and checks its actor and triggering
actor IDs/types, repository ID/current owner, event, attempt and SHA. Missing or contradictory
metadata fails closed before TLS/database access. Commit author names/emails and branch text do not
authenticate the publisher. No collaborator, bot, fork, transferred repository or rerun is accepted.

Use the owner's personal authenticated Git connection, not a shared credential, deploy key, GitHub
App or automation token. GitHub account attribution authenticates the account; it does not prove a
human was physically at the keyboard or protect against compromised owner credentials. The owner
and administrators who can modify trusted code/environment settings remain within the trust boundary.
No new service, identity provider, paid plan or personal token inside the workflow is required.

The published root snapshot b4654a87cb6ad106137b884a002db23af71039ed and its existing setup tag
remain unchanged. GitHub registered zero workflows/runs for that tag. No workflow validation error
was available; the exact discovery failure remains unproven. This child commit uses a supported
branch-push trigger, without a main change or a new cloud runner. Registration is not claimed tested.

## Vercel deployment exclusion

Root vercel.json sets git.deploymentEnabled to false only for
codex/preview-migration-txfxfrlhtvzwgluhnbpw-*. Vercel documents this as disabling native Git-triggered
deployments for matching branches. Other branches remain enabled by default; no Production behavior
or project setting is changed. The tests use minimatch to check the setup branch and unaffected branches.

An Ignored Build Step is NOT an equivalent safeguard: it executes after entering BUILDING; exit 0
cancels an already-created deployment, while exit 1 builds. It can still consume deployment quotas.
No ignoreCommand override is added. Merely adding any vercel.json is not a deployment exclusion.

The Git filter does not block a manual CLI/API deployment, Deploy Hook, or independent automation.
Read-only checks on 2026-11-03 confirmed the linked repository, an empty Root Directory setting
(repository root), Ignored Build Step = Automatic, and no Deploy Hooks. Repository webhooks and
registered Actions workflows were both zero; Vercel project webhooks/integration configurations
were empty. These checks support the native Git exclusion, not a live test of a future push.
Before publication, verify the linked project uses repository-root configuration, inspect its saved
Ignored Build Step and any custom deployment triggers, and stop if deployment suppression is uncertain.
Do not perform a live push to test suppression. No Vercel setting is changed by this patch.

## Required GitHub configuration (not created by this change)

Update the existing environment **agent-workforce-preview-setup** only after approval:

| Setting | Required configuration |
| --- | --- |
| Required reviewers | Disabled; the authenticated owner's exact-branch push is the explicit authorization |
| Prevent self-review | Not applicable without a reviewer rule; no independent approval dependency |
| Administrator bypass | Disabled |
| Deployment branches and tags | Custom policy: exactly `codex/preview-migration-txfxfrlhtvzwgluhnbpw-<full-reviewed-sha>`, **branch** type; no other rules or wildcards |
| Environment secret `PREVIEW_SETUP_DATABASE_URL` | Only the dedicated Preview administrator connection, supplied through GitHub's secure secret UI |
| Environment variable `PREVIEW_SETUP_APPROVED_ENDPOINT` | Exact verified host:5432 from this project's Connect panel; no password or URL |
| Environment variable `PREVIEW_SETUP_APPROVED_SHA` | Full reviewed commit SHA containing the final workflow and guards, not the old base commit |

Do not create repository/organization secrets with this connection name or allow inherited values
to substitute for a missing environment secret. Verify its environment scope administratively before
publication. No Production connection, provider secret, Supabase management token or service-role key
is required. The temporary `github.token` has only contents:read and actions:read. The launcher checks
the current run's owner identity and commit, the environment's administrator-bypass setting and exact
branch policy using read-only GitHub REST requests. Unknown,
unavailable or contradictory metadata stops execution before database authentication.

The repository is public, personally owned by Gilsuhar, with main as default branch. This mechanism
uses standard Actions actor contexts, read-only run APIs and an environment with an exact branch policy;
it does not require an Enterprise approval feature. Before replacement publication, reverify that
reviewers remain disabled and administrator bypass remains disabled. Replace the old SHA and old
Tag policy with this child commit's final reviewed SHA and exact Branch policy. Do not leave both rules.
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
   the destination repository and verified Vercel deployment exclusion as described above. Publication
   exposes that commit and its reachable history in this public repository: repeat the publication
   secret/private-data scan before pushing. Preserve the original worktree and recovery archive.
2. Configure and verify the environment above with the exact final SHA/branch, confirm runner
   minutes/billing policy, approve the
   actual session-pooler endpoint or direct IPv6 path, and inject only the dedicated Preview secret.
   No credentials should be copied through chat, source files, dispatch inputs or command arguments.
3. After explicit approval, publish **only** the exact reviewed SHA to the new branch. Use the verified
   remote repository URL and this single refspec; do not use --all, --tags, --follow-tags or --force.
   This must be issued as Gilsuhar using the owner's own authenticated Git identity. It requires
   no Windows database connection or local credential setup. The prepared local commit must first
   be published; GitHub cannot execute unpublished local files.

   ```text
   git -c push.followTags=false push https://github.com/Gilsuhar/Primelis-Outbound-Intelligence.git <reviewed-full-sha>:refs/heads/codex/preview-migration-txfxfrlhtvzwgluhnbpw-<reviewed-full-sha>
   ```

   No force update or existing-branch reuse is allowed. Verify the remote branch is absent first. A normal branch push cannot trigger this job.
   The workflow job rejects noncreation, deletion and forced events; its script independently
   verifies the exact branch, SHA, workflow revision, owner identity and environment policy before database access.
   Both boundaries require creation=true, deletion=false, forced=false and the all-zero before SHA.
   The script receives these flags only from the pinned workflow GitHub event context and also verifies
   the authoritative run head_branch. Missing flags are rejected before any external calls.
4. Monitor the run in the repository Actions page. No additional approval is expected; the branch creation
   already authorized execution. Do not use administrator bypass or debug logging. If identity,
   endpoint, TLS, fingerprint or any other check fails, stop; do not rerun or recreate the branch.
5. The job checks out exactly github.sha with checkout credentials disabled. Pinned actions and Node,
   pnpm 9.12.0 and the frozen lockfile are used. Dependency lifecycle scripts are disabled; only Prisma
   client generation runs explicitly, before the database secret is injected. No build, seed or worker.
6. The existing guarded script runs `--plan`, then `--execute-approved-initialization`. Plan mode has
   no network/database effects. Execution validates GitHub owner attribution, TLS and fingerprint,
   requires an empty application schema and applies the eleven original files through Prisma 5.22.0.

## Verification and failure handling

Local Phase 4G validation: migration-runner/setup/scanner tests 140 passed, 0 failed, 0 skipped;
Preview/authentication security tests 184 passed, 0 failed, 0 skipped. TypeScript, ESLint, Prisma
schema validation, Next.js production build and actionlint 1.7.12 passed. All eleven migration Git
blobs and all thirteen reviewed manifest entries are unchanged. No database execution was performed.
The fresh replacement setup branch remains unpublished. Execution still requires approval, updating/verifying the
GitHub environment SHA and exact Branch rule, and a final read-only preflight. Actual runner TLS,
connectivity and GitHub workflow registration cannot be claimed verified from local mocked tests.

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
rejected; recreating the branch is prohibited operationally, and a fresh event still fails the nonempty
schema check after a successful/partial initialization. The 15-minute timeout can interrupt a run;
treat that as potentially partial. If failure occurs, stop and inspect; do not create a replacement
branch or run without a fresh review and explicit authorization. After verified completion, separately
remove the environment setup secret/disable this
one-time workflow. No role activation, Auth setup or application deployment is authorized here.

## References

- [GitHub manual dispatch](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)
- [GitHub authenticated actor and repository contexts](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts)
- [GitHub workflow run identity metadata](https://docs.github.com/en/rest/actions/workflow-runs#get-a-workflow-run)
- [GitHub push and tag workflow triggers](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#push)
- [Environment protection and plan limits](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
- [Vercel Git integration](https://vercel.com/docs/git)
- [Vercel branch deployment exclusions](https://vercel.com/docs/project-configuration/git-configuration)
- [Ignored Build Step behavior](https://vercel.com/docs/project-configuration/project-settings#ignored-build-step)
- [Supabase Prisma/session pooler connections](https://supabase.com/docs/guides/database/prisma)
- [Supabase database connectivity](https://supabase.com/docs/guides/database/connecting-to-postgres)
