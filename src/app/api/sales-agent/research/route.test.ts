// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth/server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/server/services/sales-agent-research-service", () => ({
  saveSalesAgentResearch: vi.fn(),
}));
import { getCurrentUser } from "@/lib/auth/server";
import { saveSalesAgentResearch } from "@/server/services/sales-agent-research-service";
import { POST } from "./route";
const request = (body: string, origin?: string) =>
  new Request("https://app.example/api/sales-agent/research", {
    method: "POST",
    body,
    headers: origin ? { origin } : {},
  });
beforeEach(() => {
  vi.stubEnv("INTEGRATION_OPERATOR_USER_ID", "signed-in-actor");
  vi.clearAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: "signed-in-actor",
    email: "test@example.com",
    role: "SALES_USER",
  });
  vi.mocked(saveSalesAgentResearch).mockResolvedValue({ ok: true, data: { saved: true } });
});
afterEach(() => vi.unstubAllEnvs());
describe("manual research route security", () => {
  it("authenticates before touching storage", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await POST(request("{}", "https://app.example"))).status).toBe(401);
    expect(saveSalesAgentResearch).not.toHaveBeenCalled();
  });
  it.each([undefined, "https://foreign.example"])(
    "rejects absent or foreign Origin: %s",
    async (origin) => {
      expect((await POST(request("{}", origin))).status).toBe(403);
      expect(saveSalesAgentResearch).not.toHaveBeenCalled();
    },
  );
  it("rejects oversized or malformed payloads", async () => {
    expect((await POST(request("x".repeat(8001), "https://app.example"))).status).toBe(413);
    expect((await POST(request("{", "https://app.example"))).status).toBe(400);
    expect(saveSalesAgentResearch).not.toHaveBeenCalled();
  });
  it("uses the session actor and returns no-store", async () => {
    const response = await POST(request('{"contactId":"42"}', "https://app.example"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(saveSalesAgentResearch).toHaveBeenCalledWith("signed-in-actor", { contactId: "42" });
  });
  it("returns a generic error without leaking storage details", async () => {
    vi.mocked(saveSalesAgentResearch).mockRejectedValue(new Error("sensitive-database-value"));
    const response = await POST(request("{}", "https://app.example"));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("sensitive-database-value");
  });
});

it("rejects a different approved operator before persistence", async () => {
  vi.stubEnv("INTEGRATION_OPERATOR_USER_ID", "another-user");
  expect((await POST(request("{}", "https://app.example"))).status).toBe(403);
  expect(saveSalesAgentResearch).not.toHaveBeenCalled();
});
