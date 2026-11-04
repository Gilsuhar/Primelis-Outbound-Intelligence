#requires -Version 7.0
param([string]$Task = 'focused')
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path $PSScriptRoot)
$validationNodeDirectory = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin'
if (Test-Path -LiteralPath (Join-Path $validationNodeDirectory 'node.exe')) {
  $env:PATH = $validationNodeDirectory + ';' + $env:PATH
}
foreach ($entry in @(Get-ChildItem Env:)) {
  if ($entry.Name -match '^(DATABASE|DIRECT_URL|PREVIEW_|NEXT_PUBLIC_|SUPABASE|OPENAI|ANTHROPIC|AI_|HUBSPOT|OUTREACH|INTEGRATION|WORKFORCE|LOCAL_|COMPANY_|NEON|VERCEL|GETLEADS|ZEROBOUNCE|VERIFICATION|SERPAPI|WRITE_)' -or $entry.Name -match '(TOKEN|SECRET|PASSWORD|API_KEY|ENCRYPTION)') {
    Remove-Item -LiteralPath ('Env:' + $entry.Name)
  }
}
$env:NODE_OPTIONS='--require="' + ((Join-Path $PSScriptRoot 'offline-guard.cjs') -replace '\\','/') + '"'
$env:NEXT_TELEMETRY_DISABLED='1'
$env:CHECKPOINT_DISABLE='1'
$env:COREPACK_ENABLE_NETWORK='0'
$env:NODE_PATH = (Join-Path (Get-Location) 'node_modules\.pnpm\node_modules')
$env:AI_PROVIDER='mock'
$env:PRISMA_QUERY_ENGINE_LIBRARY=(Resolve-Path 'node_modules/.pnpm/@prisma+engines@5.22.0/node_modules/@prisma/engines/query_engine-windows.dll.node').Path
$env:PRISMA_SCHEMA_ENGINE_BINARY=(Resolve-Path 'node_modules/.pnpm/@prisma+engines@5.22.0/node_modules/@prisma/engines/schema-engine-windows.exe').Path
if ($Task -in @('build','prisma','generate','types')) {
  $env:DATABASE_URL='postgresql://offline:offline@127.0.0.1:1/offline_validation'
  $env:DIRECT_URL=$env:DATABASE_URL
}
if ($Task -eq 'preview-build') {
  # Offline fixture only. Never load the staged runtime credential or contact Supabase.
  Remove-Item Env:AI_PROVIDER
  $env:VERCEL_ENV='preview'
  $env:NEXT_PUBLIC_VERCEL_ENV='preview'
  $env:VERCEL_PROJECT_ID='prj_sicQocH4juE1Nr5gGpSA61mThxBT'
  $env:PREVIEW_APPROVED_VERCEL_PROJECT_ID=$env:VERCEL_PROJECT_ID
  $env:VERCEL_GIT_COMMIT_REF='codex/isolated-recycler-preview-20261104'
  $env:PREVIEW_APPROVED_BRANCH=$env:VERCEL_GIT_COMMIT_REF
  $env:VERCEL_GIT_COMMIT_SHA=(& git rev-parse HEAD)
  $env:PREVIEW_APPROVED_SUPABASE_PROJECT_REF='txfxfrlhtvzwgluhnbpw'
  $env:NEXT_PUBLIC_PREVIEW_SUPABASE_PROJECT_REF=$env:PREVIEW_APPROVED_SUPABASE_PROJECT_REF
  $env:NEXT_PUBLIC_PREVIEW_SUPABASE_URL='https://txfxfrlhtvzwgluhnbpw.supabase.co'
  $env:NEXT_PUBLIC_PREVIEW_SUPABASE_PUBLISHABLE_KEY='SYNTHETIC_NOT_A_KEY'
  $env:PREVIEW_APPROVED_DATABASE_ROLE='recycler_preview_app'
  $env:PREVIEW_APPROVED_DATABASE_ENDPOINT='aws-1-us-west-2.pooler.supabase.com:5432'
  $env:PREVIEW_DATABASE_URL='postgresql://recycler_preview_app.txfxfrlhtvzwgluhnbpw:SYNTHETIC_NOT_A_CREDENTIAL@aws-1-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require&sslaccept=strict'
}
$log=Join-Path $PSScriptRoot ($Task + '.log')
switch ($Task) {
  'runtime-login' { & node node_modules/vitest/vitest.mjs run src/server/preview-runtime-acceptance-runner.test.ts src/server/preview-runtime-activation.test.ts src/server/preview-runtime-login-verification.test.ts src/server/preview-runtime-access.test.ts src/server/preview-runtime-provisioning.test.ts src/server/preview-profile-binding-runner.test.ts src/server/preview-psql-tls-session.test.ts src/server/preview-cloud-runner.test.ts src/server/preview-tls.test.ts src/server/preview-identity.test.ts src/server/preview-setup.test.ts src/lib/preview-runtime-tls.test.ts src/lib/preview-isolation.test.ts src/lib/auth/profile-binding.test.ts --maxWorkers=4 --minWorkers=1 *> $log }
  'profile-binding' { & node node_modules/vitest/vitest.mjs run src/server/preview-profile-binding-runner.test.ts src/server/preview-runtime-provisioning.test.ts src/server/preview-runtime-access.test.ts src/server/preview-psql-tls-session.test.ts src/server/preview-cloud-runner.test.ts src/server/preview-tls.test.ts src/server/preview-identity.test.ts src/server/preview-setup.test.ts src/lib/auth/profile-binding.test.ts --maxWorkers=4 --minWorkers=1 *> $log }
  'auth-preview' { & node node_modules/vitest/vitest.mjs run src/lib/auth src/lib/supabase src/app/auth src/app/login src/components/app-shell.test.tsx --maxWorkers=4 --minWorkers=1 *> $log }

  'role-runner' { & node node_modules/vitest/vitest.mjs run src/server/preview-psql-tls-session.test.ts src/server/preview-runtime-provisioning.test.ts src/server/preview-runtime-access.test.ts src/server/preview-runtime-role.test.ts src/server/preview-cloud-runner.test.ts src/server/preview-tls.test.ts src/server/preview-identity.test.ts src/server/preview-setup.test.ts src/lib/preview-runtime-tls.test.ts --maxWorkers=4 --minWorkers=1 *> $log }
  'runtime-role' { & node node_modules/vitest/vitest.mjs run src/server/preview-runtime-access.test.ts src/server/preview-runtime-role.test.ts src/server/preview-tls.test.ts src/server/preview-identity.test.ts src/server/preview-setup.test.ts src/lib/preview-runtime-tls.test.ts --maxWorkers=4 --minWorkers=1 *> $log }
  'focused' { & node node_modules/vitest/vitest.mjs run src/features/prospect-recycler src/server/prospect-recycler src/server/integrations src/server/agent-workforce/daily --maxWorkers=4 --minWorkers=1 *> $log }
  'drafting' { & node node_modules/vitest/vitest.mjs run src/server/prospect-recycler/preparation.test.ts src/server/agent-workforce/signal-opportunity/drafting.test.ts --maxWorkers=1 --minWorkers=1 *> $log }
  'browser' {
    $env:OUTREACH_TEST_CHROME='C:\Program Files\Google\Chrome\Application\chrome.exe'
    if (!(Test-Path -LiteralPath $env:OUTREACH_TEST_CHROME)) { throw 'Local Chrome is unavailable' }
    & node node_modules/vitest/vitest.mjs run src/server/integrations/outreach-oauth-http.test.ts --maxWorkers=1 --minWorkers=1 *> $log
  }
  'serial' { & node node_modules/vitest/vitest.mjs run --maxWorkers=1 --minWorkers=1 *> $log }
  'parallel' { & node node_modules/vitest/vitest.mjs run --maxWorkers=4 --minWorkers=1 *> $log }
  'security' { & node node_modules/vitest/vitest.mjs run src/lib/auth src/lib/supabase src/lib/preview-policy.test.ts src/lib/preview-isolation.test.ts src/server/preview-boundaries.test.ts src/test/publication-secret-patterns.test.ts --maxWorkers=4 --minWorkers=1 *> $log }
  'acceptance' { & node node_modules/vitest/vitest.mjs run src/features/prospect-recycler/review-client.test.tsx src/components/app-shell.test.tsx src/lib/navigation.test.ts src/lib/auth src/lib/supabase src/lib/preview-policy.test.ts src/lib/preview-isolation.test.ts src/server/preview-boundaries.test.ts src/test/publication-secret-patterns.test.ts --maxWorkers=4 --minWorkers=1 *> $log }
  'acceptance-browser' { & node validation/recycler-browser.mjs *> $log }
  'types' { & node node_modules/typescript/bin/tsc --noEmit --incremental false *> $log }
  'lint' { & node node_modules/eslint/bin/eslint.js . *> $log }
  'build' { & node node_modules/next/dist/bin/next build *> $log }
  'preview-build' { & node node_modules/next/dist/bin/next build *> $log }
  'prisma' { & node node_modules/prisma/build/index.js validate *> $log }
  'generate' { & node node_modules/prisma/build/index.js generate *> $log }
  'secrets' { & node scripts/security/publication-scan.mjs HEAD *> $log }
  default { throw 'Unknown validation task' }
}
$result=$LASTEXITCODE
Get-Content -LiteralPath $log -Tail 22
Write-Output "VALIDATION $Task EXIT $result"
exit $result
