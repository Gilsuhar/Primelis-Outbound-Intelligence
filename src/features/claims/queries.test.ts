import { describe, expect, it } from "vitest";

import { getClaimDetailsState } from "./queries";

describe("claim detail queries", () => {
  it("returns not-found behavior for unknown claim IDs", () => {
    expect(getClaimDetailsState("unknown-claim-id")).toBe("NOT_FOUND");
  });

  it("flags restricted claims", () => {
    const state = getClaimDetailsState("restricted-fixture-claim");

    expect(state).not.toBe("NOT_FOUND");
    if (state !== "NOT_FOUND") {
      expect(state.warnings.restricted).toBe(true);
    }
  });

  it("flags claims missing source support", () => {
    const state = getClaimDetailsState("missing-source-claim");

    expect(state).not.toBe("NOT_FOUND");
    if (state !== "NOT_FOUND") {
      expect(state.warnings.missingSource).toBe(true);
    }
  });
});
