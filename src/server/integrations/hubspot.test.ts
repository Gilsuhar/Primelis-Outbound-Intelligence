// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { HubSpotConnector } from "./hubspot";
const now = new Date("2026-10-16T12:00:00Z");
function fixture(
  options: {
    owner?: string;
    created?: string;
    assigned?: string;
    history?: boolean;
    stage?: string;
    partial?: boolean;
    unauthorizedEmail?: boolean;
  } = {},
) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/crm/v3/objects/contacts/42")
      return Response.json({
        id: "42",
        properties: {
          hubspot_owner_id: options.owner ?? "1087915602",
          firstname: "Fictional",
          lastname: "Morgan",
          email: "morgan@fictional.example",
          createdate: options.created ?? "2026-10-15T00:00:00Z",
          hubspot_owner_assigneddate: options.assigned ?? null,
          lastmodifieddate: now.toISOString(),
        },
        propertiesWithHistory: {
          email: [{ timestamp: "2026-10-14T00:00:00Z" }],
          ...(options.history
            ? { hubspot_owner_id: [{ timestamp: "2026-10-15T00:00:00Z", value: "1087915602" }] }
            : {}),
        },
        associations: { companies: { results: [] } },
      });
    if (url.pathname === "/crm/v4/objects/contacts/42/associations/companies")
      return Response.json({
        results: [{ toObjectId: 11, associationTypes: [{ typeId: 1, label: "Primary" }] }],
      });
    if (url.pathname === "/crm/v3/objects/companies/11")
      return Response.json({
        id: "11",
        properties: {
          name: "Fictional Account",
          domain: "fictional.example",
          numberofemployees: "100",
          annualrevenue: "50000000",
        },
      });
    if (url.pathname === "/crm/v4/objects/contacts/42/associations/deals") {
      if (options.partial && url.searchParams.has("after"))
        return new Response(null, { status: 403 });
      return Response.json({
        results: [{ toObjectId: 12 }],
        ...(options.partial ? { paging: { next: { after: "page-2" } } } : {}),
      });
    }
    if (url.pathname === "/crm/v4/objects/companies/11/associations/deals")
      return Response.json({ results: [{ toObjectId: 12 }] });
    if (url.pathname === "/crm/v3/pipelines/deals")
      return Response.json({
        results: [
          {
            id: "pipeline",
            stages: [
              {
                id: "stage",
                metadata:
                  options.stage === "unknown"
                    ? {}
                    : { isClosed: options.stage === "closed" ? "true" : "false" },
              },
            ],
          },
        ],
      });
    if (url.pathname === "/crm/v3/objects/deals/12")
      return Response.json({ id: "12", properties: { pipeline: "pipeline", dealstage: "stage" } });
    if (url.pathname === "/crm/v4/objects/contacts/42/associations/emails")
      return Response.json({ results: [{ toObjectId: 13 }] });
    if (url.pathname === "/crm/v3/objects/emails/13") {
      if (options.unauthorizedEmail) return new Response(null, { status: 403 });
      return Response.json({
        id: "13",
        properties: {
          hs_email_direction: "EMAIL",
          hs_email_status: "SENT",
          hs_timestamp: "2026-09-01T00:00:00Z",
        },
      });
    }
    throw new Error("Unexpected fixture path");
  });
}
const connector = (fetcher: typeof fetch) =>
  new HubSpotConnector(
    { token: "fixture-only", portalId: "123", revenueCurrency: "USD" },
    { fetcher },
    () => now,
  );
describe("HubSpot contact enrichment", () => {
  it("imports company, deduplicated deals, sent activity and a canonical record link", async () => {
    const fetcher = fixture(),
      result = await connector(fetcher).contact("42", "2026-10-01T00:00:00Z");
    expect(result).toMatchObject({
      hubspotRecordId: "42",
      companyDomain: "fictional.example",
      hubspotRecordUrl: "https://app.hubspot.com/contacts/123/record/0-1/42",
    });
    expect(result?.observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "conflictingActiveOpportunity", value: true }),
        expect.objectContaining({ field: "lastOutboundAt", value: "2026-09-01T00:00:00.000Z" }),
      ]),
    );
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes("/deals/12?"))).toHaveLength(
      1,
    );
    expect(fetcher.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
  });
  it("admits genuine reassignment property or owner history for an older contact", async () => {
    for (const options of [{ assigned: "2026-10-15T00:00:00Z" }, { history: true }]) {
      const result = await connector(
        fixture({ created: "2020-01-01T00:00:00Z", ...options }),
      ).contact("42", "2026-10-01T00:00:00Z");
      expect(result?.ownerAssignedAt).toBe("2026-10-15T00:00:00Z");
    }
  });
  it("never treats lastmodifieddate as reassignment and excludes a changed owner", async () => {
    expect(
      await connector(fixture({ created: "2020-01-01T00:00:00Z" })).contact(
        "42",
        "2026-10-01T00:00:00Z",
      ),
    ).toBeNull();
    expect(
      await connector(fixture({ owner: "other" })).contact("42", "2026-10-01T00:00:00Z"),
    ).toBeNull();
  });
  it("only clears opportunities from explicit closed-stage metadata", async () => {
    const closed = await connector(fixture({ stage: "closed" })).contact(
      "42",
      "2026-10-01T00:00:00Z",
    );
    expect(
      closed?.observations.find((item) => item.field === "conflictingActiveOpportunity")?.value,
    ).toBe(false);
    const unknown = await connector(fixture({ stage: "unknown" })).contact(
      "42",
      "2026-10-01T00:00:00Z",
    );
    expect(
      unknown?.observations.some((item) => item.field === "conflictingActiveOpportunity"),
    ).toBe(false);
    expect(unknown?.warnings.join()).toContain("unknown");
  });
  it("fails incomplete association pagination without negative opportunity clearance", async () => {
    await expect(
      connector(fixture({ partial: true })).contact("42", "2026-10-01T00:00:00Z"),
    ).rejects.toThrow("PERMISSION_MISSING");
  });
  it("fails missing email-history permission rather than assuming no logged outbound", async () => {
    await expect(
      connector(fixture({ unauthorizedEmail: true })).contact("42", "2026-10-01T00:00:00Z"),
    ).rejects.toThrow("PERMISSION_MISSING");
  });
});
it("uses an owner-scoped contact search for authenticated health checks", async () => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ results: [] }));
  await new HubSpotConnector({ token: "fictional", portalId: "123" }, { fetcher }).check();
  const [url, request] = fetcher.mock.calls[0];
  expect(String(url)).toContain("/contacts/search");
  expect(request!.method).toBe("POST");
  expect(JSON.parse(String(request!.body)).filterGroups[0].filters).toEqual([
    { propertyName: "hubspot_owner_id", operator: "EQ", value: "1087915602" },
  ]);
});
