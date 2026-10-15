import { describe, expect, it } from "vitest";
import { getAppUrl } from "@/lib/auth/env";

describe("getAppUrl", () => {
  it("uses the branch preview domain instead of production for OAuth callbacks", () => {
    expect(getAppUrl({ VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "primelis-git-test-team.vercel.app", NEXT_PUBLIC_APP_URL: "https://primelis-outbound-intelligence.vercel.app" } as NodeJS.ProcessEnv)).toBe("https://primelis-git-test-team.vercel.app");
  });

  it("falls back to the deployment URL in preview", () => {
    expect(getAppUrl({ VERCEL_ENV: "preview", VERCEL_URL: "primelis-test-team.vercel.app", NEXT_PUBLIC_APP_URL: "https://production.example" } as NodeJS.ProcessEnv)).toBe("https://primelis-test-team.vercel.app");
  });

  it("keeps the configured URL in production", () => {
    expect(getAppUrl({ VERCEL_ENV: "production", VERCEL_URL: "preview.vercel.app", NEXT_PUBLIC_APP_URL: "https://production.example" } as NodeJS.ProcessEnv)).toBe("https://production.example");
  });

  it("does not trust an arbitrary preview host", () => {
    expect(getAppUrl({ VERCEL_ENV: "preview", VERCEL_URL: "evil.example", NEXT_PUBLIC_APP_URL: "https://production.example" } as NodeJS.ProcessEnv)).toBe("https://production.example");
  });
});
