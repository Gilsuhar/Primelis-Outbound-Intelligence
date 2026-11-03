// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth/server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/auth/local-development", () => ({
  localDevelopmentConfig: vi.fn(),
  localDevelopmentHost: () => true,
  localDevelopmentOrigin: () => "https://localhost:3000",
}));
vi.mock("@/server/prospect-recycler/review-live", () => ({ liveRecyclerReview: vi.fn() }));
import { getCurrentUser } from "@/lib/auth/server";
import { localDevelopmentConfig } from "@/lib/auth/local-development";
import { liveRecyclerReview } from "@/server/prospect-recycler/review-live";
import { POST } from "./route";
const request = (
  body: unknown = { action: "READ_FIVE", source: "BOTH" },
  origin = "https://localhost:3000",
) =>
  new Request("https://localhost:3000/api/sales-agent/recycler", {
    method: "POST",
    headers: { origin, host: "localhost:3000" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("INTEGRATION_OPERATOR_USER_ID", "operator");
  vi.stubEnv("LOCAL_DEV_HTTPS", "true");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("COMPANY_PILOT_ENABLED", "false");
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: "operator",
    email: "operator@example.com",
    role: "SALES_USER",
  });
  vi.mocked(localDevelopmentConfig).mockReturnValue(true as never);
  vi.mocked(liveRecyclerReview).mockResolvedValue({
    mode: "LIVE",
    evaluatedAt: "2026-10-25T09:00:00Z",
    rows: [],
    issues: [],
    discovery: [],
  });
});
afterEach(() => vi.unstubAllEnvs());
describe("Recycler route boundary", () => {
  it("uses the authenticated operator and no-store response", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(liveRecyclerReview).toHaveBeenCalledWith("operator", "BOTH");
  });
  it("rejects unauthenticated and nonoperator access before collection", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "other",
      email: "other@example.com",
      role: "SALES_USER",
    });
    expect((await POST(request())).status).toBe(403);
    expect(liveRecyclerReview).not.toHaveBeenCalled();
  });
  it("rejects cross-origin, missing-origin and nonlocal requests", async () => {
    expect((await POST(request(undefined, "https://evil.example"))).status).toBe(403);
    expect((await POST(request(undefined, ""))).status).toBe(403);
    vi.mocked(localDevelopmentConfig).mockReturnValue(null);
    expect((await POST(request())).status).toBe(403);
    expect(liveRecyclerReview).not.toHaveBeenCalled();
  });
  it.each([
    { action: "SEND", source: "BOTH" },
    { action: "READ_FIVE", source: "BOTH", limit: 50 },
    { action: "READ_FIVE", source: "BOTH", evidence: {} },
    { action: "READ_FIVE", source: "BOTH", actorId: "other" },
  ])("rejects unsupported commands or evidence overrides", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(liveRecyclerReview).not.toHaveBeenCalled();
  });
  it("returns a sanitized failure without leaking credentials", async () => {
    vi.mocked(liveRecyclerReview).mockRejectedValue(new Error("secret-token-forbidden"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret-token-forbidden");
  });
});
