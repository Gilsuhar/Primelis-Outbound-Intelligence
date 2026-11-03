import { afterEach, describe, it, expect, vi } from "vitest";
const tick = vi.hoisted(() => vi.fn(async () => null));
vi.mock("@/server/agent-workforce/daily/engine", () => ({
  DailyEngine: class {
    tick = tick;
  },
}));
import { POST } from "./route";
const secret = "fictional-worker-auth-for-isolated-tests-only";
const request = (auth?: string, body: unknown = {}) =>
  new Request("https://feature.vercel.app/api/sales-agent/daily/worker", {
    method: "POST",
    headers: auth ? { authorization: auth } : {},
    body: JSON.stringify(body),
  });
afterEach(() => {
  vi.unstubAllEnvs();
  tick.mockClear();
});
describe("daily worker authentication", () => {
  it.each([undefined, "Bearer incorrect"])("rejects unauthorized workers (%s)", async (auth) => {
    vi.stubEnv("INTEGRATION_WORKER_SECRET", secret);
    vi.stubEnv("INTEGRATION_OPERATOR_USER_ID", "actor");
    expect((await POST(request(auth))).status).toBe(401);
    expect(tick).not.toHaveBeenCalled();
  });
  it("rejects absent configuration and Production even with the correct bearer", async () => {
    vi.stubEnv("INTEGRATION_WORKER_SECRET", secret);
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("INTEGRATION_OPERATOR_USER_ID", "actor");
    expect((await POST(request(`Bearer ${secret}`))).status).toBe(401);
    expect(tick).not.toHaveBeenCalled();
  });
  it("accepts an authenticated empty wake-up for the server-configured operator", async () => {
    vi.stubEnv("INTEGRATION_WORKER_SECRET", secret);
    vi.stubEnv("INTEGRATION_OPERATOR_USER_ID", "actor");
    expect((await POST(request(`Bearer ${secret}`))).status).toBe(200);
    expect(tick).toHaveBeenCalledWith("actor", true);
  });
  it("rejects actor spoofing and arbitrary worker payloads", async () => {
    vi.stubEnv("INTEGRATION_WORKER_SECRET", secret);
    vi.stubEnv("INTEGRATION_OPERATOR_USER_ID", "actor");
    expect((await POST(request(`Bearer ${secret}`, { actorId: "someone-else" }))).status).toBe(503);
    expect(tick).not.toHaveBeenCalled();
  });
});
