import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseAuthConfig } from "@/lib/auth/env";
import { isPublicRoute } from "@/lib/private-preview-auth";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

const authCheckTimeoutMs = 1500;

function hasSupabaseAuthCookie(request: NextRequest) {
  return request.cookies
    .getAll()
    .some(
      (cookie) =>
        cookie.name.startsWith("sb-") &&
        (cookie.name.includes("auth-token") || cookie.name.includes("access-token")),
    );
}

function redirectToLogin(request: NextRequest, pathname: string) {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  let response = NextResponse.next({ request });

  // These exact POST routes authenticate their server worker bearer independently.
  // Do not require a browser's Supabase cookie before the route can validate it.
  if (
    request.method === "POST" &&
    [
      "/api/sales-agent/daily/worker",
      "/api/sales-agent/integrations/worker",
      "/api/sales-agent/prospect-research/worker",
    ].includes(pathname)
  )
    return response;
  const config = getSupabaseAuthConfig();
  const deny = () =>
    pathname.startsWith("/api/")
      ? NextResponse.json(
          { ok: false, message: "Authentication required" },
          { status: 401, headers: { "Cache-Control": "private, no-store" } },
        )
      : redirectToLogin(request, pathname);
  if (isPublicRoute(pathname)) {
    return response;
  }

  if (!config) {
    return deny();
  }

  if (!hasSupabaseAuthCookie(request)) {
    return deny();
  }

  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[], headersToSet = {}) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        Object.entries(headersToSet).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
      },
    },
  });

  let result;
  try {
    result = await withTimeout(supabase.auth.getClaims(), authCheckTimeoutMs);
  } catch {
    return deny();
  }
  if (!result) {
    return deny();
  }

  const { data, error } = result;
  const user = error ? null : data?.claims;

  if (!user) {
    return deny();
  }

  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
