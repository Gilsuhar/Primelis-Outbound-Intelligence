import "server-only";
import { lstatSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { IntegrationError } from "./http";

export const oauthStages = [
  "PRECONDITION",
  "CREDENTIAL_READ",
  "CREDENTIAL_VALIDATION",
  "CREDENTIAL_STORAGE",
  "CONNECTION_STATUS_READ",
  "AUTHORIZATION_REDIRECT",
  "CALLBACK_VALIDATION",
  "STATE_VALIDATION",
  "TOKEN_EXCHANGE",
  "TOKEN_RESPONSE_VALIDATION",
  "RESOURCE_PERMISSION_CHECK",
  "TOKEN_STORAGE",
  "COMPLETION_REDIRECT",
] as const;
export type OAuthStage = (typeof oauthStages)[number];
const codes = [
  "LOCAL_OUTREACH_DISABLED",
  "LOCAL_OPERATOR_REQUIRED",
  "ORIGIN_DENIED",
  "INVALID_FORM",
  "CONFIRMATION_REQUIRED",
  "EXISTING_CONFIG_PRESERVED",
  "SETUP_REQUIRED",
  "WINDOWS_DPAPI_REQUIRED",
  "LOCAL_VAULT_UNAVAILABLE",
  "LOCAL_VAULT_INVALID",
  "OAUTH_BUSY",
  "OAUTH_STATE_INVALID",
  "OAUTH_GRANT_INVALID",
  "GRANT_DENIED",
  "OAUTH_SCOPE_DENIED",
  "INVALID_CREDENTIAL_CONFIGURATION",
  "INVALID_CLIENT_ID_FORMAT",
  "INVALID_CLIENT_SECRET_FORMAT",
  "INVALID_CLIENT_ID_AND_SECRET_FORMAT",
  "INVALID_TOKEN_RESPONSE",
  "INVALID_RESPONSE",
  "DISCONNECTED",
  "PERMISSION_MISSING",
  "RATE_LIMITED",
  "UNAVAILABLE",
  "CONFIGURATION",
  "TOKEN_HTTP_ERROR",
  "TOKEN_NETWORK_ERROR",
  "OPERATION_FAILED",
  "invalid_request",
  "invalid_client",
  "invalid_grant",
  "unauthorized_client",
  "unsupported_grant_type",
  "invalid_scope",
  "access_denied",
  "server_error",
  "temporarily_unavailable",
] as const;
type OAuthCode = (typeof codes)[number];
export type OAuthDiagnostic = { stage: OAuthStage; code: OAuthCode; httpStatus?: number };
const safeStatus = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : undefined;
function safeCode(value: unknown): OAuthCode | undefined {
  return typeof value === "string" && (codes as readonly string[]).includes(value)
    ? (value as OAuthCode)
    : undefined;
}
export function providerOAuthCode(value: unknown): OAuthCode | undefined {
  const code = safeCode(value);
  return code && code === code.toLowerCase() ? code : undefined;
}
export class OAuthStageError extends Error {
  constructor(
    readonly stage: OAuthStage,
    readonly code: OAuthCode,
    readonly httpStatus?: number,
  ) {
    super(code);
    this.name = "OutreachOAuthStageError";
  }
}
/** Construct a NEW allowlisted object. Never serialize an error, cause, stack or request. */
export function oauthDiagnostic(stage: OAuthStage, error: unknown): OAuthDiagnostic {
  // Next route bundles/HMR can have distinct class identities; validate each scalar again.
  const tagged =
    error instanceof Error && error.name === "OutreachOAuthStageError"
      ? (error as Error & Partial<OAuthDiagnostic>)
      : null;
  if (tagged)
    return {
      stage: tagged.stage && oauthStages.includes(tagged.stage) ? tagged.stage : stage,
      code: safeCode(tagged.code) ?? "OPERATION_FAILED",
      httpStatus: safeStatus(tagged.httpStatus),
    };
  if (error instanceof z.ZodError) {
    // Retain only fixed field identifiers, never values, paths or Zod issue messages.
    const invalidId = error.issues.some(
      (issue) => issue.path.length === 1 && issue.path[0] === "clientId",
    );
    const invalidSecret = error.issues.some(
      (issue) => issue.path.length === 1 && issue.path[0] === "clientSecret",
    );
    return {
      stage,
      code:
        stage === "CREDENTIAL_VALIDATION"
          ? invalidId && invalidSecret
            ? "INVALID_CLIENT_ID_AND_SECRET_FORMAT"
            : invalidId
              ? "INVALID_CLIENT_ID_FORMAT"
              : invalidSecret
                ? "INVALID_CLIENT_SECRET_FORMAT"
                : "INVALID_CREDENTIAL_CONFIGURATION"
          : stage === "TOKEN_RESPONSE_VALIDATION"
            ? "INVALID_TOKEN_RESPONSE"
            : "INVALID_RESPONSE",
    };
  }
  return {
    stage,
    code:
      safeCode(error instanceof Error ? error.message : undefined) ??
      (error instanceof IntegrationError ? safeCode(error.code) : undefined) ??
      "OPERATION_FAILED",
    httpStatus: error instanceof IntegrationError ? safeStatus(error.status) : undefined,
  };
}
export function readOAuthFailure(): OAuthDiagnostic | null {
  if (
    process.platform !== "win32" ||
    process.env.LOCAL_OUTREACH_OAUTH_ENABLED !== "true" ||
    !process.env.LOCALAPPDATA
  )
    return null;
  try {
    const root = path.join(process.env.LOCALAPPDATA, "PrimelisSignal");
    if (lstatSync(root).isSymbolicLink()) return null;
    const file = path.join(root, "outreach-oauth-diagnostic.json"),
      info = lstatSync(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 1024) return null;
    const saved = z
      .object({
        at: z.string().datetime(),
        stage: z.enum(oauthStages),
        code: z.enum(codes),
        httpStatus: z.number().int().min(100).max(599).optional(),
      })
      .strict()
      .parse(JSON.parse(readFileSync(file, "utf8")));
    return { stage: saved.stage, code: saved.code, httpStatus: saved.httpStatus };
  } catch {
    return null;
  }
}
export function stageError(stage: OAuthStage, error: unknown) {
  const safe = oauthDiagnostic(stage, error);
  return new OAuthStageError(safe.stage, safe.code, safe.httpStatus);
}
/** Last failure only, bounded JSON outside the repo; no credential values or raw diagnostics. */
export function recordOAuthFailure(stage: OAuthStage, error: unknown) {
  const diagnostic = oauthDiagnostic(stage, error);
  const record = { at: new Date().toISOString(), ...diagnostic };
  console.error("[local-outreach-oauth]", JSON.stringify(record));
  if (
    process.platform === "win32" &&
    process.env.LOCAL_OUTREACH_OAUTH_ENABLED === "true" &&
    process.env.LOCALAPPDATA
  ) {
    try {
      const root = path.join(process.env.LOCALAPPDATA, "PrimelisSignal");
      const file = path.join(root, "outreach-oauth-diagnostic.json");
      const directory = lstatSync(root);
      if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error();
      try {
        const existing = lstatSync(file);
        if (!existing.isFile() || existing.isSymbolicLink()) return diagnostic;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      writeFileSync(file, JSON.stringify(record) + "\n", { encoding: "utf8", mode: 0o600 });
    } catch {
      console.error("[local-outreach-oauth] DIAGNOSTIC_WRITE_UNAVAILABLE");
    }
  }
  return diagnostic;
}
/** Read only a bounded error envelope and retain ONLY a standard OAuth error identifier. */
export async function tokenHttpError(response: Response) {
  let code: OAuthCode = "TOKEN_HTTP_ERROR";
  const reader = response.body?.getReader();
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader)
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 8192) {
          await reader.cancel();
          break;
        }
        chunks.push(part.value);
      }
    if (size <= 8192) {
      const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const value =
        parsed && typeof parsed === "object" ? (parsed as { error?: unknown }).error : undefined;
      code = providerOAuthCode(value) ?? "TOKEN_HTTP_ERROR";
    }
  } catch {
    /* no provider body, parser error or description is retained */
  } finally {
    reader?.releaseLock();
  }
  return new OAuthStageError("TOKEN_EXCHANGE", code, safeStatus(response.status));
}
