import { describe, expect, it } from "vitest";

const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!hasTestDatabase)("Prisma integration harness", () => {
  it("requires TEST_DATABASE_URL-backed setup before running database assertions", () => {
    expect(process.env.TEST_DATABASE_URL).toBeTruthy();
  });
});
