// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  actor: "operator" as string | null,
  prepare: vi.fn(),
  read: vi.fn(),
  mutate: vi.fn(),
  byContact: vi.fn(),
  drain: vi.fn(),
  after: vi.fn(),
}));
vi.mock("@/lib/auth/server", () => ({
  getCurrentUser: async () => (state.actor ? { id: state.actor } : null),
}));
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: state.after,
}));
vi.mock("@/server/agent-workforce/draft-studio/engine", () => ({
  DraftStudioEngine: class {
    prepareContact = state.prepare;
    read = state.read;
    mutate = state.mutate;
    store = { byContact: state.byContact };
  },
}));
vi.mock("@/server/agent-workforce/draft-studio/worker", () => ({ drainDraftStudio: state.drain }));
import { GET, POST, PATCH } from "./route";
const request = (body: unknown, method = "POST", origin = "https://preview.example") =>
  new Request("https://preview.example/api/sales-agent/draft-studio", {
    method,
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
describe("safe review-only Draft Studio routes", () => {
  it("requires sign-in, same origin, operator binding and Preview for writes", async () => {
    state.actor = null;
    expect((await POST(request({ contactId: "42" }))).status).toBe(401);
    state.actor = "operator";
    expect(
      (await POST(request({ contactId: "42" }, "POST", "https://foreign.example"))).status,
    ).toBe(403);
    state.actor = "other";
    expect(
      (await PATCH(request({ runId: "run", mutation: { action: "APPROVE" } }, "PATCH"))).status,
    ).toBe(403);
    state.actor = "operator";
    vi.stubEnv("VERCEL_ENV", "production");
    expect((await POST(request({ contactId: "42" }))).status).toBe(403);
    expect(state.prepare).not.toHaveBeenCalled();
    expect(state.mutate).not.toHaveBeenCalled();
  });
  it("accepts only stable synchronized IDs, not browser evidence, credentials or send flags", async () => {
    for (const extra of [
      { email: "other@example.com" },
      { evidence: [] },
      { token: "secret" },
      { send: true },
      { enroll: true },
      { companyDomain: "other.example" },
    ])
      expect((await POST(request({ contactId: "42", ...extra }))).status).toBe(400);
    expect(state.prepare).not.toHaveBeenCalled();
  });
  it("schedules one bounded authenticated stage and uses the separate reviewed mutation service", async () => {
    state.prepare.mockResolvedValueOnce({ id: "draft", status: "RUNNING" });
    expect((await POST(request({ contactId: "42" }))).status).toBe(202);
    expect(state.prepare).toHaveBeenCalledWith("operator", "42");
    await state.after.mock.calls[0][0]();
    expect(state.drain).toHaveBeenCalledWith("operator", "draft");
    const mutation = { action: "APPROVE", expectedVersion: 7, requestKey: "fixture-0001" };
    state.mutate.mockResolvedValueOnce({ id: "draft", status: "READY_FOR_REVIEW" });
    expect((await PATCH(request({ runId: "draft", mutation }, "PATCH"))).status).toBe(200);
    expect(state.mutate).toHaveBeenCalledWith("operator", "draft", mutation);
  });
  it("reads only actor/contact-scoped, freshly protected content", async () => {
    state.byContact.mockResolvedValueOnce([
      {
        id: "foreign",
        draftStudio: {},
        intake: { hubspotRecordId: "other" },
        createdAt: "2026-10-15",
      },
      { id: "draft", draftStudio: {}, intake: { hubspotRecordId: "42" }, createdAt: "2026-10-15" },
    ]);
    state.read.mockResolvedValueOnce({
      id: "draft",
      sequence: null,
      draftStudio: { reviewStatus: "INVALIDATED" },
    });
    const response = await GET(
      new Request("https://preview.example/api/sales-agent/draft-studio?contactId=42"),
    );
    expect(response.status).toBe(200);
    expect(state.byContact).toHaveBeenCalledWith("operator", "42");
    expect(state.read).toHaveBeenCalledWith("operator", "draft");
  });
  it("returns safe HOLD and provider errors without leaking server details", async () => {
    state.prepare.mockRejectedValueOnce(new Error("DRAFT_ELIGIBILITY_HOLD"));
    expect((await POST(request({ contactId: "42" }))).status).toBe(409);
    state.prepare.mockRejectedValueOnce(new Error("secret fixture token"));
    const response = await POST(request({ contactId: "42" }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret fixture token");
  });
});
