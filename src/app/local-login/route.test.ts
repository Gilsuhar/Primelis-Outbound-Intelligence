// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ $executeRaw: vi.fn(), user: { findFirst: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
import { GET, POST } from "./route";
const token = "fictional-local-session-for-unit-tests-only";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("LOCAL_DEV_LOGIN", "true");
  vi.stubEnv("LOCAL_DEV_SESSION_TOKEN", token);
  vi.stubEnv("DATABASE_URL", "postgresql://local@localhost:5432/agent_workforce_test");
  for (const key of ["VERCEL", "VERCEL_ENV", "NEXT_PUBLIC_VERCEL_ENV"]) vi.stubEnv(key, "");
});
afterEach(() => vi.unstubAllEnvs());
function request(origin = "http://127.0.0.1:3000") {
  return new Request("http://127.0.0.1:3000/local-login", {
    method: "POST",
    headers: { host: "127.0.0.1:3000", origin },
  });
}
it("denies cross-origin login before database writes", async () => {
  expect((await POST(request("https://foreign.example"))).status).toBe(403);
  expect(db.$executeRaw).not.toHaveBeenCalled();
});
it("is absent in production before database writes", async () => {
  vi.stubEnv("NODE_ENV", "production");
  expect(GET(request()).status).toBe(404);
  expect((await POST(request())).status).toBe(404);
  expect(db.$executeRaw).not.toHaveBeenCalled();
});
it("issues only a local HttpOnly strict session after the labeled profile is verified", async () => {
  db.user.findFirst.mockResolvedValue({ id: "local-development-agent-workforce" });
  const r = await POST(request());
  expect(r.status).toBe(303);
  expect(db.$executeRaw).toHaveBeenCalledOnce();
  expect(r.headers.get("set-cookie")).toContain(`primelis-local-development=${token}`);
  expect(r.headers.get("set-cookie")).toContain("HttpOnly");
  expect(r.headers.get("set-cookie")).toContain("SameSite=strict");
});
it("refuses a conflicting profile without issuing a cookie", async () => {
  db.user.findFirst.mockResolvedValue(null);
  const r = await POST(request());
  expect(r.status).toBe(409);
  expect(r.headers.get("set-cookie")).toBeNull();
});
