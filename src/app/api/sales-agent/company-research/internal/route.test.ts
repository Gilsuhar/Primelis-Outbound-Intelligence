// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), create: vi.fn(), list: vi.fn(), resolve: vi.fn() }));
vi.mock("@/server/agent-workforce/http", () => ({
  workforceActor: mocks.actor,
  workforceResponse: (body: unknown, status = 200) => Response.json(body, { status }),
}));
vi.mock("@/server/agent-workforce/company-research/internal-review-store", () => ({
  createInternalReview: mocks.create,
  listInternalReviews: mocks.list,
}));
vi.mock("@/server/agent-workforce/dashboard/preparation", () => ({
  resolveChoiceContinuationContact: mocks.resolve,
}));
import { GET, POST } from "./route";
const request = (body: string) =>
  new Request("http://localhost:3000/api/sales-agent/company-research/internal", {
    method: "POST",
    headers: { host: "localhost:3000", origin: "http://localhost:3000" },
    body,
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.actor.mockResolvedValue({ actor: { id: "actor" } });
});
it("rejects unauthorized requests before reading image bodies or storing anything", async () => {
  mocks.actor.mockResolvedValue({ response: new Response(null, { status: 403 }) });
  expect((await POST(request('{"company":"Acme"}'))).status).toBe(403);
  expect(mocks.create).not.toHaveBeenCalled();
});
it("uses the existing operator/origin guard and bounds streamed payloads", async () => {
  expect((await POST(request("x".repeat(2_900_001)))).status).toBe(413);
  expect(mocks.actor.mock.calls[0][1]).toBe(true);
  expect(mocks.create).not.toHaveBeenCalled();
  expect((await POST(request("{"))).status).toBe(400);
});
it("retains explicit foreign GET origins for the existing guard", async () => {
  mocks.list.mockResolvedValue([]);
  await GET(
    new Request("http://localhost:3000/api/sales-agent/company-research/internal", {
      headers: { host: "localhost:3000", origin: "https://external.example" },
    }),
  );
  expect(mocks.actor.mock.calls[0][0].headers.get("origin")).toBe("https://external.example");
});
it.each(["localhost:3000", "127.0.0.1:3000"])(
  "preserves HTTPS for a browser GET without Origin at %s",
  async (host) => {
    mocks.list.mockResolvedValue([]);
    await GET(
      new Request(`https://${host}/api/sales-agent/company-research/internal`, {
        headers: { host },
      }),
    );
    expect(mocks.actor.mock.calls[0][0].headers.get("origin")).toBe(`https://${host}`);
    expect(mocks.actor.mock.calls[0][1]).toBe(true);
  },
);
it("executes the bounded public-only path after authorization and body validation", async () => {
  mocks.create.mockResolvedValue({ company: "Acme", review: null });
  const response = await POST(request('{"company":"Acme"}'));
  expect(response.status).toBe(200);
  expect(mocks.create).toHaveBeenCalledWith("actor", "localhost:3000", { company: "Acme" }, true);
});

it("resolves a saved-continuation contact ID server-side and passes only the verified context", async () => {
  const context = {
    contactId: "contact-1",
    displayName: "Fictional Reviewer",
    companyName: "Choice Hotels",
    companyDomain: "choicehotels.com",
    verifiedPersonalizationFacts: [],
    unresolved: ["Current employment and Paid Search responsibility are unresolved."],
    eligibility: "HOLD",
    outboundReady: false,
  };
  mocks.resolve.mockResolvedValue(context);
  mocks.create.mockResolvedValue({ company: "Choice Hotels", review: null });
  const response = await POST(
    request(
      JSON.stringify({
        company: "Choice Hotels",
        continueResearchId: "d4eb59e6-8160-4d45-a8d2-44c0174b7b65",
        continueContactId: "contact-1",
      }),
    ),
  );
  expect(response.status).toBe(200);
  expect(mocks.resolve).toHaveBeenCalledWith("actor", "localhost:3000", "contact-1");
  expect(mocks.create).toHaveBeenCalledWith(
    "actor",
    "localhost:3000",
    {
      company: "Choice Hotels",
      continueResearchId: "d4eb59e6-8160-4d45-a8d2-44c0174b7b65",
      continueContactId: "contact-1",
    },
    true,
    { contactDraft: context },
  );
});

it("fails closed when the requested contact is not in the server-owned Choice Hotels plan", async () => {
  mocks.resolve.mockRejectedValue(new Error("CONTINUATION_CONTACT_NOT_AVAILABLE"));
  const response = await POST(
    request(
      JSON.stringify({
        company: "Choice Hotels",
        continueResearchId: "d4eb59e6-8160-4d45-a8d2-44c0174b7b65",
        continueContactId: "foreign-contact",
      }),
    ),
  );
  expect(response.status).toBe(409);
  expect(mocks.create).not.toHaveBeenCalled();
});

it("rejects contact linkage without a saved continuation before resolving a contact", async () => {
  const response = await POST(
    request(JSON.stringify({ company: "Choice Hotels", continueContactId: "contact-1" })),
  );
  expect(response.status).toBe(409);
  expect(mocks.resolve).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});
