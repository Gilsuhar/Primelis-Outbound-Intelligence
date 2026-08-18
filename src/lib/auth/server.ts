import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";

import type { UserRole } from "@/features/knowledge/types";
import { prisma } from "@/lib/prisma";
import {
  persistSupabaseCookies,
  type SupabaseCookiePersistenceOptions,
  type SupabaseCookieToSet,
} from "@/lib/auth/cookie-persistence";
import { getAppUrl, getSupabaseAuthConfig } from "@/lib/auth/env";
import {
  canAccessRoute,
  type AuthenticatedUser,
  normalizePreviewEmail,
  type PublicUser,
  publicUserFromAuthenticatedUser,
} from "@/lib/private-preview-auth";

type LocalProfile = {
  id: string;
  authUserId?: string | null;
  email: string;
  name?: string | null;
  role?: string | null;
};

const authLookupTimeoutMs = 1500;

function normalizeRole(role: string | null | undefined): UserRole {
  return role === "KNOWLEDGE_ADMIN" ? "KNOWLEDGE_ADMIN" : "SALES_USER";
}

function isSupabaseAuthCookieName(name: string) {
  return (
    name.startsWith("sb-") &&
    (name.includes("auth-token") || name.includes("access-token"))
  );
}

async function hasSupabaseAuthCookie() {
  const cookieStore = await cookies();
  return cookieStore.getAll().some((cookie) => isSupabaseAuthCookieName(cookie.name));
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

export async function createSupabaseServerClient(options: SupabaseCookiePersistenceOptions = {}) {
  const config = getSupabaseAuthConfig();
  if (!config) return null;

  const cookieStore = await cookies();

  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: SupabaseCookieToSet[]) {
        persistSupabaseCookies(cookieStore, cookiesToSet, options);
      },
    },
  });
}

export async function resolveApplicationUser(authUser: { id: string; email?: string | null }) {
  const normalizedEmail = normalizePreviewEmail(authUser.email);
  if (!normalizedEmail) return null;

  const existing = (await prisma.user.findFirst({
    where: {
      OR: [
        { authUserId: authUser.id },
        { email: { equals: normalizedEmail, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      authUserId: true,
      email: true,
      name: true,
      role: true,
    },
  })) as LocalProfile | null;

  if (!existing) return null;

  if (!existing.authUserId) {
    return (await prisma.user.update({
      where: { id: existing.id },
      data: { authUserId: authUser.id, email: normalizedEmail },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    })) as LocalProfile;
  }

  if (existing.email !== normalizedEmail) {
    return (await prisma.user.update({
      where: { id: existing.id },
      data: { email: normalizedEmail },
      select: {
        id: true,
        authUserId: true,
        email: true,
        name: true,
        role: true,
      },
    })) as LocalProfile;
  }

  return existing;
}

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  if (!(await hasSupabaseAuthCookie())) return null;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const authResult = await withTimeout(supabase.auth.getUser(), authLookupTimeoutMs);
  if (!authResult) return null;

  const {
    data: { user },
    error,
  } = authResult;

  if (error || !user) return null;

  const profile = await withTimeout(resolveApplicationUser(user), authLookupTimeoutMs);
  if (!profile) return null;

  return {
    id: profile.id,
    email: profile.email,
    name: profile.name ?? undefined,
    role: normalizeRole(profile.role),
  };
}

export async function getSupabaseAuthUser() {
  if (!(await hasSupabaseAuthCookie())) return null;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const authResult = await withTimeout(supabase.auth.getUser(), authLookupTimeoutMs);
  if (!authResult) return null;

  const {
    data: { user },
    error,
  } = authResult;

  return error ? null : user;
}

export async function requireCurrentUser(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(role: UserRole): Promise<AuthenticatedUser> {
  const user = await requireCurrentUser();
  if (user.role !== role) redirect("/");
  return user;
}

export async function requireRouteAccess(pathname: string) {
  const user = await requireCurrentUser();
  if (!canAccessRoute(pathname, user.role)) redirect("/");
  return user;
}

export async function getPublicUser(): Promise<PublicUser | null> {
  const user = await getCurrentUser();
  return user ? publicUserFromAuthenticatedUser(user) : null;
}

export async function getRequestOrigin() {
  const configured = getAppUrl();
  if (configured) return configured;
  const headerStore = await headers();
  const host = headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  return host ? `${proto}://${host}` : "http://localhost:3000";
}
