// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  actor: "operator" as string | null,
  enqueue: vi.fn(),
  get: vi.fn(),
  drain: vi.fn(),
  after: vi.fn(),
}));
vi.mock("@/lib/auth/server", () => ({
  getCurrentUser: async () => (state.actor ? { id: state.actor } : null),
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: state.after,
}));
vi.mock("@/server/agent-workforce/prospect-research/engine", () => ({
  ProspectResearchEngine: class {
    enqueue = state.enqueue;
    store = { get: state.get };
  },
}));
vi.mock("@/server/agent-workforce/prospect-research/worker", () => ({
  drainProspectResearch: state.drain,
}));
import { POST } from "./route";
const request = (body: unknown, origin = "https://preview.example") =>
  new Request("https://preview.example/api/sales-agent/prospect-research", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  state.actor = "operator";
  vi.stubEnv("INTEGRATION_OPERATOR_USER_ID", "operator");
  vi.stubEnv("VERCEL_ENV", "preview");
});
afterEach(() => vi.unstubAllEnvs());
describe("authenticated read-only research execution routes", () => {
  it("requires authenticated operator, same-origin and non-Production execution", async () => {
    state.actor = null;
    expect((await POST(request({ contactId: "42" }))).status).toBe(401);
    state.actor = "operator";
    expect((await POST(request({ contactId: "42" }, "https://foreign.example"))).status).toBe(403);
    state.actor = "other";
    expect((await POST(request({ contactId: "42" }))).status).toBe(403);
    state.actor = "operator";
    vi.stubEnv("VERCEL_ENV", "production");
    expect((await POST(request({ contactId: "42" }))).status).toBe(403);
    expect(state.enqueue).not.toHaveBeenCalled();
    expect(state.after).not.toHaveBeenCalled();
  });
  it("rejects browser-supplied research, credentials, identity overrides and side effects", async () => {
    for (const field of [
      { companyName: "Injected" },
      { companyDomain: "other.example" },
      { sources: [] },
      { token: "secret" },
      { send: true },
      { approved: true },
    ])
      expect((await POST(request({ contactId: "42", ...field }))).status).toBe(400);
    expect(state.enqueue).not.toHaveBeenCalled();
  });
  it("queues only synchronized HubSpot IDs and schedules a bounded background stage", async () => {
    state.enqueue.mockResolvedValueOnce({
      records: [{ contactId: "42", runId: "run-42" }],
      next: null,
    });
    const response = await POST(request({ contactId: "42" }));
    expect(response.status).toBe(202);
    expect(state.enqueue).toHaveBeenCalledWith("operator", { contactId: "42" });
    await state.after.mock.calls[0][0]();
    expect(state.drain).toHaveBeenCalledWith("operator", "run-42");
  });
  it("does not schedule another actor's or a legacy run and withholds exception details", async () => {
    state.get.mockResolvedValueOnce(null);
    expect((await POST(request({ runId: "foreign-run" }))).status).toBe(404);
    expect(state.after).not.toHaveBeenCalled();
    state.enqueue.mockRejectedValueOnce(new Error("secret fixture token"));
    const response = await POST(request({ contactId: "42" }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret fixture token");
  });
});
