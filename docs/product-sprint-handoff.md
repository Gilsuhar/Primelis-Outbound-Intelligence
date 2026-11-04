# Agent Workforce product sprint — local engineering handoff

Worktree: `C:\Users\USER\Documents\ChatGPT\Primelis Agent Workforce\product-sprint`

Branch: `codex/agent-workforce-product-sprint`

Base: `b4654a87cb6ad106137b884a002db23af71039ed` (clean publication snapshot).

The original development repository contained substantial uncommitted features. Source inventories and hashes showed that the publication snapshot already included those application paths and the later release-candidate qualification, daily-worker and Preview protections. Differences from release candidate `59aaee2` were publication sanitization/test changes, not missing product features. The sprint was branched from the complete product snapshot, not from a one-time migration execution branch. Original work, recovery archives, migration worktrees and approved branch tips were not edited.

## Implemented and tested locally

- **Eligibility:** stale/untrusted business receipts now produce HOLD rather than a confirmed exclusion. Confirmed opportunity conflicts disqualify; contradictory Paid Social/Search receipts hold. Existing calendar-month, freshness, email, employment, identity and suppression checks remain mandatory. UI and CSV use DISQUALIFIED; the existing internal `EXCLUDED` value is retained for compatibility.
- **HubSpot:** Recycler construction requires owner `1087915602`; source records retain role, owner, created/assigned/updated timestamps and associated company observations. Revenue currency remains unknown unless separately verified. Incremental discovery rejects malformed windows, backward keysets and conflicting duplicate ownership before checkpoint advancement.
- **Outreach:** owner/title/timestamps and available open/reply events are retained. Engagement does not become outbound-delivery evidence. Ambiguous bounce and invalid suppression timestamps remain unresolved even when supplemental clearance is supplied. Existing explicit identity mapping, pagination and no-refresh behavior are retained.
- **Daily processing:** a hard 50-record review limit, same-day completed/blocked-record protection across manual keys, conflicting-duplicate HOLD behavior and retention of earlier run decisions. Defaults target 50 reviews, never 50 eligible prospects. Existing atomic leases, fencing, budgets, retry limits and disabled scheduling remain in place.
- **Research/drafting:** a server-side bridge re-evaluates all Recycler gates before reusing the existing Signal research and draft pipeline. It binds the HubSpot ID, research job, company, contact, mode and freshness. Research sources, missing evidence, hypotheses, screenshot instructions and concise drafts are exposed separately. Version hashes change when evidence changes. Human review stays PENDING; send/enroll permissions remain false.
- **Email quality:** the first email now includes the approved product mechanism and a short CPC-focused CTA. Follow-ups avoid repeating the same mechanism sentence; executive wording addresses the Search team. Existing source grounding, brand/screenshot scope and editorial checks still apply.
- **Workspace:** `/sales-agent/recycler` has a searchable/sortable table, status/gap/research/draft counts, integration visibility, source observations, activity timeline, qualification details, research brief, drafts and screenshot recommendations. `/sales-agent` links prominently to it. The default offline view includes six fictional candidates, including one saved complete research-to-draft example. Page rendering performs no provider calls or agent execution.

The complete synthetic workflow is tested from mock HubSpot collection through qualification, existing research generation, draft composition and pending human review. Tests also cover mismatched contacts/companies/jobs, stale bindings, missing sources, unsupported claims and changed suppression evidence.

## Files by subsystem

| Subsystem | Changed paths |
|---|---|
| Eligibility | `src/features/prospect-recycler/qualification.ts`, `qualification.test.ts` |
| HubSpot sync | `src/server/integrations/hubspot.ts`, `hubspot-checkpoint.test.ts` |
| Read-only collection/matching | `src/server/prospect-recycler/{hubspot,outreach,pipeline,types}.ts`, `pipeline.test.ts`, `reader-provenance.test.ts` |
| Daily controller | `src/server/agent-workforce/daily/{engine,state}.ts`, `review-limits.test.ts` |
| Research/draft bridge | `src/server/prospect-recycler/preparation.ts`, `preparation.test.ts`, `src/features/prospect-recycler/preparation.ts` |
| Signal writing | `src/server/agent-workforce/signal-opportunity/drafting.ts` |
| Review UI/data | `src/features/prospect-recycler/review.ts`, `review-client.tsx`, `review-client.test.tsx`, `src/server/prospect-recycler/{review,review-demo}.ts`, `review.test.ts`, `src/data/fixtures/recycler-product-row.json` |
| Application entry | `src/app/sales-agent/page.tsx`, `src/app/sales-agent/recycler/page.tsx` |
| Offline validation | `validation/run.ps1`, `validation/offline-guard.cjs`, `.gitattributes` |

## Readiness and remaining boundaries

| Area | State |
|---|---|
| Recycler qualification and synthetic flow | Implemented and tested locally |
| Owner-scoped HubSpot reader and incremental checks | Implemented; not live-verified |
| Outreach matching, history/suppression handling | Implemented; not live-verified |
| Research/draft handoff and visible example | Implemented and tested with existing simulated agents; no paid-model quality claim |
| Dashboard table/details | Implemented with synthetic data; real daily counts require approved synchronized data |
| Durable review history | Daily runs retain earlier decisions; draft packets carry evidence versions. A persistent Recycler-specific human-approval UI is not implemented |
| Live research attachment | Bridge is implemented and tested; automatic attachment to live Recycler records is not enabled |
| Daily cloud scheduler | Existing rehearsal adapter and worker protections retained; scheduler remains disabled |
| Schema | No schema or migration changes; all 11 reviewed migrations retained |

Live integration still requires separately approved credentials/scopes, verified HubSpot company/opportunity evidence, complete all-user outbound-history and retention coverage, independent employment/email validation and authorized research inputs. The existing live Recycler route remains capped at five provider records. This sprint does not claim a live 40–50-contact daily run.

Company-overview evidence unavailable in the saved Search packet is explicitly marked missing. SERP observations are not competitor-bid, CPC, spend or savings proof. The UI contains screenshot recommendations, not fabricated image assets.

No push, deployment, migration execution, cloud mutation, real CRM access, live OAuth refresh, paid API request, message sending or sequence enrollment was performed. Authentication and Preview default-deny boundaries remain intact.

## Local commits

- `af19765f6514a9cbd1d0d55769c5c57bfd2554b5` — qualification and reader provenance.
- `1b0233e37c52444ca8968a8b4d5840d53777e683` — daily limits and preservation of prior reviews.
- `4aa9c835465db652b6164ca7fc883e3853895804` — research/draft handoff, review workspace, synthetic example and validation wrapper.
- Final handoff commit (containing this document) — workspace entry, portable validation lookup and LF checkout rules; obtain its SHA with `git log -1 --format=%H`.

## Validation

Logs are retained under `validation/`; generated test artifacts and redacted scanner reports are under `outputs/` (ignored by Git).

| Validation | Result |
|---|---|
| Full parallel suite | 2,801 passed; 18 conditionally skipped; 0 failed (202 files) |
| Full serial suite | 2,801 passed; 18 conditionally skipped; 0 failed (202 files) |
| Security suite | 190 passed; 0 failed (12 files; subset of full suite) |
| Chrome OAuth fixtures | 48 passed; 0 failed, including ten normally opt-in cases |
| Focused drafting/Recycler handoff | 27 passed; 0 failed |
| TypeScript | Passed |
| ESLint | Passed |
| Next.js production build | Passed using local fixtures and no deployment |
| Prisma schema validation | Passed; no migrations executed |
| Sprint-delta Gitleaks | 0 findings |
| Supplemental Git-object scan | 0 findings |
| Full-history Gitleaks | Five inherited generic-pattern matches reviewed as documentation/synthetic identifiers |

Use PowerShell 7: `pwsh -NoProfile -File validation/run.ps1 -Task parallel` (or `serial`, `security`, `browser`, `types`, `lint`, `build`, `prisma`, `secrets`). Dependencies were copied from the existing validated local checkout without downloading packages; all dependency junctions resolve inside the new worktree.

The full suite has 18 pre-existing conditional skips: ten opt-in Chrome cases (all executed successfully in the separate browser run), five real-PostgreSQL cases requiring an unavailable isolated database, two live research diagnostics excluded by the synthetic-only constraint, and one private operator-helper case whose file is absent from the publication snapshot. Eight cases therefore remain unexecuted. No skip conditions were added or relaxed.

The first complete parallel run reported 13 failures from Windows CRLF conversion and direct-runner dependency lookup. The isolated checkout was restored to exact committed SQL/workflow/script bytes, LF rules were added, and pnpm module resolution was corrected. No reviewed SQL, expected hashes or test assertions changed. A subsequent run had one module-resolution failure because it started before the final dependency-link correction; both full suites were then rerun.

The wrapper removes inherited provider/authentication inputs, supplies an unreachable loopback database only for build/schema tasks, disables telemetry and blocks external Node connections. It uses the bundled stable Node 24 runtime. An initial Node 27 alpha run exposed incompatible `localStorage` behavior in unchanged UI tests and was interrupted, then restarted on Node 24. No test assertions or skip conditions were weakened.

The first sandboxed build failed to create a generated Next.js type directory; the same offline build succeeded with filesystem permissions. Opt-in Chrome fixtures use temporary profiles and two loopback mock servers. They required local process permissions; an initial concurrent run timed out in one scenario, and the stable-runtime rerun passed all 48 tests, including all ten opt-in browser cases.

The supplemental full-object secret scan found no matches. Gitleaks found no leaks in the sprint delta. Its full-history scan reported five inherited generic-pattern matches in documentation prose and synthetic request/idempotency identifiers in the base snapshot; these are not newly introduced credentials. The inherited history was not rewritten.

**Recommended next action:** review the synthetic daily workspace and its evidence-to-draft example locally, then define a separately approved five-contact live verification exercise. Cloud scheduling, provider activation, deployment and publication remain separate approval steps; this sprint requires no infrastructure changes.
