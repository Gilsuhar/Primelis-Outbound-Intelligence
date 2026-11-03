// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fictionalCompanyEnv } from "@/server/agent-workforce/company-research/test-fixtures";
const state = vi.hoisted(() => ({ actor: "", list: vi.fn(), run: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({
  getCurrentUser: async () => (state.actor ? { id: state.actor } : null),
}));
vi.mock("@/server/agent-workforce/company-research/store", () => ({
  PrismaCompanyStore: class {
    list = state.list;
  },
}));
vi.mock("@/server/agent-workforce/company-research/service", () => ({
  runCompanyResearch: state.run,
}));
import { GET, POST } from "./route";
function request(
  method = "POST",
  origin = "http://127.0.0.1:3000",
  forwardedHost = "127.0.0.1:3000",
) {
  return new Request("http://localhost:3000/api/sales-agent/company-research", {
    method,
    headers: {
      host: "127.0.0.1:3000",
      origin,
      "x-forwarded-host": forwardedHost,
      "idempotency-key": "fictional-request-key-001",
    },
    ...(method === "POST"
      ? { body: JSON.stringify({ companyName: "Fictional Acme", companyDomain: "acme.example" }) }
      : {}),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  for (const [key, value] of Object.entries(fictionalCompanyEnv)) vi.stubEnv(key, value);
  state.actor = fictionalCompanyEnv.INTEGRATION_OPERATOR_USER_ID;
  state.list.mockResolvedValue([]);
  state.run.mockResolvedValue({ status: "REVIEW_REQUIRED" });
});
afterEach(() => vi.unstubAllEnvs());
it("requires authentication, configured operator and strict local origin before research", async () => {
  state.actor = "";
  expect((await POST(request())).status).toBe(401);
  state.actor = "other";
  expect((await POST(request())).status).toBe(403);
  state.actor = fictionalCompanyEnv.INTEGRATION_OPERATOR_USER_ID;
  expect((await POST(request("POST", "https://foreign.example"))).status).toBe(403);
  expect((await POST(request("POST", "http://127.0.0.1:3000", "foreign.example"))).status).toBe(
    403,
  );
  expect(state.run).not.toHaveBeenCalled();
});
it.each(["production", "preview"])("refuses %s even with an operator", async (environment) => {
  vi.stubEnv("VERCEL_ENV", environment);
  expect((await POST(request())).status).toBe(403);
  expect(state.run).not.toHaveBeenCalled();
});
it("uses the origin fix and sends only company input to the isolated service", async () => {
  expect((await POST(request())).status).toBe(200);
  expect(state.run).toHaveBeenCalledWith(
    state.actor,
    { companyName: "Fictional Acme", companyDomain: "acme.example" },
    "fictional-request-key-001",
  );
});
it("history remains readable with AI off without revealing configuration or calling a provider", async () => {
  vi.stubEnv("LOCAL_COMPANY_AI_ENABLED", "");
  const response = await GET(request("GET"));
  expect(await response.json()).toEqual({ ok: true, aiReady: false, runs: [] });
  expect(state.run).not.toHaveBeenCalled();
});
it("supports browser GET without Origin while retaining loopback and forwarded-host checks", async () => {
  const browserRead = request("GET");
  browserRead.headers.delete("origin");
  expect((await GET(browserRead)).status).toBe(200);
  const foreign = request("GET");
  foreign.headers.delete("origin");
  foreign.headers.set("host", "foreign.example");
  expect((await GET(foreign)).status).toBe(403);
  const forwarded = request("GET", "http://127.0.0.1:3000", "foreign.example");
  forwarded.headers.delete("origin");
  expect((await GET(forwarded)).status).toBe(403);
  expect((await GET(request("GET", "https://foreign.example"))).status).toBe(403);
  expect(state.run).not.toHaveBeenCalled();
});
it("withholds unexpected error details and returns safe configuration failures", async () => {
  state.run.mockRejectedValueOnce(new Error("fictional-secret-error"));
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("fictional-secret-error");
  state.run.mockRejectedValueOnce(new Error("COMPANY_AI_DISABLED"));
  expect((await POST(request())).status).toBe(503);
});
