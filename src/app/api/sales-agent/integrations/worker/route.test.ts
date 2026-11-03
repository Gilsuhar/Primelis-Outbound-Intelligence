import { it, expect, vi, afterEach } from "vitest";
const drain = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/server/integrations/worker", () => ({ drainSync: drain }));
import { POST } from "./route";
const secret = "fictional-worker-test-only-at-least-thirty-two-characters";
const request = (actor = "operator", token = secret) =>
  new Request("https://feature.vercel.app/api/sales-agent/integrations/worker", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ actorId: actor, provider: "HUBSPOT" }),
  });
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("rejects unauthenticated worker requests", async () => {
  vi.stubEnv("INTEGRATION_WORKER_SECRET", secret);
  expect((await POST(request("operator", "incorrect"))).status).toBe(401);
  expect(drain).not.toHaveBeenCalled();
});
it("rejects worker actor spoofing before constructing an integration", async () => {
  vi.stubEnv("INTEGRATION_WORKER_SECRET", secret);
  vi.stubEnv("INTEGRATION_OPERATOR_USER_ID", "operator");
  expect((await POST(request("different-user"))).status).toBe(403);
  expect(drain).not.toHaveBeenCalled();
});
it("rejects Production requests even with the correct worker secret", async () => {
  vi.stubEnv("INTEGRATION_WORKER_SECRET", secret);
  vi.stubEnv("VERCEL_ENV", "production");
  expect((await POST(request())).status).toBe(403);
  expect(drain).not.toHaveBeenCalled();
});
it("allows a correctly authorized operator worker", async () => {
  vi.stubEnv("INTEGRATION_WORKER_SECRET", secret);
  vi.stubEnv("INTEGRATION_OPERATOR_USER_ID", "operator");
  expect((await POST(request())).status).toBe(200);
  expect(drain).toHaveBeenCalledWith("operator", "HUBSPOT");
});
