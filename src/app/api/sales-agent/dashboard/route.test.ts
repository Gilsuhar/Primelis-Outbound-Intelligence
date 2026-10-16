// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth/server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/server/agent-workforce/dashboard/service", () => ({
  getWorkforceDashboard: vi.fn(),
  markProspectReviewed: vi.fn(),
}));
import { getCurrentUser } from "@/lib/auth/server";
import {
  getWorkforceDashboard,
  markProspectReviewed,
} from "@/server/agent-workforce/dashboard/service";
import { GET, POST } from "./route";
const request = (
  body: unknown = { action: "MARK_REVIEWED", contactId: "42" },
  origin = "https://preview.example",
) =>
  new Request("https://preview.example/api/sales-agent/dashboard", {
    method: "POST",
    headers: origin ? { origin } : {},
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: "session-actor",
    email: "test@example.com",
    role: "SALES_USER",
  });
  vi.mocked(getWorkforceDashboard).mockResolvedValue(
    {} as Awaited<ReturnType<typeof getWorkforceDashboard>>,
  );
});
afterEach(() => vi.unstubAllEnvs());
describe("dashboard authentication and local-only review boundary", () => {
  it("authenticates before reads/writes and scopes data to the session actor", async () => {
    const response = await GET();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(getWorkforceDashboard).toHaveBeenCalledWith("session-actor");
    await POST(request());
    expect(markProspectReviewed).toHaveBeenCalledWith("session-actor", "42");
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await POST(request())).status).toBe(401);
  });
  it("blocks cross-origin, missing-origin and Production writes", async () => {
    expect((await POST(request({}, ""))).status).toBe(403);
    expect((await POST(request({}, "https://foreign.example"))).status).toBe(403);
    vi.stubEnv("VERCEL_ENV", "production");
    expect((await POST(request())).status).toBe(403);
    expect(markProspectReviewed).not.toHaveBeenCalled();
  });
  it("rejects actor overrides, approvals and CRM mutation commands", async () => {
    for (const body of [
      { action: "MARK_REVIEWED", contactId: "42", actorId: "other" },
      { action: "SEND", contactId: "42" },
      { action: "MARK_REVIEWED", contactId: "42", approved: true },
    ])
      expect((await POST(request(body))).status).toBe(400);
    expect(markProspectReviewed).not.toHaveBeenCalled();
  });
});
