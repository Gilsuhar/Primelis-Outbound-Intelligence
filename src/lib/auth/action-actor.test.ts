import { describe, expect, it, vi } from "vitest";

import { requireCurrentUser, requireRole } from "@/lib/auth/server";

import { withAuthenticatedCreator, withAuthenticatedReviewActor } from "./action-actor";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/server", () => ({
  requireCurrentUser: vi.fn(),
  requireRole: vi.fn(),
}));

const mockedRequireCurrentUser = vi.mocked(requireCurrentUser);
const mockedRequireRole = vi.mocked(requireRole);

describe("server action actor helpers", () => {
  it("uses the authenticated user as creator instead of a client supplied creatorId", async () => {
    mockedRequireCurrentUser.mockResolvedValueOnce({
      id: "session-sales-user",
      email: "seller@example.com",
      role: "SALES_USER",
    });

    const result = await withAuthenticatedCreator({
      creatorId: "client-spoof",
      title: "Submission",
    });

    expect(result.input).toMatchObject({
      creatorId: "session-sales-user",
      title: "Submission",
    });
  });

  it("requires the knowledge-admin role for review actor actions", async () => {
    mockedRequireRole.mockResolvedValueOnce({
      id: "session-admin-user",
      email: "admin@example.com",
      role: "KNOWLEDGE_ADMIN",
    });

    const result = await withAuthenticatedReviewActor({
      actorId: "client-sales-user",
      creatorId: "client-sales-user",
      action: "APPROVE",
    });

    expect(mockedRequireRole).toHaveBeenCalledWith("KNOWLEDGE_ADMIN");
    expect(result.input).toMatchObject({
      actorId: "session-admin-user",
      creatorId: "session-admin-user",
      action: "APPROVE",
    });
  });
});
