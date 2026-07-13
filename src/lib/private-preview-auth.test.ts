import { describe, expect, it } from "vitest";

import {
  canAccessRoute,
  getSafeInternalPath,
  isAdminRoute,
  isPublicRoute,
  normalizePreviewEmail,
  resolveLoginScreenState,
  toPrivatePreviewRole,
} from "@/lib/private-preview-auth";

describe("private preview auth policy", () => {
  it("allows login and auth callback as public routes", () => {
    expect(isPublicRoute("/login")).toBe(true);
    expect(isPublicRoute("/auth/callback")).toBe(true);
  });

  it("keeps administration routes admin-only", () => {
    expect(isAdminRoute("/imported-signal-review")).toBe(true);
    expect(canAccessRoute("/imported-signal-review", "SALES_USER")).toBe(false);
    expect(canAccessRoute("/imported-signal-review", "KNOWLEDGE_ADMIN")).toBe(true);
  });

  it("allows sales users into sales workflows", () => {
    expect(canAccessRoute("/reply-to-prospect", "SALES_USER")).toBe(true);
    expect(canAccessRoute("/build-sequence", "SALES_USER")).toBe(true);
    expect(canAccessRoute("/do-not-contact", "SALES_USER")).toBe(true);
  });

  it("maps internal sales role to the private preview role name", () => {
    expect(toPrivatePreviewRole("SALES_USER")).toBe("SALES");
    expect(toPrivatePreviewRole("KNOWLEDGE_ADMIN")).toBe("KNOWLEDGE_ADMIN");
  });

  it("shows access pending when Supabase Auth succeeds without an application user", () => {
    expect(
      resolveLoginScreenState({
        hasSupabaseAuthUser: true,
        hasApplicationUser: false,
      }),
    ).toBe("ACCESS_PENDING");
  });

  it("redirects only when a trusted application user exists", () => {
    expect(
      resolveLoginScreenState({
        hasSupabaseAuthUser: true,
        hasApplicationUser: true,
      }),
    ).toBe("SIGNED_IN");
  });

  it("normalizes private preview emails before app-user lookup", () => {
    expect(normalizePreviewEmail("  User@Example.COM ")).toBe("user@example.com");
    expect(normalizePreviewEmail(null)).toBe("");
  });

  it("keeps only internal redirect paths", () => {
    expect(getSafeInternalPath("/reply-to-prospect?draft=1")).toBe("/reply-to-prospect?draft=1");
    expect(getSafeInternalPath("https://evil.example/capture")).toBe("/");
    expect(getSafeInternalPath("//evil.example/capture")).toBe("/");
  });
});
