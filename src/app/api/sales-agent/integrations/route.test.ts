// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  signedIn: true,
  checks: vi.fn(),
  starts: vi.fn(),
  after: vi.fn(),
}));
vi.mock("@/lib/auth/server", () => ({
  getCurrentUser: async () => (state.signedIn ? { id: "fixture-actor" } : null),
}));
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: state.after,
}));
vi.mock("@/server/integrations/sync", () => ({
  IntegrationSync: class {
    check = state.checks;
    start = state.starts;
    store = { get: async () => ({ state: { status: "CONNECTED" } }) };
  },
}));
import { POST } from "./route";
import { POST as worker } from "./worker/route";
const request = (body: unknown, origin = "https://preview.example") =>
  new Request("https://preview.example/api/sales-agent/integrations", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  state.signedIn = true;
});
afterEach(() => vi.unstubAllEnvs());
describe("authenticated read-only sync actions", () => {
  it("rejects signed-out, cross-origin and Production requests before provider calls", async () => {
    state.signedIn = false;
    expect((await POST(request({ provider: "HUBSPOT", action: "CHECK" }))).status).toBe(401);
    state.signedIn = true;
    expect(
      (await POST(request({ provider: "HUBSPOT", action: "CHECK" }, "https://foreign.example")))
        .status,
    ).toBe(403);
    vi.stubEnv("VERCEL_ENV", "production");
    expect((await POST(request({ provider: "HUBSPOT", action: "CHECK" }))).status).toBe(403);
    expect(state.checks).not.toHaveBeenCalled();
    expect(state.starts).not.toHaveBeenCalled();
  });
  it("rejects send/enrollment/provider-write operations and requires idempotency", async () => {
    for (const action of ["SEND", "ENROLL", "UPDATE_CONTACT"])
      expect((await POST(request({ provider: "OUTREACH", action }))).status).toBe(400);
    expect((await POST(request({ provider: "OUTREACH", action: "INITIAL" }))).status).toBe(400);
    expect(state.starts).not.toHaveBeenCalled();
  });
  it("queues only the authorized actor's background read sync", async () => {
    expect(
      (await POST(request({ provider: "HUBSPOT", action: "INITIAL", requestKey: "fixture-0001" })))
        .status,
    ).toBe(202);
    expect(state.starts).toHaveBeenCalledWith("HUBSPOT", "INITIAL", "fixture-0001");
    expect(state.after).toHaveBeenCalledTimes(1);
  });
  it("protects worker execution with a strong server-only bearer and disables Production", async () => {
    expect((await worker(request({ actorId: "fixture-actor", provider: "HUBSPOT" }))).status).toBe(
      401,
    );
    vi.stubEnv("INTEGRATION_WORKER_SECRET", "short");
    expect((await worker(request({ actorId: "fixture-actor", provider: "HUBSPOT" }))).status).toBe(
      401,
    );
    vi.stubEnv("VERCEL_ENV", "production");
    expect((await worker(request({}))).status).toBe(403);
  });
});
