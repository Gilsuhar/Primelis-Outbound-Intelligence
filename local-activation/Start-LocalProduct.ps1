#requires -Version 7.0
[CmdletBinding()]
param([string]$RepositoryRoot=(Split-Path $PSScriptRoot -Parent),[switch]$CompanyResearch,[switch]$PreflightOnly,[switch]$ConfirmRestart,[switch]$SavedLocalConfiguration,[switch]$OutreachOAuth)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'LocalProduct-Tools.ps1')
. (Join-Path $PSScriptRoot 'LocalHubSpot-Tools.ps1')
# Only process-local changes. No .env files or user/machine settings are changed.
$names=@()
Get-Content (Join-Path $RepositoryRoot '.env.example') | ForEach-Object {
 if($_ -match '^([A-Za-z_][A-Za-z0-9_]*)='){$names+=$Matches[1]}
}
$names+=@('VERCEL_ENV','NEXT_PUBLIC_VERCEL_ENV','VERCEL','VERCEL_URL','VERCEL_BRANCH_URL','TEST_DATABASE_URL','DATABASE_URL','DIRECT_URL','NEXT_PUBLIC_APP_URL','LOCAL_DEV_LOGIN','LOCAL_DEV_SESSION_TOKEN')
# Company-only AI settings remain process-local and are never copied into global provider settings.
# Only a literal true opt-in preserves them; the service validates every limit and price again.
$companyNames=@('LOCAL_COMPANY_AI_ENABLED','LOCAL_COMPANY_DAILY_BUDGET_USD','LOCAL_COMPANY_MONTHLY_BUDGET_USD','LOCAL_COMPANY_MAX_CONCURRENT_CALLS','LOCAL_COMPANY_MAX_RETRIES','LOCAL_COMPANY_OPENAI_MODEL','LOCAL_COMPANY_OPENAI_API_KEY','LOCAL_COMPANY_INPUT_USD_PER_MILLION','LOCAL_COMPANY_OUTPUT_USD_PER_MILLION','LOCAL_COMPANY_WEB_SEARCH_REQUEST_USD')
$companyOptIn=$env:LOCAL_COMPANY_AI_ENABLED -ceq 'true'
if(-not $companyOptIn -or $CompanyResearch){$names+=$companyNames}
$names+='LOCAL_PRODUCT_DATABASE_URL'
$names+='LOCAL_INTERNAL_SALES_ENABLED'
$names+=@('LOCAL_DEV_HTTPS','LOCAL_OUTREACH_OAUTH_ENABLED')
$names+=@('PATH','COREPACK_ENABLE_NETWORK')
if($CompanyResearch){$names=@($names | Where-Object {$_ -ne 'LOCAL_COMPANY_OPENAI_API_KEY'})}
$old=@{};foreach($name in ($names|Select-Object -Unique)){$old[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try {
 $tlsDirectory=$null
 if($OutreachOAuth -and (-not $CompanyResearch -or -not $SavedLocalConfiguration -or $PreflightOnly)){throw 'OutreachOAuth requires the existing saved CompanyResearch setup.'}
 if($SavedLocalConfiguration -and (-not $CompanyResearch -or $PreflightOnly)){throw 'SavedLocalConfiguration requires CompanyResearch and an approved local setup.'}
 $savedLocal=$null
 $savedHubSpot=$null
 if($SavedLocalConfiguration){
  $savedLocal=Read-SavedLocalSalesConfiguration
  $env:LOCAL_PRODUCT_DATABASE_URL=$savedLocal.databaseUrl
  $savedHubSpot=Read-SavedLocalHubSpotConfiguration
  if($savedHubSpot){$null=Confirm-LocalHubSpotToken $savedHubSpot.token}
 }
 if($PreflightOnly -and -not $CompanyResearch){throw 'PreflightOnly requires CompanyResearch mode.'}
 if($ConfirmRestart -and -not $CompanyResearch){throw 'ConfirmRestart applies only to explicit CompanyResearch mode.'}
 $tools=Resolve-LocalProductTools
 $env:PATH=$tools.ProcessPath;$env:COREPACK_ENABLE_NETWORK='0'
 $nodeVersion=& $tools.NodePath --version
 if($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v24\.'){throw 'The existing project requires Node 24; no software was installed.'}
 $pnpmVersion=& $tools.PnpmPath --version
 if($LASTEXITCODE -ne 0 -or $pnpmVersion.Trim() -cne '9.12.0'){throw 'Installed/cached pnpm 9.12.0 is required; network downloads are disabled.'}
 if($CompanyResearch -and -not $PreflightOnly -and -not $SavedLocalConfiguration){Assert-LocalCredentialConsole}
 if($CompanyResearch -and -not $PreflightOnly -and [string]::IsNullOrWhiteSpace($env:LOCAL_PRODUCT_DATABASE_URL)){
  $privateDb=Read-Host 'Existing local PostgreSQL URL (masked; test database only)' -AsSecureString
  try{$env:LOCAL_PRODUCT_DATABASE_URL=[System.Net.NetworkCredential]::new('',$privateDb).Password}finally{$privateDb.Dispose();$privateDb=$null}
 }
 if([string]::IsNullOrWhiteSpace($env:LOCAL_PRODUCT_DATABASE_URL)){throw 'Set process-only LOCAL_PRODUCT_DATABASE_URL securely; do not paste credentials in chat.'}
 try{$db=[uri]$env:LOCAL_PRODUCT_DATABASE_URL}catch{throw 'Invalid local database URL; details withheld.'}
 if($db.Scheme -notin @('postgres','postgresql') -or $db.Host -notin @('localhost','127.0.0.1') -or $db.Port -ne 5432 -or $db.AbsolutePath -cne '/agent_workforce_test' -or $db.Query -or $db.Fragment){throw 'Only local PostgreSQL port 5432, database agent_workforce_test, with no URL query overrides is permitted.'}
 $localDatabase=$env:LOCAL_PRODUCT_DATABASE_URL
 foreach($name in $old.Keys){[Environment]::SetEnvironmentVariable($name,'','Process')}
 $env:LOCAL_PRODUCT_DATABASE_URL=$localDatabase;$localDatabase=$null
 $env:PATH=$tools.ProcessPath;$env:COREPACK_ENABLE_NETWORK='0'
 # Empty process entries must remain present so Next cannot load remote values from .env files.
 $env:DATABASE_URL=$env:LOCAL_PRODUCT_DATABASE_URL;$env:DIRECT_URL=$env:LOCAL_PRODUCT_DATABASE_URL
 $env:NEXT_PUBLIC_APP_URL='http://127.0.0.1:3000'
 if($OutreachOAuth){
  $env:LOCAL_DEV_HTTPS='true';$env:LOCAL_OUTREACH_OAUTH_ENABLED='true'
  $env:NEXT_PUBLIC_APP_URL='https://127.0.0.1:3000'
  $tlsDirectory=Open-LocalOutreachTls
 }
 $env:WORKFORCE_DAILY_ENABLED='false'
 $env:LOCAL_INTERNAL_SALES_ENABLED='false'
 $env:LOCAL_DEV_LOGIN='true'
 $env:INTEGRATION_OPERATOR_USER_ID='local-development-agent-workforce'
 if($savedHubSpot){
  $env:HUBSPOT_PRIVATE_APP_TOKEN=$savedHubSpot.token
  $env:HUBSPOT_PORTAL_ID=$savedHubSpot.hubId
  $savedHubSpot.token=$null;$savedHubSpot=$null
  Write-Host 'Saved HubSpot read-only configuration loaded for owner-scoped evidence intake. Integration sync remains blocked.'
 }
 $tokenBytes=[byte[]]::new(32);[Security.Cryptography.RandomNumberGenerator]::Fill($tokenBytes)
 $env:LOCAL_DEV_SESSION_TOKEN=[Convert]::ToBase64String($tokenBytes)
 if($CompanyResearch){
  $env:LOCAL_COMPANY_OPENAI_API_KEY=''
  # Explicit command-line opt-in selects the approved test profile, never global AI defaults.
  $env:LOCAL_COMPANY_AI_ENABLED='false'
  $env:LOCAL_COMPANY_DAILY_BUDGET_USD='1';$env:LOCAL_COMPANY_MONTHLY_BUDGET_USD='5'
  $env:LOCAL_COMPANY_MAX_CONCURRENT_CALLS='1';$env:LOCAL_COMPANY_MAX_RETRIES='0'
  $env:LOCAL_COMPANY_OPENAI_MODEL='gpt-5.4-mini-2026-03-17'
  $env:LOCAL_COMPANY_INPUT_USD_PER_MILLION='0.75';$env:LOCAL_COMPANY_OUTPUT_USD_PER_MILLION='4.50'
  $env:LOCAL_COMPANY_WEB_SEARCH_REQUEST_USD='0.01'
 }
 if($PreflightOnly){Write-Host 'Read-only preflight only; the running server and API credentials will not be used.'}
 else{Write-Host "Local development login enabled; open $($env:NEXT_PUBLIC_APP_URL)/local-login. Integration sync, daily jobs and worker endpoints remain disabled."}
 # Production/Preview files might otherwise supply integration credentials. Fail rather than edit them.
 foreach($f in @('.env','.env.local','.env.development','.env.development.local')){
  if(Test-Path (Join-Path $RepositoryRoot $f)){throw 'Existing Next environment file detected. Use a separate local checkout without environment files; originals were not changed.'}
 }
 Push-Location $RepositoryRoot
 try{
  & git merge-base --is-ancestor b1a9144a75d94a888526031469d14a4300b983b5 HEAD
  if($LASTEXITCODE -ne 0){throw 'Pinned source ancestry missing; no checkout/reset was performed.'}
  Write-Host 'Node 24 and pnpm 9.12.0 resolved locally; package downloads are disabled.'
  if(-not (Test-Path 'node_modules/.bin/next')){throw 'Install dependencies first with pnpm install --frozen-lockfile; do not run migrations or seed.'}
  if($CompanyResearch){
   & $tools.NodePath scripts/company-research-preflight.mjs
   if($LASTEXITCODE -ne 0){throw 'Local preflight failed; credentials and provider calls were not attempted.'}
   if($PreflightOnly){Write-Host 'Read-only profile/database checks passed. API credentials and running-server AI readiness remain unverified.';return}
   Invoke-ConfirmedLocalNextRestart -RepositoryRoot $RepositoryRoot -ConfirmRestart:$ConfirmRestart
   if($SavedLocalConfiguration){
    $env:LOCAL_COMPANY_OPENAI_API_KEY=$savedLocal.apiKey
    $env:LOCAL_INTERNAL_SALES_ENABLED='true'
    $savedLocal.apiKey=$null;$savedLocal.databaseUrl=$null;$savedLocal=$null
   } else {
    $privateKey=Read-Host 'OpenAI API key (masked; process memory only)' -AsSecureString
    try{$env:LOCAL_COMPANY_OPENAI_API_KEY=[System.Net.NetworkCredential]::new('',$privateKey).Password}finally{$privateKey.Dispose();$privateKey=$null}
   }
   if([string]::IsNullOrWhiteSpace($env:LOCAL_COMPANY_OPENAI_API_KEY)){throw 'API key was empty; no server was started.'}
   $env:LOCAL_COMPANY_AI_ENABLED='true'
   Write-Host "Local AI profile prepared. No research starts automatically. Open $($env:NEXT_PUBLIC_APP_URL)/sales-agent/company-research after signing in. All company drafts remain internal; sending and enrollment are disabled."
  }
  if($OutreachOAuth){
   Write-Host 'Local HTTPS enabled. Sign in at https://127.0.0.1:3000/local-login, then open https://127.0.0.1:3000/api/outreach/oauth. No authorization starts automatically.'
   & $tools.PnpmPath dev --hostname 127.0.0.1 --port 3000 --experimental-https --experimental-https-key (Join-Path $tlsDirectory 'key.pem') --experimental-https-cert (Join-Path $tlsDirectory 'cert.pem')
  } else {
   & $tools.PnpmPath dev --hostname 127.0.0.1 --port 3000
  }
  if($LASTEXITCODE -ne 0){throw 'Development server exited with an error; inspect logs privately.'}
 }finally{Pop-Location}
}finally{
 if($tlsDirectory){Close-LocalOutreachTls -Directory $tlsDirectory}
 $savedLocal=$null
 $savedHubSpot=$null
 foreach($name in $old.Keys){[Environment]::SetEnvironmentVariable($name,$old[$name],'Process')}
 if($CompanyResearch){$env:LOCAL_COMPANY_AI_ENABLED='false';Remove-Item Env:LOCAL_COMPANY_OPENAI_API_KEY -ErrorAction SilentlyContinue}
}
