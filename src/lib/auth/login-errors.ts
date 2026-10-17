import type { LoginErrorCode } from "@/lib/private-preview-auth";

export const loginErrorMessages: Record<LoginErrorCode, string> = {
  access_denied:
    "This account is not approved for this workspace. Contact your workspace administrator.",
  configuration_error:
    "Sign-in configuration is unavailable. Contact your workspace administrator.",
  oauth_failed: "We could not finish Google sign-in. Please try again.",
  oauth_start_failed: "We could not start Google sign-in. Please try again.",
  preview_database_configuration:
    "Google sign-in succeeded, but this Preview's isolated workspace database is not configured correctly. An administrator must check its Preview database settings.",
  profile_database_authentication:
    "Google sign-in succeeded, but the workspace database rejected the server connection. An administrator must check its database credentials.",
  profile_database_unavailable:
    "Google sign-in succeeded, but the workspace database is unavailable. Please try again later or contact your workspace administrator.",
  profile_database_schema:
    "Google sign-in succeeded, but the workspace database schema is not ready. An administrator must review the database setup.",
  profile_lookup_failed:
    "Google sign-in succeeded, but workspace access could not be checked. Contact your workspace administrator.",
};

export function parseLoginError(value: unknown): LoginErrorCode | undefined {
  return typeof value === "string" && Object.hasOwn(loginErrorMessages, value)
    ? (value as LoginErrorCode)
    : undefined;
}

/** Only fixed categories reach the browser; never return exception messages. */
export function profileLookupError(error: unknown): LoginErrorCode {
  if (error instanceof Error && error.message === "PREVIEW_DATABASE_ISOLATION_REQUIRED")
    return "preview_database_configuration";
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  if (code === "P1000") return "profile_database_authentication";
  if (typeof code === "string" && ["P1001", "P1002", "P1008", "P1017", "P2024"].includes(code))
    return "profile_database_unavailable";
  if (code === "P2021" || code === "P2022") return "profile_database_schema";
  return "profile_lookup_failed";
}
