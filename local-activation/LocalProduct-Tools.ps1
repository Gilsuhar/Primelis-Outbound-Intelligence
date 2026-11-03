# Shared launcher helpers. Saved credentials are read only with explicit launcher opt-in.
function Resolve-LocalProductTools {
 $nodeCandidates=@()
 $found=Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
 if($found){$nodeCandidates+=$found.Source}
 foreach($base in @((Join-Path $env:ProgramFiles 'nodejs'),(Join-Path $env:LOCALAPPDATA 'Programs/nodejs'))){$nodeCandidates+=(Join-Path $base 'node.exe')}
 $downloads=Join-Path $env:USERPROFILE 'Downloads'
 if(Test-Path -LiteralPath $downloads){
  foreach($directory in @(Get-ChildItem -LiteralPath $downloads -Directory -Filter 'node-v24*-win-x64' -ErrorAction SilentlyContinue | Sort-Object Name -Descending)){
   $nodeCandidates+=(Join-Path $directory.FullName 'node.exe')
   $nodeCandidates+=(Join-Path (Join-Path $directory.FullName $directory.Name) 'node.exe')
  }
 }
 $nodePath=$nodeCandidates | Select-Object -Unique | Where-Object {Test-Path -LiteralPath $_ -PathType Leaf} | Select-Object -First 1
 if(-not $nodePath){throw 'Installed Node executable was not found. No software was downloaded or installed.'}
 $nodeDirectory=Split-Path $nodePath -Parent
 $pnpmCandidates=@((Join-Path $nodeDirectory 'pnpm.cmd'),(Join-Path $env:APPDATA 'npm/pnpm.cmd'),(Join-Path $env:LOCALAPPDATA 'pnpm/pnpm.exe'))
 $foundPnpm=Get-Command pnpm.cmd,pnpm.exe,pnpm.ps1 -ErrorAction SilentlyContinue | Select-Object -First 1
 if($foundPnpm){$pnpmCandidates+=$foundPnpm.Source}
 $pnpmPath=$pnpmCandidates | Select-Object -Unique | Where-Object {Test-Path -LiteralPath $_ -PathType Leaf} | Select-Object -First 1
 if(-not $pnpmPath){throw 'Installed pnpm was not found beside Node or in standard user installation paths. No software was downloaded or installed.'}
 return [pscustomobject]@{NodePath=$nodePath;PnpmPath=$pnpmPath;ProcessPath=($nodeDirectory+[IO.Path]::PathSeparator+(Split-Path $pnpmPath -Parent)+[IO.Path]::PathSeparator+$env:PATH)}
}

function Assert-LocalCredentialConsole {
 if([Console]::IsInputRedirected -or $Host.Name -ne 'ConsoleHost'){
  throw 'Masked credential entry requires an interactive local PowerShell terminal. Run this launcher directly there; no credentials were read.'
 }
}

function Assert-VerifiedLocalNextOwner {
 param($Owner,[string]$RepositoryRoot)
 $root=[IO.Path]::GetFullPath($RepositoryRoot).TrimEnd([char[]]'\/')
 $nodeArgument='(?:"[^"\r\n]*node\.exe"|[^\s"]*node\.exe)'
 $scriptPath=[regex]::Escape($root)+'[\\/]node_modules[\\/](?:\.pnpm[\\/][^"\r\n]+?[\\/]node_modules[\\/])?next[\\/]dist[\\/]server[\\/]lib[\\/]start-server\.js'
 $scriptArgument='(?:"'+$scriptPath+'"|'+$scriptPath+')'
 if(-not $Owner -or $Owner.Name -ne 'node.exe' -or -not $Owner.CommandLine -or
    $Owner.CommandLine -notmatch ('^\s*'+$nodeArgument+'\s+'+$scriptArgument+'(?:\s|$)') -or
    -not $Owner.CreationDate -or [int]$Owner.ProcessId -le 0){
  throw 'Port 3000 is not owned by a verified Next server from this checkout. Nothing was stopped.'
 }
}

function Invoke-ConfirmedLocalNextRestart {
 param([string]$RepositoryRoot,[switch]$ConfirmRestart)
 $listeners=@(Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue)
 if(-not $listeners.Count){return}
 if(@($listeners | Where-Object {$_.LocalAddress -ne '127.0.0.1'}).Count){throw 'Port 3000 has a non-approved listener. Nothing was stopped.'}
 $owners=@()
 foreach($ownerId in @($listeners | ForEach-Object OwningProcess | Select-Object -Unique)){
  $owner=Get-CimInstance Win32_Process -Filter "ProcessId=$ownerId"
  Assert-VerifiedLocalNextOwner -Owner $owner -RepositoryRoot $RepositoryRoot
  $owners+=$owner
 }
 if(-not $ConfirmRestart){throw 'Verified local server is running. Restart requires your explicit -ConfirmRestart switch. Nothing was stopped.'}
 # Recheck every owner before terminating any, including PID reuse and command changes.
 foreach($owner in $owners){
  $current=Get-CimInstance Win32_Process -Filter "ProcessId=$($owner.ProcessId)"
  Assert-VerifiedLocalNextOwner -Owner $current -RepositoryRoot $RepositoryRoot
  if($current.CreationDate -ne $owner.CreationDate -or $current.CommandLine -cne $owner.CommandLine){throw 'Server identity changed; nothing was stopped.'}
 }
 $currentListeners=@(Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue)
 foreach($listener in $currentListeners){
  if($listener.LocalAddress -ne '127.0.0.1' -or $listener.OwningProcess -notin @($owners | ForEach-Object ProcessId)){throw 'Port ownership changed; nothing was stopped.'}
 }
 foreach($owner in $owners){Stop-Process -Id $owner.ProcessId -ErrorAction Stop}
 for($attempt=0;$attempt -lt 20;$attempt++){
  if(-not (Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue)){return}
  Start-Sleep -Milliseconds 250
 }
 throw 'Port 3000 remains occupied; no new server will be started.'
}
# Reading is opt-in. Setup/credential persistence requires separate operator approval.
function Read-SavedLocalSalesConfiguration {
 $plaintext=$null
 try {
  $path=Join-Path $env:LOCALAPPDATA 'PrimelisSignal\local-sales.dpapi'
  if(-not (Test-Path -LiteralPath $path -PathType Leaf)){throw 'LOCAL_SALES_SETUP_REQUIRED'}
  $file=Get-Item -LiteralPath $path
  if($file.Length -gt 16384 -or ($file.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'LOCAL_SALES_CONFIG_INVALID'}
  Add-Type -AssemblyName System.Security
  $plaintext=[Security.Cryptography.ProtectedData]::Unprotect(
   [IO.File]::ReadAllBytes($path),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $saved=[Text.Encoding]::UTF8.GetString($plaintext) | ConvertFrom-Json
  if($saved.version -ne 1 -or $saved.internalSalesApproved -isnot [bool] -or $saved.internalSalesApproved -cne $true -or
    $saved.dailyUsd -ne 1 -or $saved.monthlyUsd -ne 5 -or
    $saved.concurrent -ne 1 -or $saved.retries -ne 0 -or
    $saved.apiKey -cnotmatch '^sk-[A-Za-z0-9_-]{20,512}$'){throw 'LOCAL_SALES_CONFIG_INVALID'}
  $db=[uri]$saved.databaseUrl
  if($db.Scheme -notin @('postgres','postgresql') -or $db.Host -notin @('localhost','127.0.0.1') -or
    $db.Port -ne 5432 -or $db.AbsolutePath -cne '/agent_workforce_test' -or $db.Query -or $db.Fragment){
    throw 'LOCAL_SALES_CONFIG_INVALID'
  }
  return $saved
 } catch {
  if($_.Exception.Message -ceq 'LOCAL_SALES_SETUP_REQUIRED'){throw 'LOCAL_SALES_SETUP_REQUIRED'}
  throw 'LOCAL_SALES_CONFIG_INVALID_OR_UNREADABLE'
 } finally { if($plaintext){[Array]::Clear($plaintext,0,$plaintext.Length)} }
}

function Open-LocalOutreachTls {
 $certificate=$null;$directory=$null;$chain=$null
 $root=Join-Path $env:LOCALAPPDATA 'PrimelisSignal'
 $file=Join-Path $root 'outreach-local-tls.dpapi'
 if(-not(Test-Path -LiteralPath $file -PathType Leaf)){throw 'Run the approved one-time Setup-LocalOutreachHttps.ps1 first.'}
 if(((Get-Item -LiteralPath $root).Attributes -band [IO.FileAttributes]::ReparsePoint) -or
    ((Get-Item -LiteralPath $file).Attributes -band [IO.FileAttributes]::ReparsePoint) -or (Get-Item -LiteralPath $file).Length -gt 32768){throw 'Invalid local TLS setup.'}
 Add-Type -AssemblyName System.Security
 $plain=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($file),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
 try {
  $data=[Text.Encoding]::UTF8.GetString($plain)|ConvertFrom-Json
  $certificate=[Security.Cryptography.X509Certificates.X509Certificate2]::CreateFromPem($data.certPem,$data.keyPem)
  if($certificate.NotBefore -gt [DateTime]::Now -or $certificate.NotAfter -lt [DateTime]::Now -or -not $certificate.HasPrivateKey){throw 'Local TLS certificate expired or incomplete.'}
  $chain=[Security.Cryptography.X509Certificates.X509Chain]::new()
  $chain.ChainPolicy.RevocationMode=[Security.Cryptography.X509Certificates.X509RevocationMode]::NoCheck
  $chain.ChainPolicy.DisableCertificateDownloads=$true
  if(-not $chain.Build($certificate)){throw 'Local certificate is not trusted by this Windows account.'}
  $directory=Join-Path $root ('https-runtime-'+[guid]::NewGuid().ToString())
  [void](New-Item -ItemType Directory -Path $directory)
  $acl=[Security.AccessControl.DirectorySecurity]::new()
  $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl.SetOwner($sid);$acl.SetAccessRuleProtection($true,$false)
  $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
  Set-Acl -LiteralPath $directory -AclObject $acl
  [IO.File]::WriteAllText((Join-Path $directory 'key.pem'),$data.keyPem)
  [IO.File]::WriteAllText((Join-Path $directory 'cert.pem'),$data.certPem)
  return $directory
 } catch {
  if($directory){Close-LocalOutreachTls -Directory $directory}
  throw 'Local TLS setup could not be opened; no credential details were returned.'
 } finally {[Array]::Clear($plain,0,$plain.Length);$data=$null;if($certificate){$certificate.Dispose()};if($chain){$chain.Dispose()}}
}
function Close-LocalOutreachTls([string]$Directory) {
 $root=[IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'PrimelisSignal'))
 $target=[IO.Path]::GetFullPath($Directory)
 if([IO.Path]::GetDirectoryName($target) -cne $root -or [IO.Path]::GetFileName($target) -notmatch '^https-runtime-[a-f0-9-]{36}$'){throw 'TLS cleanup target refused.'}
 if((Test-Path -LiteralPath $target) -and -not((Get-Item -LiteralPath $target).Attributes -band [IO.FileAttributes]::ReparsePoint)){
  Remove-Item -LiteralPath $target -Recurse -Force
 }
}
