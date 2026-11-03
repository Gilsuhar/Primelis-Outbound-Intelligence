// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
const token = "fictional-local-session-for-unit-tests-only";
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("LOCAL_DEV_LOGIN", "true");
  vi.stubEnv("LOCAL_DEV_SESSION_TOKEN", token);
  vi.stubEnv("DATABASE_URL", "postgresql://local@localhost:5432/agent_workforce_test");
  for (const n of ["VERCEL", "VERCEL_ENV", "NEXT_PUBLIC_VERCEL_ENV"]) vi.stubEnv(n, "");
});
afterEach(() => vi.unstubAllEnvs());
it("allows only the opt-in HTTPS callback GET without relaxing the Strict app session or integration blocks", async () => {
  vi.stubEnv("LOCAL_DEV_HTTPS", "true");
  vi.stubEnv("LOCAL_OUTREACH_OAUTH_ENABLED", "true");
  const make = (path: string, method = "GET") =>
    new NextRequest(`https://127.0.0.1:3000${path}`, {
      method,
      headers: { host: "127.0.0.1:3000" },
    });
  expect((await updateSession(make("/api/outreach/oauth/callback"))).status).toBe(200);
  expect((await updateSession(make("/api/outreach/oauth/callback", "POST"))).status).toBe(401);
  expect((await updateSession(make("/api/outreach/oauth"))).status).toBe(401);
  expect((await updateSession(make("/api/sales-agent/integrations"))).status).toBe(403);
  expect((await updateSession(make("/api/sales-agent/daily/worker", "POST"))).status).toBe(403);
  expect((await updateSession(req("/api/outreach/oauth/callback", "wrong"))).status).toBe(401);
});
function req(path: string, session = token, host = "127.0.0.1:3000", method = "GET") {
  return new NextRequest(`http://${host}${path}`, {
    method,
    headers: { host, cookie: `primelis-local-development=${session}` },
  });
}
it("protects the local workspace until the exact session is present", async () => {
  expect((await updateSession(req("/sales-agent", "wrong"))).headers.get("location")).toContain(
    "/local-login",
  );
  expect((await updateSession(req("/sales-agent"))).status).toBe(200);
});
it.each([
  "/api/sales-agent/daily/worker",
  "/api/sales-agent/integrations",
  "/api/sales-agent/prospect-research/worker",
])("refuses disabled background/integration endpoint %s even with a session", async (path) => {
  expect((await updateSession(req(path, token, "127.0.0.1:3000", "POST"))).status).toBe(403);
});
it("refuses a non-loopback Host even with a valid cookie", async () => {
  expect((await updateSession(req("/sales-agent", token, "foreign.example:3000"))).status).toBe(
    404,
  );
});
