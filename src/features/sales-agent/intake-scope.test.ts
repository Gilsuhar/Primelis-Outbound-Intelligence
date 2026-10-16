import { describe, expect, it } from "vitest";
import { isInOwnedIntakeScope } from "./intake-scope";
import { collectedContact } from "@/test/sales-agent-collection-fixtures";
describe("newly added or assigned owner scope", () => {
  it("admits dated creation or reassignment, never generic last activity", () => {
    expect(isInOwnedIntakeScope(collectedContact)).toBe(true);
    expect(
      isInOwnedIntakeScope({
        ...collectedContact,
        hubspotCreatedAt: "2020-01-01T00:00:00Z",
        ownerAssignedAt: "2026-10-15T02:00:00Z",
      }),
    ).toBe(true);
    expect(
      isInOwnedIntakeScope({ ...collectedContact, hubspotCreatedAt: "2020-01-01T00:00:00Z" }),
    ).toBe(false);
  });
  it("rejects missing/future/malformed dates and other owners", () => {
    for (const change of [
      { ownerId: "other" },
      { intakeSince: undefined },
      { hubspotCreatedAt: undefined },
      { hubspotCreatedAt: "2026-10-16T00:00:00Z" },
      { intakeSince: "unknown" },
    ])
      expect(isInOwnedIntakeScope({ ...collectedContact, ...change })).toBe(false);
  });
});
