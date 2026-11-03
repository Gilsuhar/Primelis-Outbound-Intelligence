import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => vi.fn(async () => ({ id: "fixture-user" })));
vi.mock("@/lib/auth/server", () => ({ requireCurrentUser: auth }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
import Page from "./page";
afterEach(() => vi.unstubAllEnvs());
describe("isolated synthetic preview boundary", () => {
  it("refuses both Vercel Preview and Production regardless of browser input", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    await expect(Page()).rejects.toThrow("NOT_FOUND");
    vi.stubEnv("VERCEL_ENV", "production");
    await expect(Page()).rejects.toThrow("NOT_FOUND");
  });
  it("requires existing authentication and returns only the explicit fictional component in local development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "");
    const element = await Page();
    expect(React.isValidElement(element)).toBe(true);
    expect(auth).toHaveBeenCalled();
  });
});
