import { describe, it, expect, vi, afterEach } from "vitest";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  start: vi.fn(async () => ({ id: "fictional-run" })),
  report: vi.fn(async () => ({ runs: [] })),
  tick: vi.fn(async () => null),
  control: vi.fn(async () => null),
  after: vi.fn(),
}));
vi.mock("@/lib/auth/server", () => ({ getCurrentUser: mocks.user }));
vi.mock("next/server", async () => ({
  ...(await vi.importActual("next/server")),
  after: mocks.after,
}));
vi.mock("@/server/agent-workforce/daily/engine", () => ({
  DailyEngine: class {
    start = mocks.start;
    report = mocks.report;
    tick = mocks.tick;
    control = mocks.control;
  },
}));
import { GET, POST } from "./route";
const request = (body: unknown, origin = "https://feature.vercel.app") =>
  new Request("https://feature.vercel.app/api/sales-agent/daily", {
    method: "POST",
    headers: { origin },
    body: JSON.stringify(body),
  });
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("manual daily controls require server-side operator authorization", () => {
  it("requires sign-in", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await POST(request({ action: "ADVANCE" }))).status).toBe(401);
    expect(mocks.tick).not.toHaveBeenCalled();
  });
  it("rejects another authenticated user for reads and writes", async () => {
    mocks.user.mockResolvedValue({ id: "other" });
    vi.stubEnv("INTEGRATION_OPERATOR_USER_ID", "operator");
    expect((await GET()).status).toBe(403);
    expect((await POST(request({ action: "ADVANCE" }))).status).toBe(403);
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it("rejects cross-origin and Production mutations", async () => {
    mocks.user.mockResolvedValue({ id: "operator" });
    vi.stubEnv("INTEGRATION_OPERATOR_USER_ID", "operator");
    expect((await POST(request({ action: "ADVANCE" }, "https://evil.invalid"))).status).toBe(403);
    vi.stubEnv("VERCEL_ENV", "production");
    expect((await POST(request({ action: "ADVANCE" }))).status).toBe(403);
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it("starts an authenticated same-origin run using a strict idempotency key", async () => {
    mocks.user.mockResolvedValue({ id: "operator" });
    vi.stubEnv("INTEGRATION_OPERATOR_USER_ID", "operator");
    expect((await POST(request({ action: "RUN", requestKey: "fictional-key" }))).status).toBe(202);
    expect(mocks.start).toHaveBeenCalledWith("operator", "fictional-key", "MANUAL");
    expect(mocks.after).toHaveBeenCalledOnce();
  });
  it("rejects injected send, approval and actor overrides", async () => {
    mocks.user.mockResolvedValue({ id: "operator" });
    vi.stubEnv("INTEGRATION_OPERATOR_USER_ID", "operator");
    expect((await POST(request({ action: "ADVANCE", send: true, actor: "other" }))).status).toBe(
      400,
    );
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it("cancellation does not queue additional worker processing", async () => {
    mocks.user.mockResolvedValue({ id: "operator" });
    vi.stubEnv("INTEGRATION_OPERATOR_USER_ID", "operator");
    expect(
      (await POST(request({ action: "CANCEL", runId: "fbd12aa4-be6d-4cbb-80c8-846351d10263" })))
        .status,
    ).toBe(202);
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.control).toHaveBeenCalledWith(
      "operator",
      "fbd12aa4-be6d-4cbb-80c8-846351d10263",
      "CANCEL",
    );
  });
});
