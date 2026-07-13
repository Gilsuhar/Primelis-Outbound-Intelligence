import { describe, expect, it } from "vitest";

import {
  canAccessRoute,
  isAdminRoute,
  isPublicRoute,
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
});
