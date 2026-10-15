// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { HubSpotReadOnlyIntake, normalizeHubSpotNumber } from "./hubspot-intake";
import { collectionNow } from "@/test/sales-agent-collection-fixtures";

function fixtures(options: { next?: string; owner?: string; companyFailure?: boolean } = {}) {
  return vi.fn<typeof fetch>(async (url, init) => {
    const path = String(url);
    if (path.endsWith("/contacts/search"))
      return Response.json({
        results: [
          { id: "42", properties: { hubspot_owner_id: "1087915602" } },
          { id: "42", properties: { hubspot_owner_id: "1087915602" } },
          { id: "99", properties: { hubspot_owner_id: "other" } },
        ],
        ...(options.next ? { paging: { next: { after: options.next } } } : {}),
      });
    if (path.includes("/contacts/42?"))
      return Response.json({
        id: "42",
        properties: {
          firstname: "Fixture",
          lastname: "Prospect",
          jobtitle: "Head of Paid Search",
          hubspot_owner_id: options.owner ?? "1087915602",
          email: "fixture@example.com",
          hs_email_optout: "false",
        },
        propertiesWithHistory: { email: [{ timestamp: "2026-10-14T08:00:00.000Z" }] },
        associations: { companies: { results: [{ id: "company-1", type: "contact_to_company" }] } },
      });
    if (path.includes("/companies/company-1?"))
      return options.companyFailure
        ? new Response("private details", { status: 403 })
        : Response.json({
            id: "company-1",
            properties: {
              name: "Fixture",
              domain: "example.com",
              numberofemployees: "1,000",
              annualrevenue: "50000000",
            },
          });
    throw new Error(`Unexpected request ${path} ${init?.method}`);
  });
}

describe("HubSpot read-only intake", () => {
  it("filters by fixed owner, deduplicates IDs, reads primary company and never mutates CRM", async () => {
    const fetcher = fixtures();
    const result = await new HubSpotReadOnlyIntake(
      "fixture-token",
      fetcher,
      () => collectionNow,
      "USD",
    ).listOwnedContacts();
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0]).toMatchObject({
      hubspotRecordId: "42",
      ownerId: "1087915602",
      companyDomain: "example.com",
      emailModifiedAt: "2026-10-14T08:00:00.000Z",
    });
    expect(
      result.contacts[0].observations.find((item) => item.field === "employeeCount")?.value,
    ).toBe(1000);
    expect(
      result.contacts[0].observations.every(
        (item) => item.verifiedAt === null && item.independent === false,
      ),
    ).toBe(true);
    const search = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(search.filterGroups[0].filters).toEqual([
      { propertyName: "hubspot_owner_id", operator: "EQ", value: "1087915602" },
    ]);
    expect(fetcher.mock.calls).toHaveLength(3);
    for (const [url, init] of fetcher.mock.calls) {
      expect(init?.method).toBe(String(url).endsWith("/search") ? "POST" : "GET");
      expect(init?.redirect).toBe("error");
      expect(init?.cache).toBe("no-store");
    }
  });
  it("excludes contacts whose owner changes during collection", async () => {
    const result = await new HubSpotReadOnlyIntake(
      "token",
      fixtures({ owner: "other" }),
      () => collectionNow,
    ).listOwnedContacts();
    expect(result.contacts).toEqual([]);
    expect(result.warnings.join(" ")).toContain("owner changed");
  });
  it("reports pagination explicitly and uses cursor without changing owner scope", async () => {
    const fetcher = fixtures({ next: "101" });
    const result = await new HubSpotReadOnlyIntake(
      "token",
      fetcher,
      () => collectionNow,
    ).listOwnedContacts("50");
    expect(result.complete).toBe(false);
    expect(result.nextCursor).toBe("101");
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).after).toBe("50");
  });
  it("does not invent USD revenue when currency is unconfigured", async () => {
    const result = await new HubSpotReadOnlyIntake(
      "token",
      fixtures(),
      () => collectionNow,
      "EUR",
    ).listOwnedContacts();
    expect(
      result.contacts[0].observations.find((item) => item.field === "annualRevenueUsd")?.value,
    ).toEqual({ amount: 50000000, currency: "UNKNOWN" });
  });
  it("keeps missing company data actionable without making up metrics", async () => {
    const result = await new HubSpotReadOnlyIntake(
      "token",
      fixtures({ companyFailure: true }),
      () => collectionNow,
    ).listOwnedContacts();
    expect(result.contacts[0].observations.some((item) => item.field === "employeeCount")).toBe(
      false,
    );
    expect(result.contacts[0].warnings.join(" ")).toContain("Company read failed");
  });
  it("sanitizes provider failures and does not expose API response bodies", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("secret diagnostics", { status: 403 }));
    await expect(new HubSpotReadOnlyIntake("token", fetcher).listOwnedContacts()).rejects.toThrow(
      "HTTP 403",
    );
    await expect(
      new HubSpotReadOnlyIntake("token", fetcher).listOwnedContacts(),
    ).rejects.not.toThrow("secret diagnostics");
  });
  it("makes no requests without credentials", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(new HubSpotReadOnlyIntake("", fetcher).listOwnedContacts()).rejects.toThrow(
      "not configured",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["80-100", "30M", "", "unknown", "-1", "1,23"])(
    "does not coerce ambiguous numbers: %s",
    (value) => {
      expect(normalizeHubSpotNumber(value)).toBeUndefined();
    },
  );
});
