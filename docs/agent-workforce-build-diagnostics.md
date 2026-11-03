# Agent Workforce Preview artifact investigation

The live issue is not reproduced by the source renderer. Uppercase HUBSPOT and
OUTREACH IDs render both integration actions even without sync metadata. No
integration UI behavior has been changed by this diagnostic.

## Evidence and limits

- GitHub deployment 7144102339, created by vercel[bot], reports successful Preview
  deployment of 1482e6cbe0980c070647892336aa26bf972d1e3e at
  `primelis-outbound-intelligence-763ossp9s-gils-projects-509a022f.vercel.app`.
  Its Vercel deployment identifier is `dpl_EVS9N3o9HnUB4ZwdKBqseQSQnB4x`.
- GitHub's commit tree and dashboard service/client blob hashes match the local
  source. There is one tracked package.json at the repository root, no second
  app/pages tree, and no tracked Vercel configuration or deployment workflow.
- The operator inspected Vercel settings: Next.js framework, no explicit root,
  install, build or output overrides. The build log confirms the correct repo,
  branch and commit, Prisma generation and pnpm run build. It restored cache
  from deployment GHJs6NgWF.
- The operator reports that the served API still contains the Outreach text
  replaced in 8841398, and the loaded JavaScript lacks “Check access”. These
  observations conflict with the intended source. Cache restoration alone does
  not prove that cache is the cause.
- Direct requests from this workspace reach Vercel deployment protection and
  redirect to vercel.com/sso-api. The protected API/client bytes, build cache and
  effective routing cannot be independently inspected with current access.

The verified finding is a discrepancy between selected source and reported
served behavior. A stale compilation artifact or runtime routing/cache problem
remains a hypothesis, not an established root cause.

## Prepared diagnostic (Preview only)

Next config emits a `[workforce-build]` log record containing validated commit
metadata and SHA-256 hashes of the dashboard route, service, client and integration
controls. A combined fingerprint identifies this selected source set. It fails
if the package root is wrong, source files are missing, or available Git checkout
metadata disagrees with Vercel's declared commit. Source archives without Git
metadata still get source hashes.

The same record is embedded at build time in the server and browser bundles:

- Authenticated `GET /api/sales-agent/dashboard` has a top-level `build` field
  only in Preview. The existing `data` payload and no-store behavior are retained.
- The dashboard root has a `data-workforce-build` attribute, with no visible UI
  change. In the authenticated Preview browser, inspect only this safe metadata:

  ```js
  JSON.parse(
    document.querySelector("[data-workforce-build]")?.getAttribute("data-workforce-build") ||
      "null",
  );
  ```

Only commit hashes, selected relative source paths, file hashes and a schema
version are emitted. No environment dump, credentials, connection URLs or user
data are included. Production builds disable the record, and Production API
responses omit it even if a public diagnostic value is present.

## Proposed controlled experiment — requires deployment approval

1. Review the diagnostic changes on feature/agent-workforce-foundation. Do not
   push without approval: Git integration automatically creates a Preview.
2. Once approved, build the approved commit as Preview with the existing verified
   branch-specific variables. Disable use of existing build cache for this one
   deployment. Use the existing pnpm build command; no migrations, sync jobs,
   worker activation, Production promotion or local prebuilt artifact upload.
3. Confirm the build log's cloning commit and `[workforce-build]` source hashes
   match the approved source. Use the new immutable deployment URL.
4. Compare the log record with both the API `build` record and the client's DOM
   attribute. Inspect actual loaded chunks for “Check access” and “Sync read-only”
   and inspect the API's actual integration detail. Do not click integration
   actions to validate this deployment.
5. If clean output is correct, cache involvement is supported; leave cache
   disabled only if repeatable evidence warrants it. If behavior remains legacy,
   inspect emitted function/chunk artifacts and routing rather than changing UI
   conditions or rerunning deployment blindly.

Missing log identity means the intended config was not executed. A missing or
different API/client identity localizes a server/client artifact or routing
discrepancy (also confirm runtime is Preview). Matching source identities with
legacy behavior require inspection of actual compiled module bytes: source
fingerprints attest the input files, not the correctness of the compiler cache.

No deployment or Production configuration change is part of this investigation.
