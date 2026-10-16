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
      await resolveApplicationUser({ id: "different-auth", email: "gil@example.invalid" }),
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
    expect(await resolveApplicationUser({ id: "original-auth", email: profile.email })).toEqual(
      profile,
    );
    expect(db.update).not.toHaveBeenCalled();
  });
  it("binds only an unbound preapproved profile, using an atomic null guard", async () => {
    db.findFirst.mockResolvedValue({
      id: "approved",
      email: "gil@example.invalid",
      authUserId: null,
    });
    db.update.mockResolvedValue({ id: "approved" });
    await resolveApplicationUser({ id: "new-auth", email: "gil@example.invalid" });
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
      await resolveApplicationUser({ id: "unknown-auth", email: "unknown@example.invalid" }),
    ).toBeNull();
    expect(db.update).not.toHaveBeenCalled();
  });
});
