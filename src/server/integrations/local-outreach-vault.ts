import "server-only";
import { spawn } from "node:child_process";
import path from "node:path";
import { z } from "zod";
import { localDevelopmentConfig, localDevelopmentUser } from "@/lib/auth/local-development";

export const outreachLocalConfigSchema = z
  .object({
    version: z.literal(1),
    actor: z.literal(localDevelopmentUser.id),
    // Outreach documents an opaque OAuth identifier, not a base64url/password format.
    // Preserve punctuation verbatim; URLSearchParams encodes it at both provider endpoints.
    // The existing 256-character bound and whitespace/control rejection remain local input safeguards.
    clientId: z
      .string()
      .min(1)
      .max(256)
      .regex(/^[\x21-\x7E]+$/),
    clientSecret: z.string().min(8).max(2048),
    encryptionKey: z.string().regex(/^[A-Za-z0-9+/]{43}=$/),
  })
  .strict();
export type LocalOutreachConfig = z.infer<typeof outreachLocalConfigSchema>;

export function assertLocalOutreach(actor?: string) {
  if (
    !localDevelopmentConfig() ||
    process.env.LOCAL_DEV_HTTPS !== "true" ||
    process.env.LOCAL_OUTREACH_OAUTH_ENABLED !== "true" ||
    process.env.COMPANY_PILOT_ENABLED === "true" ||
    process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0" ||
    process.env.INTEGRATION_OPERATOR_USER_ID !== localDevelopmentUser.id ||
    (actor !== undefined && actor !== localDevelopmentUser.id)
  )
    throw new Error("LOCAL_OUTREACH_DISABLED");
}

/** Only DPAPI ciphertext persists. Secret input/output travels through private pipes, never argv/logs. */
export async function localOutreachVault(
  value?: LocalOutreachConfig,
): Promise<LocalOutreachConfig | null> {
  assertLocalOutreach(value?.actor);
  if (process.platform !== "win32") throw new Error("WINDOWS_DPAPI_REQUIRED");
  const payload = value ? JSON.stringify(outreachLocalConfigSchema.parse(value)) : "";
  const script = `
$ErrorActionPreference='Stop'
try {
 Add-Type -AssemblyName System.Security
 $dir=Join-Path $env:LOCALAPPDATA 'PrimelisSignal'
 $file=Join-Path $dir 'outreach-oauth.dpapi'
 if(-not (Test-Path -LiteralPath $dir -PathType Container)){throw 'Setup required'}
 if((Get-Item -LiteralPath $dir).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Invalid directory'}
 if(Test-Path -LiteralPath $file){
  $item=Get-Item -LiteralPath $file
  if($item.Length -gt 32768 -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Invalid file'}
 }
 $inputText=[Console]::In.ReadToEnd()
 if($inputText.Length -gt 0){
  if(Test-Path -LiteralPath $file){throw 'Existing configuration preserved'}
  $bytes=[Text.Encoding]::UTF8.GetBytes($inputText)
  try {
   $encrypted=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
   $stream=[IO.File]::Open($file,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
   try {$stream.Write($encrypted,0,$encrypted.Length)} finally {$stream.Dispose()}
  } finally {[Array]::Clear($bytes,0,$bytes.Length);$inputText=$null}
 }
 if(-not (Test-Path -LiteralPath $file)){[Console]::Out.Write('null');exit 0}
 $plain=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($file),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
 try {[Console]::Out.Write([Text.Encoding]::UTF8.GetString($plain))} finally {[Array]::Clear($plain,0,$plain.Length)}
} catch {exit 1}
`;
  const executable = path.join(
    process.env.SystemRoot ?? "C:\\Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(executable, ["-NoProfile", "-NonInteractive", "-Command", script], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let data = "",
      failed = false;
    const fail = () => {
      if (!failed) {
        failed = true;
        child.kill();
        reject(new Error("LOCAL_VAULT_UNAVAILABLE"));
      }
    };
    const timer = setTimeout(fail, 15000);
    child.stdout.on("data", (part: Buffer) => {
      data += part.toString();
      if (data.length > 32768) fail();
    });
    child.stderr.on("data", () => {
      /* never forward PowerShell error output */
    });
    child.on("error", fail);
    child.stdin.on("error", fail);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (!failed) {
        if (code === 0) resolve(data);
        else fail();
      }
    });
    child.stdin.end(payload);
  });
  try {
    const parsed: unknown = JSON.parse(output);
    return parsed === null ? null : outreachLocalConfigSchema.parse(parsed);
  } catch {
    throw new Error("LOCAL_VAULT_INVALID");
  }
}
