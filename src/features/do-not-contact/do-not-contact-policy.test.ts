import { describe, expect, it } from "vitest";

import { searchDoNotContactRecords } from "./do-not-contact-policy";
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
});
