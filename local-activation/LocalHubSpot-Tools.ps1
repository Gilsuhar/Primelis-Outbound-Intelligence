# CurrentUser DPAPI only. Never emit credentials or provider error bodies.
function Assert-LocalHubSpotInfo($Info) {
 if(-not $Info -or [string]$Info.hubId -cne '144053930' -or $Info.scopes -isnot [array] -or $Info.scopes.Count -gt 32){throw 'HUBSPOT_ACCOUNT_OR_SCOPES_INVALID'}
 foreach($required in @('crm.objects.contacts.read','crm.objects.companies.read')){
  if($required -cnotin $Info.scopes){throw 'HUBSPOT_READ_SCOPE_MISSING'}
 }
 foreach($scope in $Info.scopes){
  if($scope -isnot [string] -or $scope -cnotmatch '^(crm\.(objects|schemas)\.(contacts|companies|deals|emails|owners)\.read|oauth)$'){throw 'HUBSPOT_NON_READ_OR_UNSUPPORTED_SCOPE'}
 }
}
function Assert-LocalHubSpotToken([string]$Token) {
 # Treat provider tokens as opaque; absolute anchors also reject a trailing newline.
 if($Token -cnotmatch '\A[\x21-\x7E]{20,4096}\z'){throw 'HUBSPOT_TOKEN_FORMAT_INVALID'}
}
function New-LocalHubSpotHttpClient {
 $handler=[Net.Http.HttpClientHandler]::new();$handler.AllowAutoRedirect=$false
 $client=[Net.Http.HttpClient]::new($handler);$client.Timeout=[TimeSpan]::FromSeconds(15)
 return $client
}
function Save-LocalHubSpotDiagnostic($Diagnostic) {
 # Accept only a fixed, value-free schema. Never persist exception messages or HTTP bodies.
 if($Diagnostic.stage -cnotin @('INPUT','CLIENT_SETUP','HTTP_REQUEST','HTTP_RESPONSE','RESPONSE_PARSE','ACCOUNT_SCOPE_VALIDATION','COMPLETE') -or
    $Diagnostic.code -cnotin @('HUBSPOT_TOKEN_FORMAT_INVALID','HUBSPOT_TOKEN_UNAUTHORIZED','HUBSPOT_TOKEN_FORBIDDEN','HUBSPOT_API_FAILURE','HUBSPOT_RATE_LIMITED','HUBSPOT_HTTP_FAILURE','HUBSPOT_NETWORK_FAILURE','HUBSPOT_NETWORK_TIMEOUT','HUBSPOT_RESPONSE_INVALID','HUBSPOT_LOCAL_ERROR','HUBSPOT_ACCOUNT_OR_SCOPES_INVALID','HUBSPOT_READ_SCOPE_MISSING','HUBSPOT_NON_READ_OR_UNSUPPORTED_SCOPE','HUBSPOT_VERIFIED') -or
    ($null -ne $Diagnostic.httpStatus -and ($Diagnostic.httpStatus -isnot [int] -or $Diagnostic.httpStatus -lt 100 -or $Diagnostic.httpStatus -gt 599))){throw 'HUBSPOT_DIAGNOSTIC_INVALID'}
 $file=Join-Path (Split-Path (Get-LocalHubSpotPath) -Parent) 'hubspot-verification.json'
 if((Test-Path -LiteralPath $file) -and ((Get-Item -LiteralPath $file).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'HUBSPOT_DIAGNOSTIC_UNAVAILABLE'}
 $safe=[ordered]@{version=1;at=[DateTime]::UtcNow.ToString('o');stage=$Diagnostic.stage;code=$Diagnostic.code;httpStatus=$Diagnostic.httpStatus}
 [IO.File]::WriteAllText($file,($safe|ConvertTo-Json -Compress))
}
function Confirm-LocalHubSpotToken([string]$Token) {
 $stage='INPUT';$status=$null;$client=$null;$body=$null;$response=$null;$info=$null
 try {
  Assert-LocalHubSpotToken $Token
  $stage='CLIENT_SETUP';$client=New-LocalHubSpotHttpClient
  # Dedicated, non-redirecting HTTPS client: token stays in the header/body, never URL/argv.
  $client.DefaultRequestHeaders.Authorization=[Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer',$Token)
  $body=[Net.Http.StringContent]::new((@{tokenKey=$Token}|ConvertTo-Json -Compress),[Text.Encoding]::UTF8,'application/json')
  $stage='HTTP_REQUEST'
  $response=$client.PostAsync('https://api.hubapi.com/oauth/v2/private-apps/get/access-token-info',$body).GetAwaiter().GetResult()
  $stage='HTTP_RESPONSE';$status=[int]$response.StatusCode
  if(-not $response.IsSuccessStatusCode){throw 'HTTP_REJECTED'}
  # Do not leak .NET VoidTaskResult into the verified-metadata return pipeline.
  [void]$response.Content.LoadIntoBufferAsync(65536).GetAwaiter().GetResult()
  $stage='RESPONSE_PARSE'
  $info=$response.Content.ReadAsStringAsync().GetAwaiter().GetResult()|ConvertFrom-Json
  $stage='ACCOUNT_SCOPE_VALIDATION'
  Assert-LocalHubSpotInfo $info
  Save-LocalHubSpotDiagnostic @{stage='COMPLETE';code='HUBSPOT_VERIFIED';httpStatus=$status}
  return [pscustomobject]@{hubId='144053930';scopes=@($info.scopes)}
 } catch {
  $code='HUBSPOT_LOCAL_ERROR'
  if($status -eq 401){$code='HUBSPOT_TOKEN_UNAUTHORIZED'}
  elseif($status -eq 403){$code='HUBSPOT_TOKEN_FORBIDDEN'}
  elseif($status -eq 429){$code='HUBSPOT_RATE_LIMITED'}
  elseif($status -ge 500){$code='HUBSPOT_API_FAILURE'}
  elseif($stage -ceq 'HTTP_RESPONSE' -and $status -ge 300){$code='HUBSPOT_HTTP_FAILURE'}
  elseif($_.Exception.Message -cin @('HUBSPOT_TOKEN_FORMAT_INVALID','HUBSPOT_ACCOUNT_OR_SCOPES_INVALID','HUBSPOT_READ_SCOPE_MISSING','HUBSPOT_NON_READ_OR_UNSUPPORTED_SCOPE')){$code=$_.Exception.Message}
  elseif($stage -ceq 'RESPONSE_PARSE'){$code='HUBSPOT_RESPONSE_INVALID'}
  # PowerShell wraps .NET failures. Inspect types only, never their potentially sensitive messages.
  $failure=$_.Exception
  for($depth=0;$null -ne $failure -and $depth -lt 10;$depth++){
   if($failure -is [OperationCanceledException]){$code='HUBSPOT_NETWORK_TIMEOUT';break}
   if($failure -is [Net.Http.HttpRequestException] -or $failure -is [Security.Authentication.AuthenticationException]){$code='HUBSPOT_NETWORK_FAILURE';break}
   $failure=$failure.InnerException
  }
  $diagnostic=@{stage=$stage;code=$code;httpStatus=$status}
  $recorded=$true
  try{Save-LocalHubSpotDiagnostic $diagnostic}catch{$recorded=$false}
  $safeError=[InvalidOperationException]::new($code)
  $safeError.Data['stage']=$stage;$safeError.Data['httpStatus']=$status;$safeError.Data['diagnosticSaved']=$recorded
  throw $safeError
 } finally {if($response){$response.Dispose()};if($body){$body.Dispose()};if($client){$client.Dispose()};$Token=$null;$info=$null}
}
function Get-LocalHubSpotPath {
 $dir=Join-Path $env:LOCALAPPDATA 'PrimelisSignal'
 if(-not(Test-Path -LiteralPath $dir -PathType Container) -or ((Get-Item -LiteralPath $dir).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'HUBSPOT_LOCAL_DIRECTORY_INVALID'}
 $file=Join-Path $dir 'hubspot-readonly.dpapi'
 if(Test-Path -LiteralPath $file){
  $item=Get-Item -LiteralPath $file
  if($item.PSIsContainer -or $item.Length -gt 16384 -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'HUBSPOT_SAVED_CONFIG_INVALID'}
 }
 return $file
}
function Read-SavedLocalHubSpotConfiguration {
 $plain=$null
 try {
  $file=Get-LocalHubSpotPath
  if(-not(Test-Path -LiteralPath $file -PathType Leaf)){return $null}
  Add-Type -AssemblyName System.Security
  $plain=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($file),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $saved=[Text.Encoding]::UTF8.GetString($plain)|ConvertFrom-Json
  if($saved.version -ne 1 -or $saved.ownerId -cne '1087915602' -or $saved.actor -cne 'local-development-agent-workforce'){throw 'Invalid'}
  Assert-LocalHubSpotInfo $saved
  Assert-LocalHubSpotToken $saved.token
  return $saved
 } catch {throw 'HUBSPOT_SAVED_CONFIG_INVALID'}
 finally {if($plain){[Array]::Clear($plain,0,$plain.Length)}}
}
function Save-LocalHubSpotPersistenceDiagnostic($Diagnostic) {
 # Separate from HTTP verification: only operation names and numeric OS errors, never messages/paths.
 if($Diagnostic.stage -cnotin @('SAVE_VALIDATION','DIRECTORY_VALIDATION','ASSEMBLY_LOAD','SERIALIZATION','DPAPI_ENCRYPTION','FILE_CREATE','FILE_WRITE','FILE_FLUSH_CLOSE','FILE_PERMISSIONS','DIAGNOSTIC_WRITE','SAVE_COMPLETE') -or
    $Diagnostic.code -cnotin @('HUBSPOT_SECURE_SAVE_FAILED','HUBSPOT_EXISTING_CONFIG_PRESERVED','HUBSPOT_SECURE_SAVED') -or
    ($null -ne $Diagnostic.hresult -and $Diagnostic.hresult -isnot [int]) -or
    ($null -ne $Diagnostic.nativeErrorCode -and $Diagnostic.nativeErrorCode -isnot [int])){throw 'HUBSPOT_DIAGNOSTIC_INVALID'}
 $dir=Join-Path $env:LOCALAPPDATA 'PrimelisSignal'
 if(-not(Test-Path -LiteralPath $dir -PathType Container) -or ((Get-Item -LiteralPath $dir).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'HUBSPOT_DIAGNOSTIC_UNAVAILABLE'}
 $file=Join-Path $dir 'hubspot-save.json'
 if((Test-Path -LiteralPath $file) -and ((Get-Item -LiteralPath $file).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'HUBSPOT_DIAGNOSTIC_UNAVAILABLE'}
 $safe=[ordered]@{version=1;at=[DateTime]::UtcNow.ToString('o');stage=$Diagnostic.stage;code=$Diagnostic.code;hresult=$Diagnostic.hresult;nativeErrorCode=$Diagnostic.nativeErrorCode}
 [IO.File]::WriteAllText($file,($safe|ConvertTo-Json -Compress))
}
function Save-LocalHubSpotConfiguration([string]$Token,$Info) {
 $plain=$null;$stream=$null
 $stage='SAVE_VALIDATION'
 try {
  Assert-LocalHubSpotToken $Token;Assert-LocalHubSpotInfo $Info
  $stage='DIRECTORY_VALIDATION'
  $file=Get-LocalHubSpotPath
  if(Test-Path -LiteralPath $file){throw 'HUBSPOT_EXISTING_CONFIG_PRESERVED'}
  $stage='ASSEMBLY_LOAD'
  Add-Type -AssemblyName System.Security
  $stage='SERIALIZATION'
  $plain=[Text.Encoding]::UTF8.GetBytes((@{version=1;actor='local-development-agent-workforce';ownerId='1087915602';hubId='144053930';scopes=@($Info.scopes);token=$Token}|ConvertTo-Json -Compress))
  $stage='DPAPI_ENCRYPTION'
  $encrypted=[Security.Cryptography.ProtectedData]::Protect($plain,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $stage='FILE_CREATE'
  $stream=[IO.File]::Open($file,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  $stage='FILE_WRITE'
  $stream.Write($encrypted,0,$encrypted.Length)
  $stage='FILE_FLUSH_CLOSE'
  $stream.Flush($true);$stream.Dispose();$stream=$null
  $stage='FILE_PERMISSIONS'
  $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl=[Security.AccessControl.FileSecurity]::new();$acl.SetOwner($sid);$acl.SetAccessRuleProtection($true,$false)
  $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','Allow'))
  Set-Acl -LiteralPath $file -AclObject $acl
  $stage='DIAGNOSTIC_WRITE'
  Save-LocalHubSpotPersistenceDiagnostic @{stage='SAVE_COMPLETE';code='HUBSPOT_SECURE_SAVED';hresult=$null;nativeErrorCode=$null}
 } catch {
  $code='HUBSPOT_SECURE_SAVE_FAILED'
  if($_.Exception.Message -ceq 'HUBSPOT_EXISTING_CONFIG_PRESERVED'){$code='HUBSPOT_EXISTING_CONFIG_PRESERVED'}
  $failure=$_.Exception
  for($depth=0;$null -ne $failure.InnerException -and $depth -lt 10;$depth++){$failure=$failure.InnerException}
  $hr=[int]$failure.HResult;$native=$null
  if($failure -is [ComponentModel.Win32Exception]){$native=[int]$failure.NativeErrorCode}
  elseif(($hr -band 0x1FFF0000) -eq 0x00070000){$native=[int]($hr -band 0xFFFF)}
  $recorded=$true
  try{Save-LocalHubSpotPersistenceDiagnostic @{stage=$stage;code=$code;hresult=$hr;nativeErrorCode=$native}}catch{$recorded=$false}
  $safeError=[InvalidOperationException]::new($code)
  $safeError.Data['saveStage']=$stage;$safeError.Data['hresult']=$hr;$safeError.Data['nativeErrorCode']=$native;$safeError.Data['diagnosticSaved']=$recorded
  throw $safeError
 } finally {if($stream){$stream.Dispose()};if($plain){[Array]::Clear($plain,0,$plain.Length)};$Token=$null}
}
