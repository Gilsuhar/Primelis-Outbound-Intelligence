// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/server", () => ({ getCurrentUser: vi.fn() }));
import { getCurrentUser } from "@/lib/auth/server";
import { eligibleProspect, qualificationNow } from "@/test/sales-agent-fixtures";
import { POST } from "./route";

const request = (body: unknown) =>
  new Request("http://localhost/api/sales-agent/plan", {
    method: "POST",
    body: JSON.stringify(body),
  });

describe("authenticated sales agent planning API", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(qualificationNow);
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "sales-1",
      email: "sales@example.com",
      role: "SALES_USER",
    });
  });
  afterEach(() => vi.useRealTimers());

  it("requires a real application user before reading evidence", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const response = await POST(request(eligibleProspect));
    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe("UNAUTHENTICATED");
  });

  it("runs service and planner for authenticated requests", async () => {
    const response = await POST(request(eligibleProspect));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.data.decision.status).toBe("READY");
    expect(body.data.tasks).toHaveLength(4);
    expect(body.data.humanApproval.granted).toBe(false);
    expect(body.data.canSend).toBe(false);
  });

  it("returns HOLD for incomplete evidence", async () => {
    const response = await POST(request({}));
    expect(response.status).toBe(200);
    expect((await response.json()).data.decision.status).toBe("HOLD");
  });

  it("returns REJECTED without outbound tasks", async () => {
    const response = await POST(request({ ...eligibleProspect, unsubscribed: true }));
    const body = await response.json();
    expect(body.data.decision.status).toBe("REJECTED");
    expect(body.data.tasks).toEqual([]);
  });

  it("rejects malformed JSON and invalid types", async () => {
    expect(
      (
        await POST(
          new Request("http://localhost/api/sales-agent/plan", { method: "POST", body: "{" }),
        )
      ).status,
    ).toBe(400);
    expect((await POST(request({ outreachHistoryComplete: "true" }))).status).toBe(400);
  });

  it("rejects oversized payloads", async () => {
    expect((await POST(request({ role: "x".repeat(33_000) }))).status).toBe(413);
  });

  it("does not leak authentication errors", async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(new Error("private connection details"));
    const response = await POST(request({}));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("private connection");
  });
});
