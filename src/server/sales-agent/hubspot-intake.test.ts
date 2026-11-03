// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { HubSpotReadOnlyIntake, normalizeHubSpotNumber } from "./hubspot-intake";
import { collectionNow } from "@/test/sales-agent-collection-fixtures";

function fixtures(
  options: {
    next?: string;
    owner?: string;
    companyFailure?: boolean;
    createdAt?: string;
    assignedAt?: string;
  } = {},
) {
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
          createdate: options.createdAt ?? "2026-10-15T01:00:00.000Z",
          hubspot_owner_assigneddate: options.assignedAt ?? null,
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
  it("reviews only a bounded owner-scoped historical page and preserves its dated provenance", async () => {
    const fetcher = fixtures({ createdAt: "2026-02-01T00:00:00.000Z", next: "10" });
    const batch = await new HubSpotReadOnlyIntake(
      "fictional",
      fetcher,
      () => collectionNow,
    ).listOwnedContacts(undefined, "PAST_YEAR");
    expect(batch.contacts).toHaveLength(1);
    expect(batch.contacts[0].intakeSince).toBe("2025-10-15T00:00:00.000Z");
    expect(batch.nextCursor).toBe("10");
    expect(batch.complete).toBe(false);
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body.limit).toBe(10);
    expect(
      body.filterGroups.every((group: { filters: { propertyName: string; value: string }[] }) =>
        group.filters.some(
          (f) => f.propertyName === "hubspot_owner_id" && f.value === "1087915602",
        ),
      ),
    ).toBe(true);
    const old = await new HubSpotReadOnlyIntake(
      "fictional",
      fixtures({ createdAt: "2020-01-01T00:00:00.000Z" }),
      () => collectionNow,
    ).listOwnedContacts(undefined, "PAST_YEAR");
    expect(old.contacts).toHaveLength(0);
    const blocked = vi.fn();
    await expect(
      new HubSpotReadOnlyIntake("fictional", blocked).listOwnedContacts("10000", "PAST_YEAR"),
    ).rejects.toThrow();
    expect(blocked).not.toHaveBeenCalled();
  });

  it("reads a shared company ID once per batch and rejects oversized or looping pages", async () => {
    const base = fixtures();
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      const path = String(url);
      if (path.endsWith("/search"))
        return Response.json({
          results: ["42", "43"].map((id) => ({
            id,
            properties: { hubspot_owner_id: "1087915602" },
          })),
        });
      if (path.includes("/contacts/43?")) {
        const body = await (
          await base(path.replace("/contacts/43?", "/contacts/42?"), init)
        ).json();
        return Response.json({ ...body, id: "43" });
      }
      return base(url, init);
    });
    const result = await new HubSpotReadOnlyIntake(
      "fictional",
      fetcher,
      () => collectionNow,
    ).listOwnedContacts(undefined, "PAST_YEAR");
    expect(result.contacts).toHaveLength(2);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes("/companies/"))).toHaveLength(
      1,
    );
    const oversized = vi.fn(async () =>
      Response.json({
        results: Array.from({ length: 11 }, (_, i) => ({
          id: String(i),
          properties: { hubspot_owner_id: "1087915602" },
        })),
      }),
    );
    await expect(
      new HubSpotReadOnlyIntake("fictional", oversized).listOwnedContacts(undefined, "PAST_YEAR"),
    ).rejects.toThrow("bounded batch");
    await expect(
      new HubSpotReadOnlyIntake(
        "fictional",
        fixtures({ next: "10" }),
        () => collectionNow,
      ).listOwnedContacts("10", "PAST_YEAR"),
    ).rejects.toThrow("cursor");
  });
  it("admits a newly assigned older contact but excludes an old unchanged or future-created contact", async () => {
    const older = "2020-01-01T00:00:00.000Z";
    const assigned = await new HubSpotReadOnlyIntake(
      "token",
      fixtures({ createdAt: older, assignedAt: "2026-10-15T02:00:00.000Z" }),
      () => collectionNow,
    ).listOwnedContacts();
    expect(assigned.contacts).toHaveLength(1);
    for (const createdAt of [older, "2026-10-16T00:00:00.000Z"])
      expect(
        (
          await new HubSpotReadOnlyIntake(
            "token",
            fixtures({ createdAt }),
            () => collectionNow,
          ).listOwnedContacts()
        ).contacts,
      ).toEqual([]);
  });

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
    expect(search.filterGroups).toHaveLength(2);
    for (const [index, group] of search.filterGroups.entries())
      expect(group.filters).toEqual([
        { propertyName: "hubspot_owner_id", operator: "EQ", value: "1087915602" },
        {
          propertyName: index === 0 ? "createdate" : "hubspot_owner_assigneddate",
          operator: "GTE",
          value: String(Date.parse("2026-10-15T00:00:00.000Z")),
        },
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
    expect(result.warnings.join(" ")).toContain("owner/new-contact");
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
