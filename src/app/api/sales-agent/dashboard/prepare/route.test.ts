// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ actor: vi.fn(), prepare: vi.fn(), plan: vi.fn() }));
vi.mock("@/server/agent-workforce/http", () => ({
  workforceActor: m.actor,
  workforceBody: (r: Request) => r.json(),
  workforceResponse: (b: unknown, status = 200) => Response.json(b, { status }),
}));
vi.mock("@/server/agent-workforce/dashboard/preparation", () => ({
  prepareProspects: m.prepare,
  getPreparationPlan: m.plan,
}));
import { GET, POST } from "./route";
const req = (body: unknown) =>
  new Request("https://localhost:3000/api/sales-agent/dashboard/prepare", {
    method: "POST",
    headers: { host: "localhost:3000", origin: "https://localhost:3000" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  m.actor.mockResolvedValue({ actor: { id: "actor" } });
});
it("requires existing operator and origin authorization before orchestration", async () => {
  m.actor.mockResolvedValue({ response: new Response(null, { status: 403 }) });
  expect((await POST(req({ allowPaid: true, contactId: "contact-1" }))).status).toBe(403);
  expect(m.actor).toHaveBeenCalledWith(expect.any(Request), true);
  expect(m.prepare).not.toHaveBeenCalled();
});
it("requires explicit boolean consent and rejects caller overrides", async () => {
  for (const body of [
    {},
    { allowPaid: "true" },
    { allowPaid: true, contactId: "contact-1", owner: "other" },
    { allowPaid: true, contactId: "contact-1", maxCalls: 100 },
  ])
    expect((await POST(req(body))).status).toBe(400);
  expect(m.prepare).not.toHaveBeenCalled();
  expect((await POST(req({ allowPaid: false, contactId: "contact-1" }))).status).toBe(200);
  expect(m.prepare).toHaveBeenCalledWith("actor", "localhost:3000", false, "contact-1");
});
it("preserves foreign origins and authenticated HTTPS GET", async () => {
  await GET(
    new Request("https://localhost:3000/api/sales-agent/dashboard/prepare", {
      headers: { host: "localhost:3000", origin: "https://foreign.example" },
    }),
  );
  expect(m.actor.mock.calls[0][0].headers.get("origin")).toBe("https://foreign.example");
});
it("never returns provider error details or credentials", async () => {
  m.prepare.mockRejectedValue(Error("private provider detail"));
  const response = await POST(req({ allowPaid: true, contactId: "contact-1" }));
  const text = await response.text();
  expect(text).not.toContain("private provider detail");
  expect(text).toContain("PREPARATION_UNAVAILABLE");
  expect(text).toContain('"paidAuthorized":true');
  expect(text).toContain('"outcome":"BLOCKED"');
  expect(text).toContain('"actualCalls":null');
});
it("records paid authorization and known zero usage when the budget preflight blocks", async () => {
  m.prepare.mockRejectedValue(Error("PREPARATION_AI_NOT_READY"));
  const response = await POST(req({ allowPaid: true, contactId: "contact-1" }));
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
    ok: false,
    action: {
      paidAuthorized: true,
      outcome: "BLOCKED",
      actualCalls: 0,
      actualEstimatedUsd: 0,
    },
  });
});
