import type { UserRole } from "@/features/knowledge/types";

export const privatePreviewRoles = ["SALES", "KNOWLEDGE_ADMIN"] as const;

export type PrivatePreviewRole = (typeof privatePreviewRoles)[number];

export type AuthenticatedUser = {
  id: string;
  email: string;
  name?: string;
  role: UserRole;
};

export type PublicUser = {
  email: string;
  name?: string;
  role: UserRole;
};

export const publicRoutes = ["/login", "/auth/callback", "/favicon.ico"] as const;

export const adminRoutePrefixes = [
  "/knowledge-library",
  "/add-knowledge",
  "/review-queue",
  "/imported-signal-review",
  "/claims",
  "/do-not-contact/import",
  "/account-research/import",
] as const;

export const salesRoutePrefixes = [
  "/",
  "/playbook",
  "/account-research",
  "/create-outreach",
  "/build-sequence",
  "/reply-to-prospect",
  "/ask-signal-brain",
  "/do-not-contact",
] as const;

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || (prefix !== "/" && pathname.startsWith(`${prefix}/`));
}

export function isPublicRoute(pathname: string) {
  return publicRoutes.some((route) => matchesPrefix(pathname, route));
}

export function isAdminRoute(pathname: string) {
  return adminRoutePrefixes.some((route) => matchesPrefix(pathname, route));
}

export function canAccessRoute(pathname: string, role: UserRole) {
  if (isPublicRoute(pathname)) return true;
  if (isAdminRoute(pathname)) return role === "KNOWLEDGE_ADMIN";
  return salesRoutePrefixes.some((route) => matchesPrefix(pathname, route));
}

export function toPrivatePreviewRole(role: UserRole): PrivatePreviewRole {
  return role === "KNOWLEDGE_ADMIN" ? "KNOWLEDGE_ADMIN" : "SALES";
}

export function publicUserFromAuthenticatedUser(user: AuthenticatedUser): PublicUser {
  return {
    email: user.email,
    name: user.name,
    role: user.role,
  };
}
