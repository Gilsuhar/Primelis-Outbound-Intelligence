import { describe, expect, it } from "vitest";

import { claimFixtures } from "@/data/fixtures/knowledge-fixtures";

import { removeClaimSource, validateClaimForApproval } from "./invariants";

describe("claim invariants", () => {
  it("prevents factual claims without sources from being approved", () => {
    const claim = claimFixtures.find((item) => item.id === "missing-source-claim")!;

    expect(validateClaimForApproval(claim).ok).toBe(false);
  });

  it("supports multiple sources on approved claims", () => {
    const claim = claimFixtures.find((item) => item.id === "development-fixture")!;

    expect(claim.sourceIds.length).toBeGreaterThan(1);
    expect(validateClaimForApproval(claim).ok).toBe(true);
  });

  it("blocks removing the final source from an approved factual claim", () => {
    const claim = {
      ...claimFixtures.find((item) => item.id === "development-fixture")!,
      sourceIds: ["source-fixture-overview"],
    };
    const result = removeClaimSource(claim, "source-fixture-overview");

    expect(result.ok).toBe(false);
    expect(result.claim.sourceIds).toEqual(["source-fixture-overview"]);
  });
});
