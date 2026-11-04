# Profile binding baseline diagnosis (Phase 5O)

Target: agent-workforce-preview / txfxfrlhtvzwgluhnbpw, Primelis, us-west-2.
Failed candidate: 720d76358cfa5ba365aca7e09f5853150241af1b.
Failed run: https://github.com/Gilsuhar/Primelis-Outbound-Intelligence/actions/runs/41889616996.

## Confirmed defect

The binding snapshot used String.replace with a replacement string ending in the
SQL regex anchor and quote (`$'`). JavaScript expands that sequence to the source
suffix. The emitted SQL therefore lost the regex terminator and duplicated the
remaining snapshot SELECTs. It was not the intended baseline query.

A SELECT-only reproduction of the exact published snapshot returned PostgreSQL
SQLSTATE 42601. The client error classifier searched the entire stderr for guard
identifiers; a guard name in the echoed SQL could override the primary syntax
error and be reported as PREVIEW_ROLE_SCHEMA_BASELINE. The published sanitized
log did not retain the original SQLSTATE. The deterministic SQL reproduction and
the classifier reproduction establish this defect without rerunning that job.

Consequently the failed job's label did not prove actual schema drift or successful
earlier guards. The binding transaction was still unreachable: parsing the
read-only preflight failed and ON_ERROR_STOP terminated the client.

## Read-only evidence

Supported Supabase management metadata identified the exact project as
ACTIVE_HEALTHY. Authenticated management SQL returned only approved booleans and
counts, inside read-only transactions where applicable. Database/operator identity
and the pinned cluster fingerprint matched. No credentials or raw identity values
were returned. This management inspection is not a new psql TLS attestation; the
actual-client verify-full/CA/hostname gate remains mandatory in every execution.

Replacing the substitution with a literal-returning callback makes the current
database digest match the **unchanged** reviewed baseline under search_path=pg_catalog.
The same query under public,pg_catalog does not match: deparsed definitions depend
on search_path. The existing pg_catalog setting and C-collation ordering remain.
No baseline regeneration, new exclusions or database remediation is justified.

The digest covers:

| Category | Included properties |
| --- | --- |
| Public relations and columns | OIDs, names, kind, owner, RLS flags, column order/types/nullability/default expressions |
| Public constraints | OIDs, names, deparsed definitions |
| Public indexes | OIDs and deparsed definitions |
| Public types/enums | OIDs, names, enum order and labels |
| Public triggers | OIDs and deparsed definitions |
| Non-public schemas | OIDs, owners, ACLs; existing numeric temporary-schema exclusion only |
| Auth/extension relations | Object and column ACLs and object identity |
| Extension routines | OIDs and ACLs |
| Other database roles | OIDs, names, login/elevated/inheritance attributes |
| Other memberships | Role/member/grantor IDs, admin/inherit/set options |

The already-approved runtime role and its membership are excluded only from the
old digest, as before; separate exact attribute, password, membership, profile-column
and effective-access guards verify them. Public grants are independently checked
by effective privileges and by the before/after privilege snapshot. Policies and
application rows are separately checked, not silently absorbed into the baseline.

All 16 generated preflight conditions were separately evaluated as SELECT booleans
on the live database and passed: identity, read-only context, migration history,
tables, RLS/API restrictions, Auth identity, other-data emptiness, zero profiles,
zero public policies, trigger restrictions, runtime attributes, memberships,
five profile columns, effective access, binding authority and schema baseline.
This establishes 11 matching completed migrations, 50 expected tables, one approved
confirmed nonanonymous email/password identity, zero profiles/policies, and the
restricted NOLOGIN/password-absent runtime role. No data was changed.

Classification: **baseline SQL-generation defect and error-classification defect**.
No persistent object/property difference was found by the corrected, unchanged
baseline comparison. Approved role provisioning is not the cause. Temporary
namespace exclusion remains strictly numeric; no new metadata is ignored.

## Minimal local correction and regression coverage

Use a callback for the existing replacement so `$'` stays literal. Parse only the
primary verbose PostgreSQL error record; accept a guard identifier only from a
P0001 message, never LINE/QUERY/CONTEXT echoes. SQL syntax/permission/object errors
retain their sanitized categories. Process failures still fail closed.

Regression tests compare the entire generated snapshot against the existing role
snapshot with exactly the approved namespace change, reproduce the corrupt string
replacement, reject duplicate query tails, retain deterministic search_path/order,
and distinguish actual raised guards from echoed names. Existing tests continue
to require history/checksums, exact role privileges, RLS, policy restrictions,
unexpected-drift rejection, independent postchecks and no retries. Mocked guard
errors now include PostgreSQL's real verbose P0001 prefix; assertions are retained.

Migrations, Prisma schema, lockfile, baseline manifest, original binding transaction,
workflow, owner/branch gates, trusted CA, TLS settings and Vercel exclusion are unchanged.

## Next boundary

Local validation: focused binding/TLS/provisioning suite 459 passed, 0 failed,
0 skipped (9 files); security suite 212 passed, 0 failed, 0 skipped (13 files,
overlapping coverage). TypeScript, ESLint, Prisma validation and actionlint passed.
Provider-pattern scanning of all 813 intended files found zero matches. Gitleaks
on all eight changed/new files returned exit 1 for one generic-api-key match: the
unchanged approved Auth UUID constant in bind-profile.mjs, a confirmed nonsecret
false positive. No scanner rules or allowlists were changed; no confirmed secrets.

Prepare a fresh reviewed candidate and update approval metadata only with separate
authorization. Never rerun, update or recreate the failed execution branch. A new
execution must repeat all actual-client TLS and live database checks. There are
still zero profiles and policies; no runtime activation is authorized here.
