// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth/server", () => ({ getCurrentUser: vi.fn() }));
import { getCurrentUser } from "@/lib/auth/server";
import { GET } from "./route";
afterEach(() => vi.unstubAllGlobals());
describe("explicit fictional demo endpoint", () => {
  it("requires the existing application authentication", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });
  it("uses all five isolated fixtures without HubSpot, prospect storage or outbound requests after authentication", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "reviewer",
      email: "reviewer@example.com",
      role: "SALES_USER",
    });
    const fetcher = vi.fn(() => {
      throw new Error("No external calls permitted");
    });
    vi.stubGlobal("fetch", fetcher);
    const response = await GET();
    const { data } = await response.json();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(data.rows).toHaveLength(5);
    expect(data.counts).toEqual({ READY: 1, HOLD: 2, REJECTED: 2 });
    expect(data.warnings.join(" ")).toContain("FICTIONAL TEST DATA");
    expect(data.rows[0].drafting.emails).toHaveLength(4);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
