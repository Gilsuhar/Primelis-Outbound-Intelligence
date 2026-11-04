# Deployment-disabled application Preview bootstrap

Prepared 2026-11-05 from b7c1819e7d657e082317b82438ad21b5b65cb891.
Branch: `codex/isolated-recycler-preview-20261104`.
This supersedes the cleanup and publication instructions in isolated-vercel-preview.md.
No publication, deployment, environment changes or database operations are authorized
by this preparation document.

## Bootstrap publication boundary

The root vercel.json now has `**: false`, `main: true`, the exact application
branch explicitly false, and `codex/preview-migration-txfxfrlhtvzwgluhnbpw-*: false`.
No true rule matches the application or setup branch. Vercel documents that these
rules prevent native Git deployment creation; this is not an Ignored Build Step
that starts a build and then cancels it. Main remains allowed.

The only candidate Actions workflow matches the SHA-named setup namespace and
cannot match this application branch. Read-only GitHub checks on 2026-11-05 found
no repository webhooks, no workflows on main, and only the registered setup workflow.
The application branch is absent remotely. The existing project's root ./ and lack
of deploy hooks were verified during the preceding preparation. Recheck external
automation immediately before an eventual approved push.

Publish only this branch's new bootstrap commit after separate approval. Never push
b7c1819 as the branch tip: that ancestor enables application Git deployment. Never
push main, all branches or tags. Confirm the exact SHA and clean worktree first.
After publication, verify the remote tip, no new Vercel deployment and no setup
Actions run. Stop on unexpected behavior; do not retry or enable deployment.

This proof covers native Git integration and inspected repository automation. It
does not prevent an independently authorized manual/API deployment or undisclosed
external automation. No push was used to experimentally test the rule.

Existing branch commits keep their own Vercel configuration. This bootstrap does
not change main or these branches, their environment bindings, or future rebuilds:
`feature/agent-workforce-foundation`, `recovery/four-email-engine`,
`feature/signal-sales-copilot`. Do not merge/cherry-pick this branch guard into them.

## Isolation decision

Recommend one dedicated **Vercel project**, proposed name `agent-workforce-preview`,
reusing the same reviewed source, existing Supabase project txfxfrlhtvzwgluhnbpw,
existing restricted runtime credential and existing Auth/profile. This is a separate
deployment configuration boundary, not a new application, database or workflow.
Project creation requires separate approval and an account quota/cost check; no
paid upgrade is authorized or assumed necessary.

Why the alternatives are not selected:

- Branch overrides replace same-name values, but do not constitute an allowlist for
  all inherited variables. The existing application deliberately rejects any nonempty
  DATABASE_URL or DIRECT_URL in Preview, including harmless placeholder overrides.
  No current documentation or live evidence establishes the required end-to-end
  behavior of empty overrides; no test was made because environment mutations and
  deployment are prohibited. Do not rely on empty values or weaken the DB guard.
- A custom environment can define separate variables, but the connected account
  currently reports zero custom-environment slots and no environments. Official docs
  make this a Pro/Enterprise feature. Custom VERCEL_ENV values also do not satisfy
  this application's exact `preview` identity guard. An upgrade and code changes are
  unnecessary for the selected approach.
- A clean dedicated project avoids modifying or masking the existing project's
  global credentials. Do not clone its variables, attach shared team variables,
  import marketplace credentials or connect live providers. Verify empty effective
  bindings before staging; a different project name alone does not establish isolation.

All 22 old-project bindings must remain unchanged, including global Preview
DATABASE_URL, DIRECT_URL and PREVIEW_DATABASE_URL and the six shared Production/
Preview settings. Never create the new project through an import-and-deploy wizard.
Use a separately approved configuration-only creation/linking action with no initial
deployment, and verify no deployment was created. Until that action has been reviewed,
do not connect another project to the repository. Preserve the disabled bootstrap.
Before eventual release, review automation for both connected projects: enabling the
same branch in vercel.json could deploy it to both. Do not simply flip its boolean.
Prefer an explicitly approved Preview deployment to the dedicated project with native
Git deployment still disabled for this branch, once project/branch identity propagation
has been independently checked. That later deployment procedure is not approved here.

## Exact staging instructions after the branch exists

1. After approved bootstrap publication, read back the exact remote SHA and confirm
   no deployment. Keep the branch disabled. Obtain approval for configuration-only
   dedicated project creation, protection and safe repository binding as above.
2. Record the new project's actual Vercel ID; do not reuse the old ID
   prj_sicQocH4juE1Nr5gGpSA61mThxBT. Verify repository binding, root ./, Next.js,
   Node 24.x, no build/install overrides or hooks, no cron, Deployment Protection,
   and no inherited variables/integrations. The application branch must be treated
   as Preview, not the new project's Production branch. Do not change the existing
   project's Production main setting.
3. In the **new project's** Settings > Environment Variables > Add, select **Preview
   only**, select Git branch `codex/isolated-recycler-preview-20261104`, and save each
   row below. Never choose all branches, Production, Development or the old project.
   If the branch cannot be selected, stop; do not broaden its scope.

| Name | Value/source | Type |
| --- | --- | --- |
| PREVIEW_APPROVED_BRANCH | codex/isolated-recycler-preview-20261104 | Config |
| PREVIEW_APPROVED_VERCEL_PROJECT_ID | Actual verified ID of the new dedicated Vercel project | Config |
| PREVIEW_APPROVED_SUPABASE_PROJECT_REF | txfxfrlhtvzwgluhnbpw | Config |
| NEXT_PUBLIC_PREVIEW_SUPABASE_PROJECT_REF | txfxfrlhtvzwgluhnbpw | Config |
| NEXT_PUBLIC_PREVIEW_SUPABASE_URL | https://txfxfrlhtvzwgluhnbpw.supabase.co | Config |
| NEXT_PUBLIC_PREVIEW_SUPABASE_PUBLISHABLE_KEY | Existing dedicated Supabase project's publishable key, copied by owner directly into UI | Public config |
| PREVIEW_APPROVED_DATABASE_ROLE | recycler_preview_app | Config |
| PREVIEW_APPROVED_DATABASE_ENDPOINT | aws-1-us-west-2.pooler.supabase.com:5432 | Config |
| PREVIEW_DATABASE_URL | Owner-retained, previously accepted restricted runtime URL | Secret/sensitive, server-only |
| NEXT_PUBLIC_VERCEL_ENV | preview | Config |
| WORKFORCE_DAILY_ENABLED | false | Config |
| WORKFORCE_CRON_REHEARSAL_ENABLED | false | Config |
| COMPANY_PILOT_ENABLED | false | Config |
| COMPANY_PILOT_AI_ENABLED | false | Config |
| COMPANY_PILOT_SCHEDULE_ENABLED | false | Config |

4. The retained URL must use recycler_preview_app's project-specific pooler username,
   the exact approved endpoint/database and `sslmode=require&sslaccept=strict`.
   Retain its encoded password unchanged. Do not retrieve the administrator URL,
   rotate credentials, paste values into chat/commands, or download env files. Runtime
   code supplies the existing pinned CA. GitHub secrets cannot be read back for staging.
5. Require DATABASE_URL and DIRECT_URL to be absent, not blank. No standard Production
   Supabase bindings, service-role key, PREVIEW_SETUP_* secret, OpenAI/HubSpot/Outreach/
   email credentials, worker secret or local-auth bypass may be present. Do not assign
   shared team variables. Preserve automatic platform identity variables; never spoof
   VERCEL_PROJECT_ID or branch identity. Re-read effective names/scopes and the new
   project's actual ID; separately verify owner-entered nonsecret values.
6. Confirm old-project variables, protection and Production remain unchanged. Stop
   before any deployment. Require separate approval for the exact dedicated-project
   Preview deployment and subsequent real HTTPS/Auth/Prisma browser smoke checks.
   Do not invent a redirect URL before a protected deployment hostname exists.

## Validation and decision

The regression test checks the full deployment map, main allowed, exact application
branch denied, setup branches denied, no overlapping true match, unrelated/similar
branches denied, and the actual Actions branch filter excluding this branch.
Application, auth, database guards, all 11 migrations, Prisma schema, lockfile and
workflow commands are unchanged. Only configuration, its test and documentation change.

Executed for this bootstrap: runtime/guard suite 683 passed, 0 failed, 0 skipped;
security suite 212 passed, 0 failed, 0 skipped (suites overlap); TypeScript, ESLint,
actionlint and git whitespace checks passed. Gitleaks scanned all four changed files
with exit 0 and no findings. The application build was not rerun for this JSON/test/
documentation-only change; the previous candidate's build results are historical,
not new executions.

GO can apply to publishing the disabled bootstrap only after the reported validation
passes and separate publication approval. Deployment remains NO-GO until the dedicated
project and explicit deployment procedure are reviewed and authorized. No automatic
environment cleanup or deployment-enabling commit follows bootstrap publication.

Sources:
- https://vercel.com/docs/project-configuration/git-configuration
- https://vercel.com/docs/environment-variables
- https://vercel.com/docs/deployments/environments
