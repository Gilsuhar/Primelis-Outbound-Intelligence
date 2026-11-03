import { describe, expect, it } from "vitest";

import { safeClientErrorMessage } from "./ui-errors";

describe("safeClientErrorMessage", () => {
  it("hides provider, database, and stack details from client-facing messages", () => {
    expect(safeClientErrorMessage("PrismaClientKnownRequestError: invalid query")).toMatch(
      /Something went wrong/i,
    );
    expect(safeClientErrorMessage("OPENAI_API_KEY is missing")).toMatch(/Something went wrong/i);
    expect(safeClientErrorMessage("TypeError: Cannot read properties at app.ts:10:2")).toMatch(
      /Something went wrong/i,
    );
  });

  it("keeps safe business messages and shortens very long messages", () => {
    expect(safeClientErrorMessage("Complete these fields first: Company.")).toBe(
      "Complete these fields first: Company.",
    );
    expect(safeClientErrorMessage("A".repeat(300))).toHaveLength(220);
  });
});
