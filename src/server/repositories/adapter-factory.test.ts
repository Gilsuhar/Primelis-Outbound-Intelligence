import { afterEach, describe, expect, it, vi } from "vitest";

import { getPersistenceAdapter } from "./adapter-factory";

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  vi.unstubAllEnvs();
  if (originalDatabaseUrl) {
    vi.stubEnv("DATABASE_URL", originalDatabaseUrl);
  }
  vi.stubEnv("NODE_ENV", originalNodeEnv ?? "test");
});

describe("persistence adapter factory", () => {
  it("uses fixture mode when DATABASE_URL is unavailable outside production", () => {
    delete process.env.DATABASE_URL;
    vi.stubEnv("NODE_ENV", "test");

    expect(getPersistenceAdapter().mode).toBe("fixture");
  });

  it("uses Prisma mode when DATABASE_URL is configured", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:password@localhost:5432/db?schema=public");
    vi.stubEnv("NODE_ENV", "test");

    expect(getPersistenceAdapter().mode).toBe("prisma");
  });

  it("does not silently use fixture mode in production", () => {
    delete process.env.DATABASE_URL;
    vi.stubEnv("NODE_ENV", "production");

    expect(() => getPersistenceAdapter()).toThrow("DATABASE_URL is required in production");
  });
});
