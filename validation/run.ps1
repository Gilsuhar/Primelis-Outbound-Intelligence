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
$log=Join-Path $PSScriptRoot ($Task + '.log')
switch ($Task) {
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
  'prisma' { & node node_modules/prisma/build/index.js validate *> $log }
  'generate' { & node node_modules/prisma/build/index.js generate *> $log }
  'secrets' { & node scripts/security/publication-scan.mjs HEAD *> $log }
  default { throw 'Unknown validation task' }
}
$result=$LASTEXITCODE
Get-Content -LiteralPath $log -Tail 22
Write-Output "VALIDATION $Task EXIT $result"
exit $result
