// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

const helper = path.resolve("local-activation/LocalHubSpot-Tools.ps1").replaceAll("'", "''");
const fixtureToken = "fictional-private-token-for-offline-tests-only";
const info =
  "@{hubId='144053930';scopes=@('crm.objects.contacts.read','crm.objects.companies.read')}";
function run(script: string, appData?: string) {
  const result = spawnSync(
    "pwsh",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `$ErrorActionPreference='Stop'; Set-StrictMode -Version Latest; . '${helper}'; ${script}`,
    ],
    {
      encoding: "utf8",
      timeout: 15000,
      env: { ...process.env, ...(appData ? { LOCALAPPDATA: appData } : {}) },
    },
  );
  return { code: result.status, out: result.stdout.trim(), error: result.stderr };
}
it("accepts fictional EU1 private-app tokens without regional restrictions and rejects incomplete or contaminated input", () => {
  const result = run(`
   # Preserve regional prefix coverage with non-UUID, explicitly synthetic suffixes.
   $eu='pat-eu1-SYNTHETIC_NOT_A_CREDENTIAL';
   foreach($v in @($eu, 'pat-na1-SYNTHETIC_NOT_A_CREDENTIAL', ('x'*20), ('x'*4096))){Assert-LocalHubSpotToken $v};
   $invalid=@('', 'pat-eu1-c0', ('x'*19), ('x'*4097), (' '+$eu), ($eu+' '),
    ($eu+[char]10), ($eu+[char]13+[char]10), ($eu+[char]9), ($eu+[char]0),
    ($eu+[char]0xA0), ($eu+[char]0x200B), ($eu+[char]0xFEFF),
    $eu.Replace('-', [string][char]0x2011));
   foreach($v in $invalid){$denied=$false;try{Assert-LocalHubSpotToken $v}catch{
    if($_.Exception.Message -cne 'HUBSPOT_TOKEN_FORMAT_INVALID'){throw 'Unexpected safe code'};$denied=$true
   };if(-not $denied){throw 'Contaminated input accepted'}};
   'PASS'`);
  expect(result).toMatchObject({ code: 0, out: "PASS" });
});
it("accepts the intended portal/read scopes and rejects other accounts, missing, malformed or write scopes", () => {
  const result = run(`Assert-LocalHubSpotInfo ${info};
   $invalid=@(@{hubId='1';scopes=@('crm.objects.contacts.read','crm.objects.companies.read')},
    @{hubId='144053930';scopes=@('crm.objects.contacts.read')},
    @{hubId='144053930';scopes='crm.objects.contacts.read'},
    @{hubId='144053930';scopes=@('crm.objects.contacts.read','crm.objects.companies.read','crm.objects.contacts.write')},
    @{hubId='144053930';scopes=@('crm.objects.contacts.read','crm.objects.companies.read','unknown')});
   foreach($i in $invalid){$denied=$false;try{Assert-LocalHubSpotInfo $i}catch{$denied=$true};if(-not $denied){throw 'Unsafe metadata accepted'}};
   foreach($token in @('', 'with spaces invalid token', "bad\ncontrol-and-long-enough")){$denied=$false;try{Assert-LocalHubSpotToken $token}catch{$denied=$true};if(-not $denied){throw 'Unsafe token accepted'}};
   'PASS'`);
  expect(result).toMatchObject({ code: 0, out: "PASS" });
});
it("round-trips CurrentUser encryption across processes without plaintext persistence or overwrite", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "aw-hubspot-offline-"));
  mkdirSync(path.join(dir, "PrimelisSignal"));
  try {
    expect(
      run(
        `if($null -ne (Read-SavedLocalHubSpotConfiguration)){throw 'Unexpected config'}; Save-LocalHubSpotConfiguration '${fixtureToken}' ${info}; 'SAVED'`,
        dir,
      ),
    ).toMatchObject({ code: 0, out: "SAVED" });
    const file = path.join(dir, "PrimelisSignal", "hubspot-readonly.dpapi");
    const before = readFileSync(file);
    expect(before.includes(Buffer.from(fixtureToken))).toBe(false);
    expect(
      run(
        `$v=Read-SavedLocalHubSpotConfiguration;if($v.token -cne '${fixtureToken}' -or $v.ownerId -cne '1087915602'){throw 'Mismatch'};
      $acl=Get-Acl -LiteralPath (Get-LocalHubSpotPath);if(-not $acl.AreAccessRulesProtected){throw 'Inherited permissions'};
      $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;
      foreach($r in $acl.Access){if($r.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -cne $sid){throw 'Unexpected access'}};
      'RESTORED'`,
        dir,
      ),
    ).toMatchObject({ code: 0, out: "RESTORED" });
    const overwrite = run(
      `try{Save-LocalHubSpotConfiguration '${fixtureToken}' ${info}}catch{[Console]::Write($_.Exception.Message)}`,
      dir,
    );
    expect(overwrite.out).toBe("HUBSPOT_EXISTING_CONFIG_PRESERVED");
    expect(readFileSync(file)).toEqual(before);
    expect(
      run(
        `$f=Get-LocalHubSpotPath;[IO.File]::WriteAllBytes($f,[byte[]](1,2,3));try{$null=Read-SavedLocalHubSpotConfiguration}catch{[Console]::Write($_.Exception.Message)}`,
        dir,
      ).out,
    ).toBe("HUBSPOT_SAVED_CONFIG_INVALID");
  } finally {
    // Only this test-created absolute directory, never the real Windows credential directory.
    if (path.dirname(dir) !== os.tmpdir() || !path.basename(dir).startsWith("aw-hubspot-offline-"))
      throw new Error("Cleanup target denied");
    rmSync(dir, { recursive: true });
  }
}, 20000);
it("keeps private masked setup and loads saved credentials after environment clearing without changing integration guards", () => {
  const setup = readFileSync("local-activation/Setup-LocalHubSpot.ps1", "utf8");
  const launcher = readFileSync("local-activation/Start-LocalProduct.ps1", "utf8");
  expect(setup).toContain("$tokenBox.UseSystemPasswordChar=$true");
  expect(setup).not.toContain("Read-Host");
  expect(setup).toContain("Save stage: $saveStage");
  expect(setup).toContain("Windows HRESULT: 0x{0:X8}");
  expect(setup.indexOf("Confirm-LocalHubSpotToken")).toBeLessThan(
    setup.indexOf("Save-LocalHubSpotConfiguration"),
  );
  expect(launcher.indexOf("$env:HUBSPOT_PRIVATE_APP_TOKEN=$savedHubSpot.token")).toBeGreaterThan(
    launcher.indexOf(
      "foreach($name in $old.Keys){[Environment]::SetEnvironmentVariable($name,'','Process')}",
    ),
  );
  expect(launcher.indexOf("Confirm-LocalHubSpotToken")).toBeLessThan(
    launcher.indexOf("Invoke-ConfirmedLocalNextRestart"),
  );
  expect(readFileSync("src/lib/supabase/middleware.ts", "utf8")).toContain(
    'pathname.startsWith("/api/sales-agent/integrations")',
  );
});

it("preserves numeric save errors by operation without storing sensitive exceptions or touching existing configurations", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "aw-hubspot-offline-"));
  try {
    const result = run(
      `
$root=$env:LOCALAPPDATA
$original=(Get-Command Save-LocalHubSpotConfiguration).ScriptBlock.ToString()
$cases=@(
 @{stage='SAVE_VALIDATION';error="[InvalidOperationException]::new('private-error-${fixtureToken}')";native=$null},
 @{stage='DIRECTORY_VALIDATION';error="[ComponentModel.Win32Exception]::new(5,'private-error-${fixtureToken}')";native=5},
 @{stage='SERIALIZATION';error="[InvalidOperationException]::new('private-error-${fixtureToken}')";native=$null},
 @{stage='DPAPI_ENCRYPTION';error="[Security.Cryptography.CryptographicException]::new(-2146893813)";native=$null},
 @{stage='FILE_CREATE';error="[IO.IOException]::new('private-error-${fixtureToken}',-2147024816)";native=80},
 @{stage='FILE_WRITE';error="[IO.IOException]::new('private-error-${fixtureToken}',-2147024784)";native=112},
 @{stage='FILE_FLUSH_CLOSE';error="[IO.IOException]::new('private-error-${fixtureToken}',-2147024867)";native=29},
 @{stage='FILE_PERMISSIONS';error="[ComponentModel.Win32Exception]::new(5,'private-error-${fixtureToken}')";native=5}
)
foreach($case in $cases){
 $env:LOCALAPPDATA=Join-Path $root $case.stage
 $folder=Join-Path $env:LOCALAPPDATA 'PrimelisSignal'
 [void][IO.Directory]::CreateDirectory($folder)
 $sentinel=Join-Path $folder 'existing-other-config.dpapi'
 [IO.File]::WriteAllBytes($sentinel,[byte[]](1,2,3))
 # Inject one OS-style fault only into this child process's copy of the save function.
 # The real stage handler, encrypted preceding operations and diagnostic persistence execute.
 $needle='$stage='+"'"+$case.stage+"'"
 if($case.stage -ceq 'SAVE_VALIDATION'){$needle='Assert-LocalHubSpotToken $Token;Assert-LocalHubSpotInfo $Info'}
 $patched=$original.Replace($needle,($needle+";throw ("+$case.error+")"))
 if($patched -ceq $original){throw 'Injection not applied'}
 Set-Item Function:Save-LocalHubSpotConfiguration ([scriptblock]::Create($patched))
 $caught=$null
 try{Save-LocalHubSpotConfiguration '${fixtureToken}' ${info}}catch{$caught=$_.Exception}
 if(-not $caught -or $caught.Message -cne 'HUBSPOT_SECURE_SAVE_FAILED' -or $null -ne $caught.InnerException){throw 'Unsafe failure result'}
 $d=Get-Content -Raw -LiteralPath (Join-Path $folder 'hubspot-save.json')|ConvertFrom-Json
 if($d.stage -cne $case.stage -or $caught.Data['saveStage'] -cne $case.stage -or $d.nativeErrorCode -ne $case.native -or $d.hresult -ne $caught.Data['hresult']){throw 'Operation/error code lost'}
 if($d.PSObject.Properties.Name.Count -ne 6 -or ($d|ConvertTo-Json -Compress) -match '${fixtureToken}|private-error|Authorization|[A-Z]:'){throw 'Sensitive diagnostic content'}
 if([Convert]::ToBase64String([IO.File]::ReadAllBytes($sentinel)) -cne 'AQID'){throw 'Existing configuration changed'}
 foreach($file in (Get-ChildItem -LiteralPath $folder -File)){
  if([Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes($file.FullName)).Contains('${fixtureToken}')){throw 'Plaintext persisted'}
 }
}
Set-Item Function:Save-LocalHubSpotConfiguration ([scriptblock]::Create($original))
# A genuine missing-parent filesystem failure must retain Windows path-not-found (3).
$env:LOCALAPPDATA=Join-Path $root 'missing-parent'
[void][IO.Directory]::CreateDirectory((Join-Path $env:LOCALAPPDATA 'PrimelisSignal'))
$originalPath=(Get-Command Get-LocalHubSpotPath).ScriptBlock
function Get-LocalHubSpotPath {return (Join-Path $env:LOCALAPPDATA 'absent/credential.dpapi')}
try{Save-LocalHubSpotConfiguration '${fixtureToken}' ${info};throw 'Expected missing-parent failure'}catch{
 if($_.Exception.Data['saveStage'] -cne 'FILE_CREATE' -or $_.Exception.Data['nativeErrorCode'] -ne 3){throw 'Filesystem failure misclassified'}
}
Set-Item Function:Get-LocalHubSpotPath $originalPath
# A diagnostic filesystem error cannot replace the original safe error or leak raw messages.
function Save-LocalHubSpotPersistenceDiagnostic($Diagnostic){throw 'private-error-${fixtureToken}'}
try{Save-LocalHubSpotConfiguration 'bad' ${info};throw 'Expected validation failure'}catch{
 if($_.Exception.Message -cne 'HUBSPOT_SECURE_SAVE_FAILED' -or $_.Exception.Data['saveStage'] -cne 'SAVE_VALIDATION' -or $_.Exception.Data['diagnosticSaved'] -ne $false){throw 'Original error lost'}
}
'PASS'
`,
      dir,
    );
    expect(result, result.error).toMatchObject({ code: 0, out: "PASS" });
  } finally {
    if (path.dirname(dir) !== os.tmpdir() || !path.basename(dir).startsWith("aw-hubspot-offline-"))
      throw new Error("Cleanup target denied");
    rmSync(dir, { recursive: true });
  }
}, 20000);

it("sends the same private token in Bearer and JSON only and retains safe failure diagnostics without retrying", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "aw-hubspot-offline-"));
  mkdirSync(path.join(dir, "PrimelisSignal"));
  try {
    // In-memory HttpMessageHandler: the actual verifier runs, but no socket/provider is used.
    const result = run(
      `
Add-Type -TypeDefinition @'
using System;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
public class HubSpotOfflineHandler : HttpMessageHandler {
 public static string Mode;
 public static int Calls;
 protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancel) {
  Calls++;
  if(request.Method != HttpMethod.Post || request.RequestUri.AbsoluteUri != "https://api.hubapi.com/oauth/v2/private-apps/get/access-token-info")
   throw new InvalidOperationException("Unexpected request");
  if(request.Headers.Authorization == null || request.Headers.Authorization.Scheme != "Bearer" || request.Headers.Authorization.Parameter != "${fixtureToken}")
   throw new InvalidOperationException("Unexpected authentication structure");
  string requestBody=request.Content.ReadAsStringAsync().GetAwaiter().GetResult();
  if(request.Content.Headers.ContentType.MediaType != "application/json" || requestBody != @"{""tokenKey"":""${fixtureToken}""}")
   throw new InvalidOperationException("Unexpected request body");
  // Deliberately echo the actual fictional header/body into fake failures to test redaction.
  string unsafeText=request.Headers.ToString()+requestBody+"; response-secret-marker";
  if(Mode=="network") return Task.FromException<HttpResponseMessage>(new HttpRequestException(unsafeText));
  if(Mode=="timeout") return Task.FromException<HttpResponseMessage>(new TaskCanceledException(unsafeText));
  if(Mode=="local-request") return Task.FromException<HttpResponseMessage>(new InvalidOperationException(unsafeText));
  int code;
  if(Int32.TryParse(Mode,out code)) return Task.FromResult(new HttpResponseMessage((HttpStatusCode)code){Content=new StringContent(unsafeText)});
  string json="{\\"hubId\\":144053930,\\"scopes\\":[\\"crm.objects.contacts.read\\",\\"crm.objects.companies.read\\"]}";
  if(Mode=="wrong-portal") json=json.Replace("144053930","1");
  if(Mode=="missing-scope") json=json.Replace("crm.objects.companies.read","crm.objects.deals.read");
  if(Mode=="write-scope") json=json.Replace("crm.objects.companies.read\\"]","crm.objects.companies.read\\",\\"crm.objects.contacts.write\\"]");
  if(Mode=="malformed") json=unsafeText;
  if(Mode=="missing-fields") json="{}";
  return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK){Content=new StringContent(json)});
 }
}
'@
function New-LocalHubSpotHttpClient {
 if([HubSpotOfflineHandler]::Mode -ceq 'local-setup'){throw 'Authorization: Bearer ${fixtureToken}'}
 return [Net.Http.HttpClient]::new([HubSpotOfflineHandler]::new())
}
$results=@()
foreach($mode in @('401','403','404','429','503','302','network','timeout','local-request','local-setup','malformed','missing-fields','wrong-portal','missing-scope','write-scope','invalid-token','success')){
 [HubSpotOfflineHandler]::Mode=$mode;[HubSpotOfflineHandler]::Calls=0
 $token='${fixtureToken}';if($mode -ceq 'invalid-token'){$token='bad'}
 $caught=$null;$safeInfo=$null
 try{$safeInfo=Confirm-LocalHubSpotToken $token}catch{$caught=$_.Exception}
 $d=Get-Content -Raw -LiteralPath (Join-Path $env:LOCALAPPDATA 'PrimelisSignal/hubspot-verification.json')|ConvertFrom-Json
 if($caught -and ($caught.Message -cne $d.code -or $caught.Data['stage'] -cne $d.stage -or $caught.Data['httpStatus'] -ne $d.httpStatus -or $caught.Data['diagnosticSaved'] -ne $true)){throw 'UI diagnostic mismatch'}
 if($caught -and $null -ne $caught.InnerException){throw 'Raw exception retained'}
 if(($d|ConvertTo-Json -Compress) -match '${fixtureToken}|Authorization|response-secret-marker'){throw 'Secret leaked'}
 if($d.PSObject.Properties.Name.Count -ne 5){throw 'Extra diagnostic fields'}
 if($mode -ceq 'success'){
  if($safeInfo -is [array] -or $safeInfo.hubId -cne '144053930' -or $safeInfo.scopes.Count -ne 2){throw 'Verified metadata handoff is not one object'}
  Save-LocalHubSpotConfiguration -Token $token -Info $safeInfo
  $restored=Read-SavedLocalHubSpotConfiguration
  if($restored.token -cne $token -or $restored.hubId -cne '144053930'){throw 'Verified metadata save/reload mismatch'}
  $restored.token=$null;$restored=$null
 }
 $results+=@{mode=$mode;stage=$d.stage;code=$d.code;httpStatus=$d.httpStatus;calls=[HubSpotOfflineHandler]::Calls;success=($null -ne $safeInfo)}
}
# A failed diagnostic write must preserve the original HTTP error in the safe exception.
function Save-LocalHubSpotDiagnostic($Diagnostic){throw 'private-file-failure-${fixtureToken}'}
[HubSpotOfflineHandler]::Mode='401';[HubSpotOfflineHandler]::Calls=0
try{$null=Confirm-LocalHubSpotToken '${fixtureToken}';throw 'Expected failure'}catch{
 if($_.Exception.Message -cne 'HUBSPOT_TOKEN_UNAUTHORIZED' -or $_.Exception.Data['httpStatus'] -ne 401 -or $_.Exception.Data['diagnosticSaved'] -ne $false){throw 'Primary failure lost'}
}
$results|ConvertTo-Json -Compress
`,
      dir,
    );
    expect(result.code, result.error).toBe(0);
    const rows = JSON.parse(result.out) as Array<Record<string, unknown>>;
    const expected: Record<string, [string, string, number | null]> = {
      "401": ["HTTP_RESPONSE", "HUBSPOT_TOKEN_UNAUTHORIZED", 401],
      "403": ["HTTP_RESPONSE", "HUBSPOT_TOKEN_FORBIDDEN", 403],
      "404": ["HTTP_RESPONSE", "HUBSPOT_HTTP_FAILURE", 404],
      "429": ["HTTP_RESPONSE", "HUBSPOT_RATE_LIMITED", 429],
      "503": ["HTTP_RESPONSE", "HUBSPOT_API_FAILURE", 503],
      "302": ["HTTP_RESPONSE", "HUBSPOT_HTTP_FAILURE", 302],
      network: ["HTTP_REQUEST", "HUBSPOT_NETWORK_FAILURE", null],
      timeout: ["HTTP_REQUEST", "HUBSPOT_NETWORK_TIMEOUT", null],
      "local-request": ["HTTP_REQUEST", "HUBSPOT_LOCAL_ERROR", null],
      "local-setup": ["CLIENT_SETUP", "HUBSPOT_LOCAL_ERROR", null],
      malformed: ["RESPONSE_PARSE", "HUBSPOT_RESPONSE_INVALID", 200],
      "missing-fields": ["ACCOUNT_SCOPE_VALIDATION", "HUBSPOT_LOCAL_ERROR", 200],
      "wrong-portal": ["ACCOUNT_SCOPE_VALIDATION", "HUBSPOT_ACCOUNT_OR_SCOPES_INVALID", 200],
      "missing-scope": ["ACCOUNT_SCOPE_VALIDATION", "HUBSPOT_READ_SCOPE_MISSING", 200],
      "write-scope": ["ACCOUNT_SCOPE_VALIDATION", "HUBSPOT_NON_READ_OR_UNSUPPORTED_SCOPE", 200],
      "invalid-token": ["INPUT", "HUBSPOT_TOKEN_FORMAT_INVALID", null],
      success: ["COMPLETE", "HUBSPOT_VERIFIED", 200],
    };
    expect(rows).toHaveLength(Object.keys(expected).length);
    for (const row of rows) {
      const mode = String(row.mode);
      expect([row.stage, row.code, row.httpStatus], mode).toEqual(expected[mode]);
      expect(row.calls, mode).toBe(["local-setup", "invalid-token"].includes(mode) ? 0 : 1);
      expect(row.success).toBe(mode === "success");
    }
    expect(result.out + result.error).not.toContain(fixtureToken);
    expect(result.out + result.error).not.toContain("response-secret-marker");
    expect(
      readFileSync(path.join(dir, "PrimelisSignal", "hubspot-verification.json"), "utf8"),
    ).toContain("HUBSPOT_VERIFIED");
  } finally {
    if (path.dirname(dir) !== os.tmpdir() || !path.basename(dir).startsWith("aw-hubspot-offline-"))
      throw new Error("Cleanup target denied");
    rmSync(dir, { recursive: true });
  }
}, 20000);
