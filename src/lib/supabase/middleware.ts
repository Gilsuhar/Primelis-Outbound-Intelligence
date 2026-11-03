import {
  localDevelopmentConfig,
  localDevelopmentHost,
  localDevelopmentSession,
  localDevelopmentCookie,
  localDevelopmentOrigin,
} from "@/lib/auth/local-development";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseAuthConfig } from "@/lib/auth/env";
import { isPublicRoute } from "@/lib/private-preview-auth";
import { companyPilotConfig, pilotPathAllowed } from "@/lib/company-pilot-isolation";
import { isPreviewRestricted, previewApiDenied } from "@/lib/preview-policy.mjs";

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

  if (isPreviewRestricted()) {
    if (pathname.startsWith("/api/")) return previewApiDenied()!;
    if (pathname === "/local-login") return new NextResponse(null, { status: 403 });
    // Server actions have their own guards; this rejects unrelated POST entry points too.
    if (!["GET", "HEAD"].includes(request.method) &&
        pathname !== "/login" && !pathname.startsWith("/auth/"))
      return NextResponse.json({ ok: false, code: "PREVIEW_OPERATION_DENIED" }, { status: 403 });
  }

  if (process.env.COMPANY_PILOT_ENABLED === "true") {
    try {
      companyPilotConfig();
      if (!pilotPathAllowed(pathname, request.method)) throw new Error("PILOT_FORBIDDEN");
    } catch {
      return NextResponse.json({ ok: false, message: "Pilot access blocked" }, { status: 403 });
    }
    // The exact company endpoint validates its own bearer; no other worker is admitted.
    if (pathname === "/api/sales-agent/company-queue/worker" && request.method === "POST")
      return response;
  }

  // These exact POST routes authenticate their server worker bearer independently.
  // Do not require a browser's Supabase cookie before the route can validate it.
  if (
    !localDevelopmentConfig() &&
    request.method === "POST" &&
    [
      "/api/sales-agent/daily/worker",
      "/api/sales-agent/integrations/worker",
      "/api/sales-agent/prospect-research/worker",
    ].includes(pathname)
  )
    return response;
  const local = localDevelopmentConfig();
  if (local) {
    if (!localDevelopmentHost(request.headers.get("host")))
      return new NextResponse(null, { status: 404 });
    // Strict app cookie stays Strict. The HTTPS callback GET is only a bridge to an
    // authenticated same-origin POST; it never exchanges or stores a grant.
    if (
      process.env.LOCAL_OUTREACH_OAUTH_ENABLED === "true" &&
      process.env.LOCAL_DEV_HTTPS === "true" &&
      request.nextUrl.protocol === "https:" &&
      request.headers.get("host") === "127.0.0.1:3000" &&
      pathname === "/api/outreach/oauth/callback" &&
      request.method === "GET"
    )
      return response;
    // No local integration, daily scheduler or worker execution through this mode.
    if (
      pathname.startsWith("/api/sales-agent/integrations") ||
      pathname.startsWith("/api/sales-agent/daily") ||
      pathname.endsWith("/worker")
    )
      return NextResponse.json(
        { ok: false, message: "Disabled in local development login mode" },
        { status: 403 },
      );
    if (pathname === "/local-login") return response;
    if (
      localDevelopmentSession(
        request.headers.get("host"),
        request.cookies.get(localDevelopmentCookie)?.value,
      )
    ) {
      if (pathname === "/login")
        return NextResponse.redirect(
          new URL("/sales-agent", localDevelopmentOrigin(request.headers.get("host"))!),
        );
      return response;
    }
    if (pathname.startsWith("/api/")) return NextResponse.json({ ok: false }, { status: 401 });
    return NextResponse.redirect(
      new URL("/local-login", localDevelopmentOrigin(request.headers.get("host"))!),
    );
  }
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
