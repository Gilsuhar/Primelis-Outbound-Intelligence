# Publication snapshot after GH013

This candidate is a new, isolated Git repository and a single root commit. It preserves the tracked
application tree from validated source commit `59aaee2e23667ee333802791ba995861474d85fb`, with the
reviewed fixture/scanning/documentation and test synchronization changes described here. It has no parent, alternate object
store, inherited references or copied Git history. The original repository, release branch, commits
and recovery archive are retained separately and must not be reset, rebased, pruned or pushed.

GitHub rejected the previous tag because two offline test fixtures used HubSpot private-app token
shapes with constant repeated-character UUIDs. The fixtures were not issued credentials. They now
retain the EU1/NA1 prefixes with explicitly synthetic, non-UUID suffixes. Validation boundaries,
contamination checks, assertions and production token handling are unchanged. No credential values
are reproduced here and no live credential validation was performed.

Full validation also exposed an existing UI-test ordering race: options can render before the default
contact-selection effect completes. The selection test now waits for that initial state before
changing contacts, retains all previous assertions and additionally checks the selected value.
No application behavior or production source was changed.

The rejected commit and the flagged file blob must not be reachable from this candidate. Validate
the complete object inventory before publication, not just the latest diff. Scan all reachable
objects using `node scripts/security/publication-scan.mjs HEAD` and run Gitleaks over the entire
root-commit history with redaction enabled. The supplemental scanner includes low-entropy HubSpot
patterns that previously escaped the default scan, without suppressing test files or placeholders.
GitHub's proprietary detector cannot be reproduced completely offline; push protection remains enabled.

Only publish from this isolated repository. This root snapshot does not preserve Git ancestry for
merging into main; any later main integration requires a separate review. A tag-only publication
updates no branch and performs no force push. Never publish the preserved original history.

## Migration authorization update (not performed locally)

Use this repository's final reviewed `git rev-parse HEAD` as `<replacement-sha>`. In the existing
`agent-workforce-preview-setup` GitHub environment, replace `PREVIEW_SETUP_APPROVED_SHA` with that SHA
and replace the deployment policy with exactly one Tag rule:
`agent-workforce-preview-setup-txfxfrlhtvzwgluhnbpw-<replacement-sha>`.
Remove the old rule; keep reviewers disabled and administrator bypass disabled. Keep the existing
environment-scoped setup secret and `aws-1-us-west-2.pooler.supabase.com:5432` endpoint unchanged.
No credentials need to be copied or rotated for these synthetic fixtures.

The workflow and initializer bind the tag, checked-out SHA, workflow SHA and approved environment
SHA to one identical commit. Owner ID `79252537` and repository ID `1299364799` remain pinned.
The old workflow/history is absent from this repository. A replacement tag pointing at an old SHA,
or a stale approved environment SHA, is rejected by the existing exact-match guards. Ordinary branch
pushes, other actors and retries remain denied. All eleven original Prisma migrations, schema,
lockfile, target fingerprint, strict TLS checks and post-migration verification are unchanged.

After separate approval and final read-only preflight, publish only the replacement SHA/tag using
the owner's authenticated identity and the single refspec in the cloud migration runbook. Do not
reuse the rejected tag, approve a secret-scanning bypass, or assume a clean local scan guarantees
GitHub acceptance. Tag publication authorizes execution automatically after the guarded preflight.
