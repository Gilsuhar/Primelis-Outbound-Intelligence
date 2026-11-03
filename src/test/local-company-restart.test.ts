// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

const root = process.cwd();
const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
const helper = path.join(root, "local-activation/LocalProduct-Tools.ps1");
const pwsh = path.join(
  process.env.LOCALAPPDATA!,
  "Microsoft/WindowsApps/Microsoft.PowerShell_8wekyb3d8bbwe/pwsh.exe",
);

it("saved local setup fails closed without prompting or falling back when the encrypted file is absent", () => {
  const result = shell(
    "try { Read-SavedLocalSalesConfiguration; throw 'UNEXPECTED_SUCCESS' } catch { " +
      "if ($_.Exception.Message -cne 'LOCAL_SALES_SETUP_REQUIRED') { throw 'UNEXPECTED_FAILURE' }; " +
      "@{status='MISSING_SETUP_BLOCKED'} | ConvertTo-Json -Compress }",
    { LOCALAPPDATA: path.join(root, "outputs", "nonexistent-saved-config-offline-test") },
  );
  expect(result.status).toBe("MISSING_SETUP_BLOCKED");
});
function shell(script: string, overrides: Record<string, string> = {}) {
  const runtime = Object.fromEntries(
    [
      "SystemRoot",
      "WINDIR",
      "PATH",
      "TEMP",
      "TMP",
      "USERPROFILE",
      "LOCALAPPDATA",
      "APPDATA",
      "ProgramFiles",
      "ComSpec",
      "PATHEXT",
    ].flatMap((key) => {
      const actual = Object.keys(process.env).find(
        (entry) => entry.toLowerCase() === key.toLowerCase(),
      );
      return actual ? [[key, process.env[actual]!]] : [];
    }),
  );
  const result = spawnSync(
    pwsh,
    [
      "-NoProfile",
      "-EncodedCommand",
      Buffer.from(
        "$ErrorActionPreference='Stop';Set-StrictMode -Version Latest;. " +
          quote(helper) +
          ";" +
          script,
        "utf16le",
      ).toString("base64"),
    ],
    {
      env: { ...runtime, ...overrides, NODE_ENV: "test" },
      encoding: "utf8",
      input: "",
      timeout: 15000,
    },
  );
  if (result.status !== 0)
    throw new Error(
      "Offline PowerShell test failed: " +
        result.status +
        "; " +
        result.stderr +
        "; " +
        result.stdout,
    );
  return JSON.parse(result.stdout.trim());
}
function restart(scenario: string, confirmed: boolean) {
  // Every process observation/termination function is mocked before invoking the helper.
  return shell(
    [
      "$root=" +
        quote(root) +
        ";$scenario=" +
        quote(scenario) +
        ";$script:stopped=@();$script:reads=0;$script:portReads=0;",
      "function Get-NetTCPConnection {param($State,$LocalPort,$ErrorAction)",
      "$script:portReads++;if($scenario -ne 'empty' -and $script:stopped.Count -eq 0){",
      "[pscustomobject]@{LocalAddress=$(if($scenario -eq 'public'){'0.0.0.0'}else{'127.0.0.1'});OwningProcess=$(if($scenario -eq 'port-race' -and $script:portReads -gt 1){9999}else{4242})}}}",
      "function Get-CimInstance {param($ClassName,$Filter)",
      "$script:reads++;$scriptRoot=$(if($scenario -eq 'sibling'){$root+'-other'}else{$root});",
      "$command='\"C:\\runtime\\node.exe\" \"'+$scriptRoot+'\\node_modules\\next\\dist\\server\\lib\\start-server.js\"';",
      "if($scenario -eq 'argument-spoof'){$command='\"C:\\runtime\\node.exe\" \"C:\\other\\server.js\" \"'+$root+'\\node_modules\\next\\dist\\server\\lib\\start-server.js\"'}",
      "if($scenario -eq 'command-race' -and $script:reads -gt 1){$command+=' --changed'}",
      "[pscustomobject]@{Name=$(if($scenario -eq 'other-executable'){'python.exe'}else{'node.exe'});ProcessId=4242;CommandLine=$command;CreationDate=$(if($scenario -eq 'pid-race' -and $script:reads -gt 1){[datetime]'2026-10-19'}else{[datetime]'2026-10-18'})}}",
      "function Stop-Process {param($Id,$ErrorAction) $script:stopped+= $Id}",
      "$success=$false;$failure=$null;try {Invoke-ConfirmedLocalNextRestart -RepositoryRoot $root -ConfirmRestart:$" +
        (confirmed ? "true" : "false") +
        ";$success=$true}catch{$failure=$_.Exception.Message}",
      "[pscustomobject]@{Success=$success;Stopped=@($script:stopped);Failure=$failure} | ConvertTo-Json -Compress",
    ].join("\n"),
  );
}
it("requires explicit restart consent without trying Read-Host", () => {
  expect(restart("verified", false)).toMatchObject({ Success: false, Stopped: [] });
});
it("stops only the mocked verified loopback server with explicit consent", () => {
  expect(restart("verified", true)).toMatchObject({ Success: true, Stopped: [4242] });
});
it.each([
  "sibling",
  "argument-spoof",
  "other-executable",
  "public",
  "pid-race",
  "command-race",
  "port-race",
])("refuses unsafe ownership or process changes: %s", (scenario) => {
  expect(restart(scenario, true)).toMatchObject({ Success: false, Stopped: [] });
});
it("does nothing if port 3000 is free", () => {
  expect(restart("empty", false)).toMatchObject({ Success: true, Stopped: [] });
});
it("rejects redirected credential input before prompting for secrets", () => {
  expect(
    shell(
      "$blocked=$false;try{Assert-LocalCredentialConsole}catch{$blocked=$true};[pscustomobject]@{Blocked=$blocked;InputRedirected=[Console]::IsInputRedirected}|ConvertTo-Json -Compress",
    ),
  ).toEqual({ Blocked: true, InputRedirected: true });
});
it("reproduces the old empty Read-Host result at redirected EOF without credentials", () => {
  expect(
    shell(
      "$answer=Read-Host 'OFFLINE STOP TEST';[pscustomobject]@{Empty=([string]::IsNullOrEmpty($answer));InputRedirected=[Console]::IsInputRedirected}|ConvertTo-Json -Compress",
    ),
  ).toEqual({ Empty: true, InputRedirected: true });
});
it("finds portable Node and pnpm fixtures when their directory is missing from PATH", () => {
  mkdirSync(path.join(root, "outputs"), { recursive: true });
  const fixture = mkdtempSync(path.join(root, "outputs", "runtime-discovery-"));
  const nodeDirectory = path.join(fixture, "Programs", "nodejs");
  mkdirSync(nodeDirectory, { recursive: true });
  // The resolver only checks node.exe existence. No real installation is modified.
  writeFileSync(path.join(nodeDirectory, "node.exe"), "offline path-discovery fixture");
  writeFileSync(path.join(nodeDirectory, "pnpm.cmd"), "@echo off\r\necho 9.12.0\r\n");
  const reducedPath = path.join(process.env.SystemRoot!, "System32");
  const result = shell(
    "$missing=(-not [bool](Get-Command pnpm -ErrorAction SilentlyContinue));$tools=Resolve-LocalProductTools;$env:PATH=$tools.ProcessPath;$env:COREPACK_ENABLE_NETWORK='0';$version=& $tools.PnpmPath --version;[pscustomobject]@{InitiallyMissing=$missing;NodeExists=(Test-Path -LiteralPath $tools.NodePath);PnpmVersion=$version;ExitCode=$LASTEXITCODE}|ConvertTo-Json -Compress",
    {
      PATH: reducedPath,
      LOCALAPPDATA: fixture,
      APPDATA: fixture,
      USERPROFILE: fixture,
      ProgramFiles: fixture,
    },
  );
  expect(result).toMatchObject({
    InitiallyMissing: true,
    NodeExists: true,
    PnpmVersion: "9.12.0",
    ExitCode: 0,
  });
});
