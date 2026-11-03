# Target-specific initialization package — Phase 02 NOT EXECUTED

This is a review package, not an automatic migration. No file is called by the app, CLI worker, build or workflow. Run nothing without separate exact-target approval. Phases 00–01 and rollback-only permission verification were completed previously (see LOCAL_PROGRESS_REPORT.md); do not repeat them. Phase 02 remains unexecuted. The current extension was prepared and tested without executing SQL.

## Exact scope

| Item | Approved-target proposal |
| --- | --- |
| Organization | org-shy-brook-84467702 |
| Project | snowy-art-90934943 / primelis-signal-pilot (Free) |
| Branch | br-empty-breeze-b51o9q71 / production (verified empty user-table inventory) |
| Direct endpoint | ep-green-silence-b5lbunar.c-7.us-east-2.aws.neon.tech |
| Bootstrap database | neondb, used only for guarded CREATE DATABASE |
| New test database | ci_acceptance_pilot |
| Schema/object owner | neondb_owner; never the runtime role |
| Runtime role | ci_acceptance_app, initially NOLOGIN, no password, connection limit 1 |
| Fictional actor / cohort | ci-fixture-pilot-20261019 / pilot-20261019 |

The branch name is not an authorization signal. Immediately before execution, independently reverify these IDs, endpoint association, Free plan and absence of live dependencies. If anything differs, stop. Do not change existing Vercel, Supabase, prime-signal or local connections. The dedicated ci_acceptance_pilot database now contains the previously approved minimal schema and fictional actor; it must not be treated as an empty phase 00/01 target. Before Phase 02, confirm the unchanged policy digest, restricted NOLOGIN role and absence of unexpected data/marker conflicts.

## Execution phases requiring approval

1. `00-create-database.sql`: connect only to neondb at the direct endpoint through the reviewed same-session initializer described below. Guard checks explicit target/approval inputs, current database, owner session, verified client TLS and PostgreSQL 18. Check no target database/runtime role/user relations exist. Create ci_acceptance_pilot and revoke its PUBLIC database privileges. CREATE DATABASE is not transactional; a failure afterward leaves an empty database for inspection, never automatic deletion. No neondb schema/data/ACL is changed.
2. `01-schema-role.sql`: reconnect explicitly to ci_acceptance_pilot; rerun target checks. In one transaction create the SQL-only restricted NOLOGIN role, status enum, minimal User/GeneratedDraft tables and one fictional User row. Apply exact-row forced RLS and least-privilege grants. The runtime role cannot create objects, delete/truncate, alter the approval marker, access User, or change policies. Existing database privileges and other projects are untouched. PostgreSQL PUBLIC may still allow connection to other empty default/system databases in this dedicated project; no permissions there are expanded, and CI strictly rejects any non-pinned database. Do not claim cluster-wide CONNECT denial.
3. **Later, after real manifest review:** recheck the sorted policy digest using the exact database.ts query, and finalize approval.json with the verified private repository identity, attested isolation/billing evidence, actor/cohort and a fresh <=7-day approval window. Compute the exact approval file byte hash. `02-identity-marker.sql` accepts that non-secret hash as `approval_sha256`; it inserts the exact serialized marker while the role is still NOLOGIN. It cannot manufacture or prove human approval: the executing operator must review the manifest and compare its hash first. Historical repository/billing verification references are now recorded in the disabled candidate; recheck them before execution. Never use the fictional test approval.
4. **Later, separately authorized credential handoff:** privately set a strong runtime password and enable LOGIN only after actual grant/RLS negative tests pass. SQL creation is essential: Neon console/API-created roles may inherit neon_superuser. No password statement or login activation is in this package. Store only the restricted runtime URL in the isolated private repository's encrypted CI_DATABASE_URL secret. No environment files, credentials on command lines, admin secret in Actions, or provider tokens.

Use `initialize.ts` through the separately built `initialize-entry.ts`, not direct psql script invocation. Build only with `node scripts/build-company-ci-initializer.mjs`; this never executes SQL. After separate approval and fresh target/emptiness checks, the operator supplies private process-only `CI_NEON_ADMIN_PASSWORD`, absolute `CI_NEON_PSQL_PATH` and `CI_NEON_CA_PATH`, and non-secret `CI_NEON_VERIFIED_ORG`, `CI_NEON_VERIFIED_PROJECT`, `CI_NEON_VERIFIED_BRANCH`, `CI_NEON_EXECUTION_APPROVAL=INITIALIZE_SNOWY_ART_PILOT`. The reviewed invocation is `node outputs/company-ci/initialize.cjs 00`, then, only after phase 00 succeeds, a separate phase `01` invocation. Neither invocation is authorized by this document. Never put the password in an argument, report, env file or shell history. The operator must verify the CA bundle and executable provenance. Existing local PostgreSQL settings remain untouched.

The wrapper pins the exact SQL file hashes, endpoint, port, database and owner, creates a clean child environment, enforces `PGSSLMODE=verify-full`, a trusted CA bundle, TLS 1.2 minimum, `PGGSSENCMODE=disable` and psql `-X`. No connection URI, service file, inherited PG option or arbitrary SQL argument is accepted. It first reads bounded English `\\conninfo` output and confirms the pinned identity and TLS 1.2/1.3. Only then does it pass the acknowledgement and reviewed phase to the **same still-open psql session**. Missing/malformed output, certificate/hostname failure, early exit or timeout fails closed; no SQL is sent before transport verification. A separate TLS probe cannot authorize SQL on another connection. Failure after SQL begins still requires inspection, particularly nontransactional phase 00; no automatic retry or cleanup.

Neon's proxy can terminate client TLS while PostgreSQL reports `pg_stat_ssl=false`. That backend statistic is no longer a transport gate. Client `verify-full` enforces certificate and hostname verification; the wrapper observes the active client connection. `ci_client_tls_verified` is an operator-controlled handoff, not an unforgeable server attestation; do not set it manually or bypass the wrapper. An administrator able to change scripts/variables can already issue arbitrary SQL. The trusted boundary includes the reviewed wrapper and its executable/configuration, not SQL alone. All target, owner, version and approval checks remain. Fresh authenticated control-plane verification still establishes project/branch ownership; neither SQL nor a TLS certificate proves those IDs independently.

CI uses `connectCiDatabase` to construct and connect the existing Prisma driver with a validated exact-target URL (`sslmode=require`, `sslaccept=strict`). Only that same successfully connected client is eligible for database preflight. Driver verification applies on reconnect too; caller-created clients and standalone boolean attestations are rejected. Actual database/role, privileges, marker and policy checks remain mandatory. No production application transport or guard is changed.

Revised SHA-256 review pins (raw file bytes; line-ending changes require review):

- target-guard.sql: `a3e5504be9b6b115c388c4c8cc0b4161011bca4380bb79ff59edcf443739b280`
- 00-create-database.sql, unchanged: `e6428bcb06498f3d2e44d645c57d1f01f8c6595916f3e49cce59efb8b934cbdf`
- 01-schema-role.sql, unchanged: `66a05f9beac7a3740332ecea1488a8040c005c04724351a897cf031daf1e2f9c`

- 02-identity-marker.sql, unchanged: `09dcc334580a39e9c957128c07017172c1d6d4ae6e288b6d6cd7ab2fd2950127`

## Phase 02 local extension (prepared; execution not approved)

The initializer now supports Phase 02 with a separate approval gate. All four SQL bodies above remain byte-identical. No schema, RLS, role, grant or runtime authorization change is included.

The final manifest must bind repository `Gilsuhar/agentworkforce-ci-acceptance`, numeric repository ID `1426200737`, owner ID `79252537`, the pinned Neon project/endpoint/database, actor/cohort above and policy digest `02541f5342fe33b832016e17dad9c15be10af046300446dd63c3fcc62dc265cd`. The manifest now explicitly requires branchId `br-empty-breeze-b51o9q71`; missing/other branches fail closed. Organization and branch also remain mandatory exact initializer inputs checked against NEON_CI_TARGET; they are not inferred from the branch name. Normal application authorization is unchanged; the finite CI schema is more explicit. No SQL body changed.

The checked-in local candidate stays `enabled=false`. No final approval.json is created by preparation or tests. Its real approvedAt/expiresAt/approvalId and scoped setupManualInterventions count remain pending rather than fabricated. Historical evidence references resolve to these LOCAL_PROGRESS_REPORT.md entries:

- `github-private-api-20261020`: authenticated CLI repository/owner/PRIVATE metadata verification.
- `github-apps-hooks-20261020`: repository creation checks, Actions disabled after reload, no installed Apps and empty webhooks.
- Existing billing and rollback-RLS references retain their recorded historical meaning; none were repeated during this local extension.

After separate human execution approval and fresh read-only preflight, finalize those pending fields and `enabled=true` in the final approval.json, review its exact bytes and record their SHA-256. This local manifest flag does **not** enable GitHub Actions, credentials or source publication. It permits only the subsequent separately authorized operation; those other actions remain blocked. Do not set enabled=true in the candidate now.

The separately built entry accepts phase `02`, reads only `ci/company-acceptance/approval.json` (maximum 8192 bytes, no template/candidate fallback), and requires process-only `CI_APPROVAL_SHA256` to match its exact content. It also requires `CI_NEON_EXECUTION_APPROVAL=INITIALIZE_SNOWY_ART_PILOT_PHASE_02`, not the old 00/01 token, plus the existing private administrator input, verified target IDs, executable and CA paths. Only after strict manifest validation does it start psql; only after same-session TLS validation does it send Phase 02. Approval expiry is checked again immediately before SQL handoff. The wrapper passes the existing internal shared-guard token after its phase-specific gate; no SQL guard is relaxed. Errors are bounded codes, never raw psql diagnostics or credentials.

Prepared invocation, **not authorized to run yet**: `node outputs/company-ci/initialize.cjs 02`. Build-only command remains `node scripts/build-company-ci-initializer.mjs`. The only proposed database mutation is insertion of `ci-identity-pilot-20261019` with the final manifest hash. An identical existing marker is a no-op; a different marker is rejected without overwrite. The role stays NOLOGIN. No later phase is chained or retried.

Before approving execution, review the finalized manifest, exact digest and this operation together. The approval window must cover the intended later finite test; expiry or changed manifest bytes after marker insertion requires a separate review because the marker cannot be silently rewritten. Historical success does not establish current cloud readiness.

## Least privilege and replay review

- All objects remain administrator-owned. Runtime has no elevated flags or role memberships, no inheritance, no database TEMP/CREATE, no schema CREATE, no User access, no DELETE/TRUNCATE, and only GeneratedDraft SELECT/INSERT/UPDATE plus enum/schema USAGE.
- SELECT permits the actor's exact queue, audit and marker ID/workflow pairs. INSERT/UPDATE permit only queue/audit; UPDATE checks old and new row identity. Admin-only marker SELECT/INSERT policies permit phase 02 under forced RLS without giving runtime access to that policy. No public policy or security-definer function.
- The queue ID is SHA256(JSON.stringify(actor)), matching existing persistence; it is not SHA256 of the unquoted string. Queue/audit UPSERT needs SELECT as well as INSERT/UPDATE; all three policies are included.
- Setup replay is fail-closed: phases 00/01 stop before changing any unexpected/pre-existing resource. They do not silently repair or overwrite drift with IF NOT EXISTS. Repeating a successfully initialized setup produces a refusal with no additional mutation. Phase 01 errors roll back its role/tables/grants/User row together. Phase 02 repeats only when the existing marker is identical, with no UPDATE; mismatches stop.
- No cascading grants, future-object defaults, provider services, cron, worker activation, real contacts, knowledge approvals, resets or imports.

## Acceptance after separately approved SQL execution

Verify authenticated client TLS/current database/current role, no memberships/elevated flags/ownership/create/delete grants, forced RLS and pinned policy catalog using the existing database preflight (full worker preflight also requires the later marker). In separately approved rollback-only runtime probes, check queue/audit INSERT+UPSERT succeed, other actor/workflow writes fail, marker UPDATE affects zero rows, marker INSERT and moving a queue row to marker fail, and DELETE/TRUNCATE/DDL/SET ROLE neondb_owner fail. Re-read unchanged marker/row counts after rollback. Inspect the original neondb inventory to confirm it remains untouched. These are future database tests, not claims from static review.

Then obtain separate source-publication/finite-execution approvals. Three unattended fictional jobs must persist Grounding/Judgement, recover the deliberate interruption on a different runner after 150 seconds, reject unsupported claims and duplicates, and hash-match on a third invocation while Windows is off. No paid AI or outbound activity. NOLOGIN and disabled workflow remain in place until their respective approvals.

References reviewed: [Neon role access](https://github.com/neondatabase/website/blob/main/content/docs/manage/database-access.md), [PostgreSQL INSERT privileges](https://www.postgresql.org/docs/18/sql-insert.html), [PostgreSQL row policies](https://www.postgresql.org/docs/17/sql-createpolicy.html). Syntax, permission behavior and hosted persistence remain unexecuted and must be checked on the approved target before activation.
