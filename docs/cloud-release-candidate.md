# Cloud release candidate — local preparation, 2026-11-02

Status: Phase 2B validated locally; NOT approved for push, Preview deployment, or production. No credentials, live integration reads/writes, database migrations, paid research, or deployments were used during preparation.

## Preservation and publication scope

- Base: `feature/agent-workforce-foundation`, `b1a9144a75d94a888526031469d14a4300b983b5`.
- Candidate branch: `codex/cloud-release-candidate-20261102-192938`, in a separate worktree. The original branch, index and working files are preserved.
- Before editing, all 722 tracked/nonignored-untracked files were archived byte-for-byte and individually SHA-256 verified. The recovery directory has an ACL restricted to the current Windows user and SYSTEM; it also contains the original index and a Git history bundle. Ignored private exports/caches remain untouched in the original checkout and are not release inputs. This same-device recovery point does not protect against device loss.
- Preservation rechecked after Phase 2B: all 722 original files and all 722 recovery ZIP entries match their SHA-256 manifest; the original index also matches its archived copy. Original work: 40 modified tracked files and 248 untracked files. The publication manifest selects all 40 modified tracked files and 205 reviewed untracked files; 43 untracked files are excluded. Existing tracked source is retained. Two release documents were added in Phase 2; Phase 2B adds seven source/test files and updates thirteen files (20 changed files total).
- Exclusions: machine-specific Codex configuration, active environment-bound CI approval, historical operational reports and generated research/demonstration reports. See `release-candidate-manifest.json` for exact paths and reasons. No excluded file was deleted from the original checkout.
- The disabled `ci/company-acceptance/approval.candidate.json` is retained as a regression input: `enabled=false`, with no approval ID, approval date or expiration. It conveys no authorization. The active `approval.json` is excluded and ignored.
- Local PowerShell/helper source and its tests remain available; saved configuration, DPAPI payloads, tokens, private exports, certificates, dependency trees and build outputs are not publication inputs.
- Personal contact identifiers/names and an operator email in test fixtures were replaced with fictional values in the candidate only. Public-company source fixtures and existing public marketing assets remain source inputs; private saved research documents were not copied.

## Narrow preparation changes

1. Use `fileURLToPath` in Vitest aliases so Windows paths and paths containing spaces resolve correctly.
2. Exclude generated `outputs`, `coverage` and `dist` from TypeScript compilation, consistent with ESLint/Git exclusions. Source/tests remain checked.
3. Require the standard Next.js GET request parameter in the dashboard route, and exercise the real host-bearing request in its authentication tests.
4. Contextually type the preparation fixture with `satisfies PreparationPlan`, retaining the literal HOLD contract.
5. Make the local runtime-discovery test use isolated portable-tool fixtures rather than the operator's installed PATH/tool layout.
6. Update the internal-research UI test for its existing preparation-status GET; retain exact request-count, single-POST, model-stage and HOLD assertions.
7. Ignore machine configuration, environment files (except `.env.example`), credential/certificate file types, active CI approval and generated reports.

No authentication, production safety guard, research algorithm, provider adapter, eligibility rule, model configuration or database schema was relaxed. Phase 2B changes are exhaustively listed in the manifest under phase2bChanges.

## Validation method and results

Runtime: Node 24.22.1; pinned pnpm 9.12.0. `pnpm install --offline --frozen-lockfile --ignore-scripts` reused all 472 locked packages without downloads. Prisma 5.22.0 binaries were copied from the existing same-version local installation into this worktree's ignored dependencies; generation then succeeded offline. The lockfile was not changed. The available generic pnpm shim was a different version and was not used.

Validation ran without loading DPAPI or saved local configuration. Provider/authentication environment inputs were removed from child processes. Prisma/build used a dummy loopback database URL; tests had no inherited database URL. A validation-only Node preload denied external connections, allowing local socket fixtures. Commands that needed temporary Git repositories or Next output writes ran outside the filesystem sandbox with those same controls. No cloud CI was dispatched.

| Check                                                                  | Result                                                                                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `pnpm prisma:generate`                                                 | PASS, Prisma 5.22.0                                                                                                 |
| `pnpm prisma:validate`                                                 | PASS                                                                                                                |
| `pnpm typecheck`                                                       | PASS, including generated Next route types                                                                          |
| `pnpm lint`                                                            | PASS                                                                                                                |
| `pnpm build`                                                           | PASS; Next.js 15.5.20 production compilation, 19 static pages; Recycler route included                              |
| Focused Recycler/build-fix regressions (Phase 2 baseline)              | PASS: 258 tests, 9 files; covered again by both Phase 2B full suites                                                |
| Local publication/diagnostics helper tests                             | PASS: 57 passed, 0 failed, 0 skipped                                                                                |
| Full serial Vitest suite (`pnpm test --maxWorkers=1 --minWorkers=1`)   | PASS: 2,419 passed, 0 failed, 18 existing skips; 187 files passed, 0 failed, 1 skipped; 186.76 seconds              |
| Full parallel Vitest suite (`pnpm test --maxWorkers=4 --minWorkers=1`) | PASS: 2,419 passed, 0 failed, 18 existing skips; 187 files passed, 0 failed, 1 skipped; 62.29 seconds               |
| Post-fix offline recovery stress                                       | PASS: 64 scenarios across two harnesses, 0 failed, 0 skipped (each crashes, resumes and reopens in fresh processes) |

Phase 2B replaces the private artifacts listed below with hand-authored synthetic fixtures. All original test cases and business assertions remain; nine regressions were added. Hashing is real SHA-256. Only immutable reference metadata was extracted into two modules so test-local mocks can bind synthetic bytes. Original production hashes, IDs, paths and validation conditions are unchanged. Unmocked production-boundary tests explicitly reject the synthetic inputs. No production test-mode override was introduced.

### Exact missing artifact dependencies

All paths below are historical inputs, not publication files. Tests now generate isolated temporary fixtures; they never read the private originals.

| Affected test                                                            | Previous private dependency                                                                                                                                                                                                                                                                                                    | Synthetic replacement                                                                                                                                                                        |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| commercial-ab/experiment.test.ts (18 failures)                           | commercial-ab: nutrafol-evidence.json, lumatrail-evidence.json, harborledger-evidence.json, experiment-plan.json, local-blind-key.json, aggregate-spend.jsonl; nutrafol-writing-demo-v1: aggregate-spend.jsonl, corrected-nutrafol-evidence.json, internal-writing-results.json; local Downloads/Primelis Signal Tech-Deck.pdf | src/test/synthetic-experiment-artifacts.ts: three fictional packets, tiny product inputs, synthetic historical journals, saved grounding/strategy and distinct fresh-run/continuation states |
| company-research/automatic-execution.test.ts (19 failures)               | company-reviews/5af5468f-f42b-41f6-a419-2444fbbd0167.json; 60d7aec5-b74f-4674-ba8c-383878702eb9.json; d4eb59e6-8160-4d45-a8d2-44c0174b7b65.json; 5bfc80e8-8d53-4942-86f4-884405437724.json                                                                                                                                     | src/test/synthetic-company-documents.ts: grounded, reusable, rejected-citation and editorial-review cases                                                                                    |
| company-research/choice-hotels-continuation.test.ts (collection failure) | company-reviews/d4eb59e6-8160-4d45-a8d2-44c0174b7b65.json                                                                                                                                                                                                                                                                      | Seven rejected candidates, three sources and exact surviving citations; all synthetic                                                                                                        |
| company-research/evidence-partition.test.ts (collection failure)         | company-reviews/e182f7bd-c35e-4a8b-afc7-67ff86f21cda.json and d4eb59e6-8160-4d45-a8d2-44c0174b7b65.json                                                                                                                                                                                                                        | Synthetic erased-result and rejected-citation cases, including transposed IDs and URL-as-quote rejection                                                                                     |
| company-research/result-integrity.test.tsx (collection failure)          | company-reviews/51050532-c7a0-4bf5-bcf7-3d8f5a4d696d.json, e182f7bd-c35e-4a8b-afc7-67ff86f21cda.json, d4eb59e6-8160-4d45-a8d2-44c0174b7b65.json                                                                                                                                                                                | Synthetic historical, failed and continuation documents; real polling and single-POST assertions retained                                                                                    |

The artifact directory prefix is outputs/product-demonstration/. Test fixture labels retain existing public company names and opaque document IDs where name/ID-bound guards require them; excerpts, drafts, reviews, recipient and journals are invented. No private file contents, PDF, customer research, actual recipient or credential was copied. Freshness-sensitive tests freeze Date only, leaving real timers/polling active.

### Parallel recovery diagnosis

The disk harness already used a unique directory and an exclusive transaction lock. No shared database, shared queue state, global mutation collision or production recovery defect was found. Offline stress reproduced Windows EPERM at rename of fixture-state.json.next over fixture-state.json (2/32, then 2/32, then 3/32 failures in three diagnostic batches). The precise external holder of the Windows file handle is not established.

The test-only disk adapter now retains its transaction lock and retries only that atomic rename for Windows EPERM: six attempts maximum, waits of 25–125 ms, at most 375 ms total. It never repeats the queue mutation, deletes the committed checkpoint, refunds work or retries a provider operation. Other errors and exhausted retries propagate. Tests cover transient replacement, persistent failure and non-Windows/non-EPERM errors. The restart tests also clean their unique generated directories after each test. Production queue/store/recovery code is unchanged.

A subsequent serial confirmation exposed the same issue in the separate company-ci-process test harness (2,418 passed, 1 failed, 18 skipped). Its failed directory retained queue.json.next; a diagnostic stress batch reproduced EPERM rename in 3/32 scenarios. That second test-only adapter now shares the bounded helper and awaits each replacement before releasing its lock or completing audit persistence. Same-run rejection, fresh-run recovery, reopening and tamper assertions remain intact. Post-fix stress: 32/32 queue scenarios and 32/32 CI scenarios passed, each with eight concurrent scenarios per batch. The interim failure is retained here rather than hidden by the final results.

Existing conditional skips cover real-database, browser, optional-source and generated-runtime checks. No new skips were introduced. The production build used dummy configuration: it proves compilation, not cloud sign-in or live connectivity.

## Secret and publication scan

Gitleaks 8.30.1 was obtained from its official release and checked against the published SHA-256 checksum. The exact candidate-file export is scanned separately from dependencies, generated test outputs and private recovery storage, with full redaction. Additional source inspection checked provider-token/private-key patterns, personal email literals, private data dependencies and `.gitignore` membership.

Phase 2B scanner input: all 688 publication files, including every added/modified file. Zero findings in the 20 Phase 2B files; five unchanged, reviewed false positives elsewhere, no confirmed credentials or unresolved scanner findings. Two are ordinary prose in `docs/daily-agent-workforce.md:62` and `docs/agent-workforce-production-readiness-audit.md:15`; three are synthetic idempotency/request keys in `src/server/agent-workforce/business-quality.test.ts:178` and `src/server/agent-workforce/draft-studio/engine.test.ts:169,194`. Gitleaks itself exits 1 for these raw findings; the disposition is manual, not a claim that the raw scanner returned zero. No broad allowlist or scanner-rule suppression was added. Every selected path passes `.gitignore` review. Automated scanning is not a guarantee against every unknown secret format.

## Database readiness

All 11 existing migration SQL files, the PostgreSQL migration lock and Prisma schema are unchanged from the base commit. Schema validation passes; no new migration is needed for these build fixes. No database was contacted, migrated, reset or seeded. Actual applied migrations, database drift, backup/restore readiness, preview isolation and RLS/grants still need an authorized read-only infrastructure check. Static consistency is not proof that a cloud database matches the schema.

## Cloud-specific boundaries retained

| Area           | Current boundary                                                                                                               | Required later work                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Recycler       | API requires local-development configuration; readers use the local identity/vault                                             | Authenticated cloud reader factory using existing operator/role checks                                                                  |
| HubSpot        | Token/configuration and operator/account binding; sync worker blocks production                                                | Explicit Preview account/owner binding and read-only validation; no changes to origin/pagination/history checks                         |
| Outreach       | Local DPAPI loader, localhost HTTPS callback, in-memory pending OAuth state; encrypted actor-bound storage and refresh locking | Cloud secret configuration, durable expiring one-use OAuth state, approved callback/credential transition; retain rotation locking      |
| Agent workers  | Existing leases/checkpoints; production execution guards and external runner                                                   | Protected, bounded cloud scheduling with explicit budgets and kill switch; no always-on local process                                   |
| Authentication | Existing Supabase auth and application roles; local identity deliberately disabled on Vercel                                   | Verify Preview Supabase/database pairing, sign-in/profile binding and allowed redirect configuration; never enable local auth on Vercel |
| Research       | Local model/pricing/budget authorization and filesystem-backed saved review artifacts                                          | Cloud-specific authorized configuration and durable storage using existing application components                                       |

The standalone Recycler still lacks composition with the separate company-size/revenue/role/opportunity checks. Before any live eligible list, preserve owner 1087915602, HubSpot-ID deduplication, >=80 employees AND >=$30M revenue, relevant senior responsibility, four calendar months, authoritative history/suppression/sequence/opportunity clearance, verified current employment and fresh independent business-email verification. Unknown, stale, catch-all and ambiguous evidence remain HOLD. No sending/enrollment or CRM writes are authorized by a review result.

## Recommended next step

After explicit publication approval and review of deployment triggers, implement the smallest cloud configuration/authenticated-reader boundary and durable review/OAuth state in protected Preview, after verifying isolated database/auth bindings. Do not remove production guards or enable scheduling/paid providers as part of source preparation. A push to this repository can trigger Vercel, so publication remains a separate explicit approval.
