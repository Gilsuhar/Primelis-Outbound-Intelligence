// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ signedIn: true, verify: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({
  getCurrentUser: async () => (state.signedIn ? { id: "operator" } : null),
}));
vi.mock("@/server/verification/service", () => ({ retryVerification: state.verify }));
import { POST } from "./route";
const request = (data: unknown, origin = "https://preview.example") =>
  new Request("https://preview.example/api/sales-agent/verification", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
const body = { contactId: "fictional-42", kind: "EMAIL", requestKey: "fixture-0001" };
beforeEach(() => {
  state.signedIn = true;
  vi.clearAllMocks();
  vi.stubEnv("INTEGRATION_OPERATOR_USER_ID", "operator");
});
afterEach(() => vi.unstubAllEnvs());
describe("safe explicit verification actions", () => {
  it("requires sign-in, operator binding, same origin and Preview", async () => {
    state.signedIn = false;
    expect((await POST(request(body))).status).toBe(401);
    state.signedIn = true;
    expect((await POST(request(body, "https://foreign.example"))).status).toBe(403);
    vi.stubEnv("INTEGRATION_OPERATOR_USER_ID", "other");
    expect((await POST(request(body))).status).toBe(403);
    vi.stubEnv("INTEGRATION_OPERATOR_USER_ID", "operator");
    vi.stubEnv("VERCEL_ENV", "production");
    expect((await POST(request(body))).status).toBe(403);
    expect(state.verify).not.toHaveBeenCalled();
  });
  it("never accepts a browser verification result, provider URL, token or CRM change", async () => {
    for (const addition of [
      { status: "VERIFIED" },
      { token: "fixture-secret" },
      { url: "https://foreign.example" },
      { email: "changed@example.com" },
    ])
      expect((await POST(request({ ...body, ...addition }))).status).toBe(400);
    expect(state.verify).not.toHaveBeenCalled();
  });
  it("binds a valid request to the authenticated operator and emits only safe errors", async () => {
    state.verify.mockResolvedValueOnce({ started: true, message: "Evidence collected" });
    expect((await POST(request(body))).status).toBe(200);
    expect(state.verify).toHaveBeenCalledWith("operator", body.contactId, "EMAIL", body.requestKey);
    state.verify.mockRejectedValueOnce(new Error("fixture-secret"));
    const response = await POST(request(body));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("fixture-secret");
  });
});
