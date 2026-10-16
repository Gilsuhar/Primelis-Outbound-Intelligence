// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth/server", () => ({ getCurrentUser: vi.fn() }));
const calls = vi.hoisted(() => ({
  list: vi.fn(),
  start: vi.fn(),
  advance: vi.fn(),
  get: vi.fn(),
  edit: vi.fn(),
}));
vi.mock("@/server/agent-workforce/orchestrator", () => ({
  WorkforceOrchestrator: class {
    store = { list: calls.list, get: calls.get };
    start = calls.start;
    advance = calls.advance;
    edit = calls.edit;
  },
}));
import { getCurrentUser } from "@/lib/auth/server";
import { GET, POST } from "./route";
import { PATCH } from "./[runId]/route";
import { POST as ADVANCE } from "./[runId]/advance/route";
const request = (
  body = "{}",
  origin: string | undefined = "https://preview.example",
  method = "POST",
) =>
  new Request("https://preview.example/api/sales-agent/workforce", {
    method,
    headers: origin ? { origin } : {},
    body,
  });
const context = { params: Promise.resolve({ runId: "owned-run" }) };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: "session-user",
    email: "test@example.com",
    role: "SALES_USER",
  });
  calls.list.mockResolvedValue([]);
  calls.start.mockResolvedValue({ id: "new-run" });
  calls.advance.mockResolvedValue({ id: "owned-run" });
  calls.edit.mockResolvedValue({ id: "owned-run" });
});
afterEach(() => vi.unstubAllEnvs());
describe("authenticated real-agent API boundary", () => {
  it("authenticates before storage, model execution or progress reads", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await POST(request())).status).toBe(401);
    expect((await ADVANCE(request(), context)).status).toBe(401);
    expect(calls.list).not.toHaveBeenCalled();
    expect(calls.start).not.toHaveBeenCalled();
    expect(calls.advance).not.toHaveBeenCalled();
  });
  it.each(["https://foreign.example", undefined])(
    "rejects cross-origin or missing-origin writes: %s",
    async (origin) => {
      expect((await POST(request("{}", origin ?? ""))).status).toBe(403);
      expect(calls.start).not.toHaveBeenCalled();
    },
  );
  it("uses only the session actor and no-store responses", async () => {
    const response = await POST(request('{"idempotencyKey":"test-request"}'));
    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(calls.start).toHaveBeenCalledWith("session-user", { idempotencyKey: "test-request" });
    await ADVANCE(request(), context);
    expect(calls.advance).toHaveBeenCalledWith("session-user", "owned-run");
    await PATCH(
      request('{"action":"REJECT","expectedVersion":1}', "https://preview.example", "PATCH"),
      context,
    );
    expect(calls.edit).toHaveBeenCalledWith("session-user", "owned-run", {
      action: "REJECT",
      expectedVersion: 1,
    });
  });
  it("blocks Gate A writes in Production without changing existing authentication", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect((await POST(request())).status).toBe(403);
    expect(calls.start).not.toHaveBeenCalled();
  });
  it("reports an eligibility HOLD distinctly from a provider failure", async () => {
    calls.edit.mockRejectedValue(new Error("DRAFT_ELIGIBILITY_HOLD"));
    const response = await PATCH(
      request('{"action":"EDIT","expectedVersion":1}', "https://preview.example", "PATCH"),
      context,
    );
    expect(response.status).toBe(409);
    expect(await response.text()).toContain("resolve HOLD reasons");
  });
  it("withholds provider/database secrets and rejects oversized input", async () => {
    calls.start.mockRejectedValue(new Error("secret upstream value"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret upstream value");
    expect((await POST(request("x".repeat(20001)))).status).toBe(413);
  });
});
