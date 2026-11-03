# Publication snapshot after GH013

The initial clean candidate was an isolated Git repository with a single root commit. It preserves the tracked
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
merging into main; any later main integration requires a separate review. The original tag-only publication updated no branch and performed no force push.
The subsequent setup-branch patch is a child of that clean root and preserves the published tag. Never publish the preserved original history.

## Current migration authorization (Phase 4G, not published)

The tag-only root publication registered no Actions run. Follow the updated
[one-time setup-branch runbook](preview-cloud-migration-runner.md) for the child commit.
Set PREVIEW_SETUP_APPROVED_SHA to the final reviewed child SHA and replace the environment's old
Tag rule with exactly one Branch rule: codex/preview-migration-txfxfrlhtvzwgluhnbpw-<full-reviewed-sha>.
Keep the existing environment secret, approved endpoint and administrator-bypass prohibition.
The original published tag must not move or be recreated. No original rejected history is reintroduced.
The branch trigger and Vercel Git exclusion require separate publication approval and final preflight.
All eleven migration files, schema, lockfile and target fingerprint remain unchanged.
