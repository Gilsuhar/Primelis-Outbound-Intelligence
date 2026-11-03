# Signal Sales Copilot — implementation and validation

Date: 2026-10-15 (Asia/Jerusalem)

## Repository verification

- Repository: `Gilsuhar/Primelis-Outbound-Intelligence` (verified origin remote).
- Initial checkout: clean local `work` branch, HEAD `3b258bae42121efd70f5229f034c1fa24294e30f`. The required branch, commit and plan were absent locally.
- Fetched the existing remote feature branch and switched safely to local `feature/signal-sales-copilot`.
- Verified feature HEAD/base: `4685c9ff7a3fd10c9224c23ea001452cc775dbe2`.
- Confirmed `docs/signal-sales-copilot-plan.md` exists at that commit. Implementation is a descendant of it.
- No changes or commits to `main`.

## Baseline diagnosis and fixes

The baseline reproduced exactly: 369 passed, 68 failed, 1 skipped.

Actual defects fixed:

- The Step 3 reference validator required legacy wording and rejected the safe measurement capability for UNKNOWN SERP contexts. Validation now checks capability semantics, while independent factual, source, metric and proof-placement checks remain mandatory.
- Commercial profile facts could be selected without a `PROSPECT_FACT` opening style, or joined into a semicolon fragment rejected by the renderer. Select one grounded commercial fact, classify it consistently, and render complete skill statements naturally. Bare titles and malformed fragments still fall back safely.
- The deterministic planner generated its own forbidden phrase `query sets`, causing valid service requests to reject. Planner language now uses ordinary keywords; the copy safety check remains intact.
- Unrelated hard-coded customer metrics were available when approved source-backed proof was missing. Removed this fallback. Email 3 is HOLD when no approved proof is selected.
- Proof validation rounded percentages and could accept an altered decimal metric. Metrics now require the exact approved value, and sequence proof text must retain its approved meaning verbatim. Added source-backed proof placement and extra-metric checks to the common final validator.
- Generated greetings could be treated as the authority for an unverified name. Greeting repair now uses the resolved prospect name rather than inferring identity from AI prose.

Outdated expectations corrected:

- Proof belongs in Email 3; Email 4 closes without restarting the pitch.
- Missing verified screenshot evidence means HOLD, even when pasted keyword notes describe a SERP scenario.
- Legacy mixed-channel requests are rejected by the four-email engine.
- Tests now check grounded behavior rather than obsolete exact copy, fabricated static proof, stale account names, or acceptance of unsafe hybrid rewrites. Existing negative safety tests remain active.

## Four-email engine

1. Personalized opener: uses grounded prospect/company context and a specific paid-search business angle; weak context receives a safe role/company question.
2. SERP evidence: requires a seller-attested, manually verified prospect Google SERP screenshot, HTTPS screenshot URL, matching branded keyword, market, supported device, valid nonfuture observation date, and visible observation. Generic examples, incomplete metadata and pasted keyword notes do not release HOLD. Screenshot copy stays deterministic; AI cannot rewrite it or add competitor activity. The source URL and capture metadata are retained outside the email body.
3. Capability and proof: introduces the distinct capability of connecting live coverage with existing Google Ads bid decisions. Reuses the existing industry/persona/pain-context proof selector. Only explicitly APPROVED, source-backed and usage-eligible case studies are used. Approved metrics and proof wording are validated again before persistence. Missing proof means HOLD.
4. Low-pressure follow-up: concise closing sentence with a natural invitation to continue. No proof repetition or renewed product pitch.

All steps are emails on days 1, 4, 9 and 15. Replies inherit the first subject and carry `REPLY_TO_FIRST` thread metadata. Editing Email 1's subject updates all follow-ups; reply subject fields are read-only. These are draft-thread instructions; a future sending adapter must use the first email's actual message ID.

Each generated step is either HOLD or PENDING_HUMAN_APPROVAL. Generation never approves or sends an email. Existing draft persistence stores the evidence, thread and review metadata. No database schema migration, new infrastructure or new provider dependency was added. Skipping screenshot rewrites also avoids unnecessary AI calls.

## Validation

| Check | Result |
| --- | --- |
| Prisma generation | Passed, exit 0 |
| TypeScript | Passed, exit 0 |
| ESLint | Passed, no warnings/errors |
| Relevant tests | 155 passed, 0 failed |
| Full test suite | 460 passed, 0 failed, 1 skipped; 50 test files passed, 1 skipped |
| Production build | Passed, exit 0 |
| Diff whitespace check | Passed |

The pnpm launcher initially attempted to bootstrap into an unavailable home directory. Validation used the installed package executables directly, matching the repository scripts:

- `node node_modules/prisma/build/index.js generate`
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`
- `node node_modules/eslint/bin/eslint.js .`
- `node node_modules/vitest/vitest.mjs run` (plus the six relevant test files)
- `node node_modules/next/dist/bin/next build`

The one pre-existing skipped Prisma integration harness requires `TEST_DATABASE_URL`. Database-backed integration behavior was therefore not verified against a live test database.

## Files modified

- `src/features/build-sequence/evidence-policy.ts` (new)
- `src/features/build-sequence/evidence-policy.test.ts` (new)
- `src/features/build-sequence/build-sequence-client.tsx`
- `src/features/build-sequence/sequence-policy.ts`
- `src/features/build-sequence/strategy-planner.ts`
- `src/features/build-sequence/strategy-planner.test.ts`
- `src/features/build-sequence/types.ts`
- `src/features/proof/proof-policy.ts`
- `src/features/proof/proof-policy.test.ts`
- `src/features/sales-workflow-ui.test.tsx`
- `src/server/services/build-sequence-provider.ts`
- `src/server/services/build-sequence-provider.test.ts`
- `src/server/services/build-sequence-service.ts`
- `src/server/services/build-sequence-service.test.ts`
- `src/server/services/message-strategy-planner.ts`
- `docs/signal-sales-copilot-validation.md` (this report)

## Remaining limits

- Live database integration coverage requires `TEST_DATABASE_URL`.
- Sellers must supply and manually verify real prospect screenshot evidence and select eligible approved proof before held steps can proceed to review. Screenshot verification is a human attestation, not automated visual verification.
- Draft thread metadata and review requirements are implemented; actual message-ID threading, sending and enrollment are outside this change.
- No emails sent; no HubSpot or Outreach records modified; no deployment, remote push, PR merge or merge to main performed.

The implementation is committed locally on the feature branch. The accompanying delivery report records the resulting commit SHA; no PR was opened.
