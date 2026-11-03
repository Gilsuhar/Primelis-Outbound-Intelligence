// @vitest-environment node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("stops on PowerShell pipeline cancellation before any helper continuation", () => {
  const result = spawnSync("pwsh", [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-File",
    resolve("src/test/runtime-handoff-input-fixtures.ps1"), "-TestPipelineCancellation",
  ], {
    env: { NODE_ENV: "test", ...Object.fromEntries(["SystemRoot", "WINDIR", "TEMP", "TMP", "PATH", "PSModulePath"]
      .flatMap((key) => process.env[key] ? [[key, process.env[key]!]] : [])) },
    encoding: "utf8", timeout: 15000, windowsHide: true,
  });
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  expect(JSON.parse(result.stdout)).toEqual({ status: "CANCELLED", continued: false, promptsOpened: 0 });
});

it("handles all private input failures without UI, credentials or a helper process", () => {
  const env = Object.fromEntries(
    ["SystemRoot", "WINDIR", "TEMP", "TMP", "PATH", "PSModulePath"].flatMap((key) =>
      process.env[key] ? [[key, process.env[key]!]] : []),
  );
  const result = spawnSync("pwsh", [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-File",
    resolve("src/test/runtime-handoff-input-fixtures.ps1"),
  ], { env: { ...env, NODE_ENV: "test" }, encoding: "utf8", timeout: 15000, windowsHide: true });
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  const report = JSON.parse(result.stdout);
  expect(report).toMatchObject({ status: "PASSED", cloudCalls: 0, promptsOpened: 0 });
  expect(report.cases).toHaveLength(12);
  expect(report.cases.find((c: { name: string }) => c.name === "token-in-confirmation"))
    .toMatchObject({ tokenReads: 0, code: "APP_ISOLATION_NOT_CONFIRMED" });
  expect(report.cases.find((c: { name: string }) => c.name === "valid"))
    .toMatchObject({ code: "PASSED", order: ["CONFIRMATION", "MASKED_TOKEN"] });
  expect(result.stdout + result.stderr).not.toMatch(/github_pat_|FICTIONAL_PRIVATE_ERROR|FICTIONAL_UNMASKED_VALUE/);
});

it("has no unmasked console input and defaults the non-editable dialog to Cancel", () => {
  const source = readFileSync("local-activation/Start-NeonRuntimeHandoff.ps1", "utf8");
  const reads = source.split("\n").filter((line) => /^\s*Read-Host\b/.test(line));
  expect(reads).toEqual(["        Read-Host 'GitHub token (masked)' -AsSecureString"]);
  expect(source).toContain("[System.Windows.Forms.MessageBox]::Show(");
  expect(source).toContain("[System.Windows.Forms.MessageBoxDefaultButton]::Button3");
  expect(source).toContain("[System.Windows.Forms.MessageBoxButtons]::YesNoCancel");
  expect(source).not.toMatch(/TextBox|InputBox|Get-Clipboard/);
  expect(source.indexOf("Get-RuntimeHandoffPrivateInput")).toBeLessThan(source.indexOf("$privateProcess.Start()"));
  expect(source).toContain("$privateProcess.StandardInput.Write(");
  expect(source).toContain("$null = $privateErr.GetAwaiter().GetResult()");
  expect(source).toContain("Get-RuntimeHandoffPromptCode $_.Exception.Message");
});
