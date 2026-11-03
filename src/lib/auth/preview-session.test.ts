import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), findFirst: vi.fn(), update: vi.fn(), cookies: vi.fn(), create: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.create }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findFirst: mocks.findFirst, update: mocks.update } } }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies, headers: vi.fn() }));
import { getCurrentUser, resolveApplicationUser } from "./server";
import { previewFixture } from "@/test/preview-fixture";
const identity = { id: "synthetic-auth", email: "reviewer@example.invalid", email_confirmed_at: "2026-11-01T00:00:00Z" };
const profile = { id: "synthetic-profile", authUserId: identity.id, email: identity.email, role: "SALES_USER" };
beforeEach(() => {
  vi.clearAllMocks();
  for (const [key, value] of Object.entries(previewFixture())) vi.stubEnv(key, value);
  mocks.cookies.mockResolvedValue({ getAll: () => [{ name: "sb-aaaaaaaaaaaaaaaaaaaa-auth-token", value: "synthetic-session" }] });
  mocks.create.mockReturnValue({ auth: { getUser: mocks.getUser } });
  mocks.getUser.mockResolvedValue({ data: { user: identity }, error: null });
  mocks.findFirst.mockResolvedValue(profile);
});
afterEach(() => vi.unstubAllEnvs());
it("authorizes only a server-verified pre-bound profile without writes", async () => {
  expect(await getCurrentUser()).toMatchObject({ id: profile.id, role: "SALES_USER" });
  expect(mocks.getUser).toHaveBeenCalledOnce();
  expect(mocks.update).not.toHaveBeenCalled();
});
it.each([[], [{ name: "sb-mfxqiyidmdppvdzeboke-auth-token", value: "synthetic-session" }]].map(cookies => ({ cookies })))
  ("rejects absent or cross-project sessions before auth lookup", async ({ cookies }) => {
    mocks.cookies.mockResolvedValue({ getAll: () => cookies });
    expect(await getCurrentUser()).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
it.each(["invalid", "expired"])("rejects %s server-validated sessions", async reason => {
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: { code: reason } });
  expect(await getCurrentUser()).toBeNull();
  expect(mocks.findFirst).not.toHaveBeenCalled();
});
it("fails closed on authentication transport failure", async () => {
  mocks.getUser.mockRejectedValue(new Error("synthetic failure"));
  expect(await getCurrentUser()).toBeNull();
});
it.each([null, "", "SUPER_ADMIN"])("rejects unauthorized application role %s", async role => {
  mocks.findFirst.mockResolvedValue({ ...profile, role });
  expect(await resolveApplicationUser(identity)).toBeNull();
  expect(mocks.update).not.toHaveBeenCalled();
});
it.each(["", "https://mfxqiyidmdppvdzeboke.supabase.co"])("rejects absent/wrong project configuration", async url => {
  vi.stubEnv("NEXT_PUBLIC_PREVIEW_SUPABASE_URL", url);
  expect(await getCurrentUser()).toBeNull();
  expect(mocks.create).not.toHaveBeenCalled();
});
