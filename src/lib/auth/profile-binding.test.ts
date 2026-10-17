import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ findFirst: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: db } }));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
import { resolveApplicationUser } from "./server";
beforeEach(() => vi.clearAllMocks());
describe("approved application identity binding", () => {
  it("denies an email match already bound to a different Supabase identity", async () => {
    db.findFirst.mockResolvedValue({
      id: "approved",
      email: "gil@example.invalid",
      authUserId: "original-auth",
      role: "KNOWLEDGE_ADMIN",
    });
    expect(
      await resolveApplicationUser({
        email_confirmed_at: "2026-10-17T00:00:00Z",
        id: "different-auth",
        email: "gil@example.invalid",
      }),
    ).toBeNull();
    expect(db.update).not.toHaveBeenCalled();
  });
  it("retains an existing matching binding", async () => {
    const profile = {
      id: "approved",
      email: "gil@example.invalid",
      authUserId: "original-auth",
      role: "SALES_USER",
    };
    db.findFirst.mockResolvedValue(profile);
    expect(
      await resolveApplicationUser({
        email_confirmed_at: "2026-10-17T00:00:00Z",
        id: "original-auth",
        email: profile.email,
      }),
    ).toEqual(profile);
    expect(db.update).not.toHaveBeenCalled();
  });
  it("binds only an unbound preapproved profile, using an atomic null guard", async () => {
    db.findFirst.mockResolvedValue({
      id: "approved",
      email: "gil@example.invalid",
      authUserId: null,
    });
    db.update.mockResolvedValue({ id: "approved" });
    await resolveApplicationUser({
      email_confirmed_at: "2026-10-17T00:00:00Z",
      id: "new-auth",
      email: "gil@example.invalid",
    });
    expect(db.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "approved", authUserId: null },
        data: { authUserId: "new-auth", email: "gil@example.invalid" },
      }),
    );
  });
  it("does not provision an unapproved user", async () => {
    db.findFirst.mockResolvedValue(null);
    expect(
      await resolveApplicationUser({
        email_confirmed_at: "2026-10-17T00:00:00Z",
        id: "unknown-auth",
        email: "unknown@example.invalid",
      }),
    ).toBeNull();
    expect(db.update).not.toHaveBeenCalled();
  });
});
it.each([undefined, null, "not-a-date"])(
  "does not bind an unverified Auth email (%s)",
  async (email_confirmed_at) => {
    db.findFirst.mockResolvedValue({
      id: "approved",
      email: "gil@example.invalid",
      authUserId: null,
    });
    expect(
      await resolveApplicationUser({
        id: "new-auth",
        email: "gil@example.invalid",
        email_confirmed_at,
      }),
    ).toBeNull();
    expect(db.findFirst).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  },
);
it("denies anonymous identity despite a claimed email confirmation", async () => {
  expect(
    await resolveApplicationUser({
      id: "anonymous",
      email: "gil@example.invalid",
      email_confirmed_at: "2026-10-17T00:00:00Z",
      is_anonymous: true,
    }),
  ).toBeNull();
  expect(db.update).not.toHaveBeenCalled();
});
