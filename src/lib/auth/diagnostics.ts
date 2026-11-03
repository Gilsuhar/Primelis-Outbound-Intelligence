type SupabaseErrorLike = {
  code?: unknown;
  status?: unknown;
};

export type AuthDiagnostic = {
  operation: "google_oauth";
  stage: string;
  callbackCodePresent?: boolean;
  pkceVerifierPersisted?: boolean;
  pkceExchangeSucceeded?: boolean;
  sessionUserReturned?: boolean;
  approvedUserAuthorized?: boolean;
  supabaseErrorCode?: string;
  supabaseErrorStatus?: number;
};

export function getSafeSupabaseError(error: unknown) {
  if (!error || typeof error !== "object") return {};

  const candidate = error as SupabaseErrorLike;
  return {
    ...(typeof candidate.code === "string" ? { supabaseErrorCode: candidate.code } : {}),
    ...(typeof candidate.status === "number" ? { supabaseErrorStatus: candidate.status } : {}),
  };
}

function safeErrorCode(value: string | null) {
  return value && /^[a-z0-9_-]{1,64}$/i.test(value) ? value : undefined;
}

function safeErrorStatus(value: string | null) {
  if (!value || !/^\d{3}$/.test(value)) return undefined;
  const status = Number(value);
  return status >= 100 && status <= 599 ? status : undefined;
}

export function getSafeSupabaseCallbackError(searchParams: URLSearchParams) {
  const code = safeErrorCode(searchParams.get("error_code") ?? searchParams.get("error"));
  const status = safeErrorStatus(searchParams.get("error_status") ?? searchParams.get("status"));

  return {
    ...(code ? { supabaseErrorCode: code } : {}),
    ...(status ? { supabaseErrorStatus: status } : {}),
  };
}

export function logAuthDiagnostic(level: "info" | "warn", diagnostic: AuthDiagnostic) {
  console[level]("[private-preview-auth]", diagnostic);
}
