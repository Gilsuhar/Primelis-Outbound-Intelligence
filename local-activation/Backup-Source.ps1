param([string]$RepositoryRoot=(Split-Path $PSScriptRoot -Parent))
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath($RepositoryRoot)
$destination=Join-Path $root ('outputs/source-backups/'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Path $destination -Force | Out-Null
# Restrict the source snapshot to this Windows user and SYSTEM. No credentials are read.
$acl=Get-Acl -LiteralPath $destination
$acl.SetAccessRuleProtection($true,$false)
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
foreach($identity in @($sid,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))){
 $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
}
Set-Acl -LiteralPath $destination -AclObject $acl
$paths=@(& git -C $root ls-files --cached --others --exclude-standard) | Sort-Object -Unique
if($LASTEXITCODE -ne 0){throw 'Git source inventory failed.'}
$manifest=@(); $excluded=@()
$zipPath=Join-Path $destination 'source.zip'
$zip=[IO.Compression.ZipFile]::Open($zipPath,[IO.Compression.ZipArchiveMode]::Create)
try{
 foreach($relative in $paths){
  $reason=$null
  if($relative -match '(^|/)(\.env[^/]*|\.git|\.vercel|node_modules|outputs|coverage|dist|\.next|\.aws|\.codex|\.agents)(/|$)' -or
     $relative -match '(?i)(credential|secret|\.pem$|\.key$|\.pfx$|\.p12$|\.log$|\.db$|\.sqlite|\.dump$|\.backup$|\.tsbuildinfo$)'){$reason='EXCLUDED_SENSITIVE_OR_GENERATED_PATH'}
  elseif($relative -notmatch '^(src/|scripts/|ci/|local-activation/|docs/|prisma/|public/|data/imports/|[^/]+$)' -or
     $relative -notmatch '\.(ts|tsx|js|mjs|cjs|json|md|html|ps1|sql|prisma|css|svg|yml|yaml|toml)$|(^|/)(\.gitignore|\.prettierignore)$'){$reason='OUTSIDE_SOURCE_TEXT_ALLOWLIST'}
  $path=Join-Path $root $relative
  if(-not (Test-Path -LiteralPath $path -PathType Leaf)){continue}
  if((Get-Item -LiteralPath $path).Attributes -band [IO.FileAttributes]::ReparsePoint){$reason='REPARSE_POINT'}
  if($reason){$excluded+=@{path=$relative;reason=$reason};continue}
  $bytes=[IO.File]::ReadAllBytes($path)
  $content=[Text.Encoding]::UTF8.GetString($bytes)
  # Private key material is omitted. Credential-shaped literals (including fictional
  # test values) are redacted in the snapshot only; working files are untouched.
  $redacted=$false
  if($content -match '-----BEGIN (?:[A-Z ]*PRIVATE KEY|OPENSSH)'){
   $excluded+=@{path=$relative;reason='CREDENTIAL_PATTERN_OMITTED'};continue
  }
  foreach($pattern in @('\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}','\b(?:ghp_|github_pat_|AKIA)[A-Za-z0-9_]{16,}','(?i)(?:postgres(?:ql)?|https?)://[^\s/:]+:[^\s/@]+@')){
   if($content -match $pattern){$redacted=$true;$content=[regex]::Replace($content,$pattern,'REDACTED_CREDENTIAL_LITERAL')}
  }
  if($redacted){$bytes=[Text.Encoding]::UTF8.GetBytes($content)}
  $entry=$zip.CreateEntry($relative,[IO.Compression.CompressionLevel]::Optimal)
  $stream=$entry.Open();try{$stream.Write($bytes,0,$bytes.Length)}finally{$stream.Dispose()}
  $manifest+=@{path=$relative;redacted=$redacted;bytes=$bytes.Length;sha256=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()}
 }
}finally{$zip.Dispose()}
$verify=[IO.Compression.ZipFile]::OpenRead($zipPath)
try{
 if($verify.Entries.Count -ne $manifest.Count){throw 'Backup entry count mismatch.'}
 foreach($file in $manifest){
  $entry=$verify.GetEntry($file.path);$stream=$entry.Open()
  try{$hash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($stream)).ToLowerInvariant()}finally{$stream.Dispose()}
  if($hash -ne $file.sha256 -or $entry.Length -ne $file.bytes){throw 'Backup integrity verification failed.'}
 }
}finally{$verify.Dispose()}
$report=@{version=1;createdAt=[DateTime]::UtcNow.ToString('o');head=(& git -C $root rev-parse HEAD);fileCount=$manifest.Count;verified=$true;archiveSha256=(Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant();files=$manifest;excluded=$excluded;limitations=@('Same-device snapshot is not protection against loss of this computer. Copy to approved encrypted off-device storage.','No environment files, Git internals, database export, dependencies or binary assets. Credential-pattern scanning is not a guarantee against every secret format.','Redacted files preserve source structure but are not byte-identical; restore fictional test literals from reviewed Git history or reconstruct safely. Omitted tracked assets require the Git base.')}
$report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $destination 'verification.json') -Encoding utf8
[pscustomobject]@{directory=$destination;verified=$true;files=$manifest.Count;excluded=$excluded.Count;archiveSha256=$report.archiveSha256} | ConvertTo-Json
