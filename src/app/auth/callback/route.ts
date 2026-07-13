import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";

import { getSupabaseAuthConfig } from "@/lib/auth/env";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

function getSafeRedirectUrl(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const next = requestUrl.searchParams.get("next") ?? "/";
  return new URL(next.startsWith("/") ? next : "/", request.url);
}

function getCallbackFailureUrl(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("error", "callback_failed");
  return loginUrl;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(getCallbackFailureUrl(request));
  }

  const config = getSupabaseAuthConfig();
  if (!config) {
    return NextResponse.redirect(getCallbackFailureUrl(request));
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
    return NextResponse.redirect(getCallbackFailureUrl(request));
  }

  const response = NextResponse.redirect(getSafeRedirectUrl(request));
  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });

  return response;
}
