# Daily Recycler local product acceptance

Reviewed on 3 November 2026 in `codex/agent-workforce-product-sprint`, continuing from `16e575d`. No migration worktree changes.

## Browser environment and scope

The actual Next.js `/sales-agent/recycler` page, application shell, React hydration, middleware and session checks ran in a fresh headless Chrome profile on loopback. Viewports: 1440×1000, 390×844 and a 320px narrow-screen overflow check. Screens were inspected visually in addition to browser assertions.

The test process supplies only an in-memory, read-only local SALES_USER profile through the existing Prisma test seam. The real localhost cookie checks remain active; anonymous and invalid sessions are rejected. The local-login database-writing POST is never called. Every other database operation is denied, and port 5432 connections are blocked. Credential environment variables are cleared and local credential files are refused.

Browser reads use explicitly intercepted synthetic responses for loading, empty, failure and incomplete-collection scenarios. The test server rejects all mutation/provider requests even if interception fails. It never executes the live Recycler route. Both browser and Node provider networking are blocked; Chrome uses no existing user profile. Next's development version-check attempt was blocked by the Node network guard. There were no browser runtime exceptions or external browser requests in the successful run.

Run locally with PowerShell 7 and the existing dependencies:

```powershell
pwsh -NoProfile -File validation/run.ps1 -Task acceptance-browser
pwsh -NoProfile -File validation/run.ps1 -Task acceptance
```

Port 3000 must be unused. The harness refuses an existing listener, starts its own test server, and shuts down its server and browser after the run. No fixture is imported by the application or enabled by a build/deployment.

## Demonstrated issues corrected

- Recycler navigation was blank because its translation key was missing. Added labels in all three supported languages, a safe label fallback, and placed it with workspace navigation.
- Opening details left them below the viewport, especially on mobile. Details now receive focus and scroll into view; closing restores focus to the original prospect control.
- Resetting the offline demo retained filters and could leave every row hidden. Reset now clears search/status/sort/selection; a separate clear-filter control is available.
- Disqualified rows showed generic HOLD reasons before confirmed suppression. Confirmed exclusions now appear first without changing any eligibility result.
- Ownership evidence was not directly inspectable for the qualified fixture. Details now show the owner ID, required ID, source and check time.
- Draft approval status was easy to miss below a long research brief. Each email now states “Draft only · Pending human review · Not sent.” There is no approve, send or enroll control.
- Empty collections used the same explanation as zero-result filters. They now explain absent collection data and explicitly deny clearance.
- Non-JSON read failures exposed JSON parser messages. They now show an actionable failure while preserving the earlier list and evaluation timestamp. Pending reads announce their state and prevent duplicate clicks.
- The mobile table can now receive keyboard focus for horizontal scrolling.

## Acceptance evidence

The browser checks cover synthetic discovery counts; owner/company evidence; outbound timeline; authoritative Outreach no-record evidence; incomplete Outreach history remaining HOLD without drafts; confirmed unsubscribe exclusion; ambiguous same-email records remaining separate; research and unsent drafts; all four sort choices; status/search/reset controls; safe eligible CSV export; loading/failure/empty/incomplete states; focus restoration; and desktop/mobile layout.

The qualified example uses an authoritative synthetic Outreach **NOT_PRESENT** receipt, not a fabricated complete communication history. Jordan Delivery supplies the partial-history example. Existing mocked collector/qualification/preparation tests verify the pipeline behind these saved page fixtures, including deduplication and strict gates; the browser does not run live discovery or paid research.

| Check | Result |
|---|---|
| Real Chrome acceptance | 41 passed; 0 failed; 0 runtime exceptions; 0 external browser requests |
| Focused Recycler/readers/daily tests | 525 passed; 10 existing opt-in Chrome skips; 0 failed |
| UI/navigation/authentication/Preview safety | 212 passed; 0 skipped; 0 failed |
| TypeScript | Passed |
| ESLint | Passed |
| Production build | Passed; authenticated Recycler route built successfully; no deployment |

The ten skipped cases belong to the separate existing Outreach OAuth browser suite; this review's 41 Chrome assertions are actually executed, not skipped. No existing assertion or skip condition was weakened. Early harness failures were Windows preload quoting, polling before document creation, and fixture-contract assumptions; the final runner asserts the actual saved receipts and HOLD/no-draft result.

Safe local screenshots and machine-readable results: `outputs/recycler-acceptance/`. Key files are `desktop-workspace.png`, `desktop-details.png`, `desktop-loading.png`, `desktop-failure.png`, `desktop-empty.png`, `desktop-incomplete.png`, `mobile-workspace.png`, `mobile-table.png`, `mobile-details.png`, `mobile-draft.png`, and `report.json`. Baseline screenshots showing the original behavior are retained in its `baseline/` directory. Logs and screenshots are local ignored artifacts, not publication inputs.

## Protected Preview readiness

The synthetic workspace is ready for a protected Preview usability review, subject to a separate deployed smoke test of the existing real Supabase session and provisioned application profile. Local fixture authentication does not prove cloud authentication or infrastructure readiness. Existing Preview tests confirm that the authenticated synthetic page remains available while provider APIs and workers are denied.

No live HubSpot/Outreach integration, paid research, production model quality, persistent human approval, automatic live research attachment or cloud scheduling was validated or enabled. Real provider history/verification evidence and cloud provisioning remain separately controlled. No push, deployment, database change, migration, message or sequence enrollment occurred. Stop here after local validation.
