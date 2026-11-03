import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localDevelopmentConfig, localDevelopmentSession } from "./local-development";
const token = "fictional-local-session-for-unit-tests-only";
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("LOCAL_DEV_LOGIN", "true");
  vi.stubEnv("LOCAL_DEV_SESSION_TOKEN", token);
  vi.stubEnv("DATABASE_URL", "postgresql://local@localhost:5432/agent_workforce_test");
  for (const name of ["VERCEL", "VERCEL_ENV", "NEXT_PUBLIC_VERCEL_ENV"]) vi.stubEnv(name, "");
});
afterEach(() => vi.unstubAllEnvs());
describe("localhost development identity isolation", () => {
  it("requires an exact session and loopback host", () => {
    expect(localDevelopmentSession("127.0.0.1:3000", token)).toBe(true);
    expect(localDevelopmentSession("localhost:3000", "wrong")).toBe(false);
    expect(localDevelopmentSession("attacker.example:3000", token)).toBe(false);
    expect(localDevelopmentSession("127.0.0.1:4000", token)).toBe(false);
  });
  it.each(["production", "test"])("cannot activate in %s", (mode) => {
    vi.stubEnv("NODE_ENV", mode);
    expect(localDevelopmentConfig()).toBeNull();
  });
  it.each(["VERCEL", "VERCEL_ENV", "NEXT_PUBLIC_VERCEL_ENV"])(
    "cannot activate under %s",
    (name) => {
      vi.stubEnv(name, "preview");
      expect(localDevelopmentConfig()).toBeNull();
    },
  );
  it.each([
    "postgresql://local@db.ofxqdwpyqbvskrcfpdmx.supabase.co:5432/agent_workforce_test",
    "postgresql://local@localhost:5432/postgres",
    "postgresql://local@localhost:5433/agent_workforce_test",
    "postgresql://local@localhost:5432/agent_workforce_test?host=remote.example",
  ])("refuses a different database target: %s", (url) => {
    vi.stubEnv("DATABASE_URL", url);
    expect(localDevelopmentConfig()).toBeNull();
  });
  it("is opt-in and requires a session token", () => {
    vi.stubEnv("LOCAL_DEV_LOGIN", "false");
    expect(localDevelopmentConfig()).toBeNull();
    vi.stubEnv("LOCAL_DEV_LOGIN", "true");
    vi.stubEnv("LOCAL_DEV_SESSION_TOKEN", "");
    expect(localDevelopmentConfig()).toBeNull();
  });
});
