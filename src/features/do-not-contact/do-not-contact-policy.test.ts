import { describe, expect, it } from "vitest";

import {
  defaultSuppressionRecords,
  mergeDefaultSuppressionRecords,
  searchDoNotContactRecords,
} from "./do-not-contact-policy";
import type { DoNotContactRecord } from "./types";

const records: DoNotContactRecord[] = [
  {
    id: "1",
    companyName: "Acme Retail",
    domain: "acme.example",
    status: "DO_NOT_CONTACT",
  },
  {
    id: "2",
    companyName: "PartnerCo",
    domain: "partner.example",
    status: "PARTNER",
  },
];

describe("Do Not Contact policy", () => {
  it("returns an empty state when no records exist", () => {
    expect(searchDoNotContactRecords([], "acme")).toEqual([]);
  });

  it("searches by company or domain and labels blocked state", () => {
    expect(searchDoNotContactRecords(records, "acme")).toEqual([
      {
        record: records[0],
        blocked: true,
        label: "Blocked",
      },
    ]);
    expect(searchDoNotContactRecords(records, "partner.example")).toEqual([
      {
        record: records[1],
        blocked: false,
        label: "Allowed with review",
      },
    ]);
  });

  it("includes HubSpot Signal customer and opportunity suppression records", () => {
    expect(defaultSuppressionRecords.length).toBeGreaterThan(60);
    expect(searchDoNotContactRecords(defaultSuppressionRecords, "deel.com")[0]).toMatchObject({
      blocked: true,
      record: {
        companyName: "Deel, Inc.",
        status: "EXISTING_CUSTOMER",
      },
    });
    expect(searchDoNotContactRecords(defaultSuppressionRecords, "birkenstock")[0]).toMatchObject({
      blocked: true,
      record: {
        status: "ACTIVE_OPPORTUNITY",
      },
    });
  });

  it("merges default suppression records without duplicating imported records", () => {
    const merged = mergeDefaultSuppressionRecords([
      {
        id: "existing-deel",
        companyName: "Deel",
        domain: "deel.com",
        status: "EXISTING_CUSTOMER",
      },
    ]);
    expect(merged.filter((record) => record.domain === "deel.com")).toHaveLength(1);
  });
});
