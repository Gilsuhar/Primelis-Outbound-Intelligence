import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";

import { getSupabaseAuthConfig } from "@/lib/auth/env";
import {
  getSafeSupabaseCallbackError,
  getSafeSupabaseError,
  logAuthDiagnostic,
} from "@/lib/auth/diagnostics";
import { resolveApplicationUser } from "@/lib/auth/server";
import { getSafeInternalPath, normalizePreviewEmail } from "@/lib/private-preview-auth";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

type HeadersToSet = Record<string, string>;

function getSafeRedirectUrl(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const next = getSafeInternalPath(requestUrl.searchParams.get("next"));
  return new URL(next, request.url);
}

function getLoginErrorUrl(
  request: NextRequest,
  error: "access_denied" | "configuration_error" | "oauth_failed",
) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("error", error);
  return loginUrl;
}

function redirectWithCookies(url: URL, cookiesToSet: CookieToSet[], headersToSet: HeadersToSet) {
  const response = NextResponse.redirect(url);
  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });
  Object.entries(headersToSet).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (requestUrl.searchParams.has("error")) {
    logAuthDiagnostic("warn", {
      operation: "google_oauth",
      stage: "callback_provider_error",
      callbackCodePresent: Boolean(code),
      pkceExchangeSucceeded: false,
      ...getSafeSupabaseCallbackError(requestUrl.searchParams),
    });
    return NextResponse.redirect(getLoginErrorUrl(request, "oauth_failed"));
  }

  if (!code) {
    logAuthDiagnostic("warn", {
      operation: "google_oauth",
      stage: "callback_code_missing",
      callbackCodePresent: false,
      pkceExchangeSucceeded: false,
    });
    return NextResponse.redirect(getLoginErrorUrl(request, "oauth_failed"));
  }

  const config = getSupabaseAuthConfig();
  if (!config) {
    logAuthDiagnostic("warn", {
      operation: "google_oauth",
      stage: "callback_configuration_invalid",
      callbackCodePresent: true,
    });
    return NextResponse.redirect(getLoginErrorUrl(request, "configuration_error"));
  }

  const cookiesToSet: CookieToSet[] = [];
  const headersToSet: HeadersToSet = {};
  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(nextCookies: CookieToSet[], nextHeaders = {}) {
        cookiesToSet.push(...nextCookies);
        Object.assign(headersToSet, nextHeaders);
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    logAuthDiagnostic("warn", {
      operation: "google_oauth",
      stage: "callback_exchange_failed",
      callbackCodePresent: true,
      pkceExchangeSucceeded: false,
      ...getSafeSupabaseError(error),
    });
    return redirectWithCookies(
      getLoginErrorUrl(request, "oauth_failed"),
      cookiesToSet,
      headersToSet,
    );
  }

  logAuthDiagnostic("info", {
    operation: "google_oauth",
    stage: "callback_exchange_succeeded",
    callbackCodePresent: true,
    pkceExchangeSucceeded: true,
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  const normalizedEmail = normalizePreviewEmail(user?.email);
  if (userError || !user || !normalizedEmail) {
    logAuthDiagnostic("warn", {
      operation: "google_oauth",
      stage: "callback_user_unavailable",
      callbackCodePresent: true,
      pkceExchangeSucceeded: true,
      sessionUserReturned: Boolean(user),
      approvedUserAuthorized: false,
      ...getSafeSupabaseError(userError),
    });
    await supabase.auth.signOut();
    return redirectWithCookies(
      getLoginErrorUrl(request, "access_denied"),
      cookiesToSet,
      headersToSet,
    );
  }

  let applicationUser;
  try {
    applicationUser = await resolveApplicationUser({
      id: user.id,
      email: normalizedEmail,
    });
  } catch {
    logAuthDiagnostic("warn", {
      operation: "google_oauth",
      stage: "callback_application_user_lookup_failed",
      callbackCodePresent: true,
      pkceExchangeSucceeded: true,
      sessionUserReturned: true,
      approvedUserAuthorized: false,
    });
    await supabase.auth.signOut();
    return redirectWithCookies(
      getLoginErrorUrl(request, "configuration_error"),
      cookiesToSet,
      headersToSet,
    );
  }

  if (!applicationUser) {
    logAuthDiagnostic("warn", {
      operation: "google_oauth",
      stage: "callback_access_denied",
      callbackCodePresent: true,
      pkceExchangeSucceeded: true,
      sessionUserReturned: true,
      approvedUserAuthorized: false,
    });
    await supabase.auth.signOut();
    return redirectWithCookies(
      getLoginErrorUrl(request, "access_denied"),
      cookiesToSet,
      headersToSet,
    );
  }

  logAuthDiagnostic("info", {
    operation: "google_oauth",
    stage: "callback_authorized",
    callbackCodePresent: true,
    pkceExchangeSucceeded: true,
    sessionUserReturned: true,
    approvedUserAuthorized: true,
  });

  return redirectWithCookies(getSafeRedirectUrl(request), cookiesToSet, headersToSet);
}
