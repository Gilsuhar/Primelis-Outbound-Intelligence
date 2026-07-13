import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";

import { getSupabaseAuthConfig } from "@/lib/auth/env";
import { resolveApplicationUser } from "@/lib/auth/server";
import { getSafeInternalPath, normalizePreviewEmail } from "@/lib/private-preview-auth";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

function getSafeRedirectUrl(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const next = getSafeInternalPath(requestUrl.searchParams.get("next"));
  return new URL(next, request.url);
}

function getLoginErrorUrl(
  request: NextRequest,
  error: "access_denied" | "callback_failed" | "oauth_failed",
) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("error", error);
  return loginUrl;
}

function redirectWithCookies(url: URL, cookiesToSet: CookieToSet[]) {
  const response = NextResponse.redirect(url);
  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });
  return response;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (requestUrl.searchParams.has("error")) {
    return NextResponse.redirect(getLoginErrorUrl(request, "oauth_failed"));
  }

  if (!code) {
    return NextResponse.redirect(getLoginErrorUrl(request, "callback_failed"));
  }

  const config = getSupabaseAuthConfig();
  if (!config) {
    return NextResponse.redirect(getLoginErrorUrl(request, "callback_failed"));
  }

  const cookiesToSet: CookieToSet[] = [];
  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(nextCookies: CookieToSet[]) {
        cookiesToSet.push(...nextCookies);
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return redirectWithCookies(getLoginErrorUrl(request, "callback_failed"), cookiesToSet);
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  const normalizedEmail = normalizePreviewEmail(user?.email);
  if (userError || !user || !normalizedEmail) {
    await supabase.auth.signOut();
    return redirectWithCookies(getLoginErrorUrl(request, "access_denied"), cookiesToSet);
  }

  const applicationUser = await resolveApplicationUser({
    id: user.id,
    email: normalizedEmail,
  });

  if (!applicationUser) {
    await supabase.auth.signOut();
    return redirectWithCookies(getLoginErrorUrl(request, "access_denied"), cookiesToSet);
  }

  return redirectWithCookies(getSafeRedirectUrl(request), cookiesToSet);
}
