import { describe, expect, it } from "vitest";

import { classifyProfessionalTitle } from "@/features/company-contact-enrichment/persona-classifier";
import type { DoNotContactRecord } from "@/features/do-not-contact/types";

import {
  DeterministicMockCompanyContactProvider,
  type CompanyContactDataProvider,
} from "./company-contact-provider";
import {
  enrichCompanyAndContacts,
  type CompanyContactPersistence,
} from "./company-contact-enrichment-service";

function persistence(records: DoNotContactRecord[] = []): CompanyContactPersistence & {
  persisted: Array<unknown>;
} {
  return {
    persisted: [],
    async getActor(actorId: string) {
      return actorId === "blocked-user" ? null : { id: actorId, role: "SALES_USER" };
    },
    async getSuppressionRecords() {
      return records;
    },
    async persistEnrichment(input) {
      this.persisted.push(input);
      return "run-1";
    },
  };
}

describe("company/contact enrichment", () => {
  it("returns safe provider-not-configured state without breaking manual research", async () => {
    const store = persistence();
    const result = await enrichCompanyAndContacts(
      { companyName: "Acme", companyDomain: "acme.com" },
      { persistence: store },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.providerStatus.status).toBe("NOT_CONFIGURED");
    expect(result.data.companyFields).toEqual([]);
    expect(result.data.contacts).toEqual([]);
    expect(result.data.warnings.join(" ")).not.toMatch(/secret|token|key/i);
    expect(store.persisted).toHaveLength(1);
  });

  it("normalizes deterministic provider data without inventing verification or ad facts", async () => {
    const result = await enrichCompanyAndContacts(
      {
        companyName: "Signal Retail",
        companyDomain: "https://www.signal-retail.example",
        existingFields: { industry: "B2B SaaS" },
      },
      {
        persistence: persistence(),
        provider: new DeterministicMockCompanyContactProvider(),
        now: () => new Date("2026-07-13T10:00:00.000Z"),
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.companyFields).toContainEqual(
      expect.objectContaining({
        field: "employee_range",
        value: "500-1,000 employees",
        status: "PROVIDER_SUPPLIED",
      }),
    );
    expect(result.data.companyFields).toContainEqual(
      expect.objectContaining({ field: "revenue_range", value: "$100M-$250M" }),
    );
    expect(result.data.companyFields.map((field) => field.field)).not.toContain(
      "paid_search_spend",
    );
    expect(result.data.conflicts).toContainEqual(
      expect.objectContaining({
        field: "industry",
        existingValue: "B2B SaaS",
        incomingValue: "Retail and E-commerce",
      }),
    );
  });

  it("prioritizes direct Paid Search over executive seniority", async () => {
    const paidSearch = classifyProfessionalTitle("Director of Paid Search");
    const headGrowth = classifyProfessionalTitle("Head of Growth");
    const cmo = classifyProfessionalTitle("CMO");
    expect(paidSearch.personaTier).toBe("Tier 1");
    expect(headGrowth.personaTier).toBe("Tier 1");
    expect(cmo.personaTier).toBe("Tier 3");
    expect(paidSearch.targetingPriority).toBeGreaterThan(cmo.targetingPriority);
  });

  it("filters irrelevant roles and private contact fields before persistence", async () => {
    const provider: CompanyContactDataProvider = {
      providerName: "test provider",
      async getProviderStatus() {
        return { status: "CONFIGURED", providerName: "test provider", message: "Configured." };
      },
      async enrichCompanyByDomain() {
        return { matchStatus: "MATCHED", fields: [] };
      },
      async findRelevantContacts() {
        return [
          {
            fullName: "Private Person",
            professionalTitle: "Facilities Coordinator",
            companyName: "Acme",
            companyDomain: "acme.com",
            personalPhone: "PRIVATE_PHONE_SHOULD_NOT_SURFACE",
            privateEmail: "PRIVATE_EMAIL_SHOULD_NOT_SURFACE",
          },
          {
            fullName: "Paid Owner",
            professionalTitle: "SEM Manager",
            companyName: "Acme",
            companyDomain: "acme.com",
            businessEmail: "paid.owner@acme.com",
            businessEmailStatus: "provider supplied",
          },
        ];
      },
    };
    const result = await enrichCompanyAndContacts(
      { companyName: "Acme", companyDomain: "acme.com" },
      { persistence: persistence(), provider },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.contacts).toHaveLength(1);
    expect(result.data.contacts[0]).toEqual(
      expect.objectContaining({
        fullName: "Paid Owner",
        businessEmailStatus: "provider supplied",
      }),
    );
    expect(JSON.stringify(result.data)).not.toContain("PRIVATE_PHONE_SHOULD_NOT_SURFACE");
    expect(JSON.stringify(result.data)).not.toContain("PRIVATE_EMAIL_SHOULD_NOT_SURFACE");
  });

  it("maps malformed, rate-limit, and no-match provider behavior safely", async () => {
    const malformed: CompanyContactDataProvider = {
      providerName: "bad provider",
      async getProviderStatus() {
        return { status: "CONFIGURED", providerName: "bad provider", message: "Configured." };
      },
      async enrichCompanyByDomain() {
        return { matchStatus: "MATCHED", fields: [{ field: "", value: "", fieldOrigin: "" }] };
      },
      async findRelevantContacts() {
        return [];
      },
    };
    const bad = await enrichCompanyAndContacts(
      { companyName: "Acme", companyDomain: "acme.com" },
      { persistence: persistence(), provider: malformed },
    );
    expect(bad.ok && bad.data.providerStatus.status).toBe("PROVIDER_ERROR");

    const rateLimited: CompanyContactDataProvider = {
      providerName: "limited provider",
      async getProviderStatus() {
        return { status: "CONFIGURED", providerName: "limited provider", message: "Configured." };
      },
      async enrichCompanyByDomain() {
        throw new Error("429 rate limit");
      },
      async findRelevantContacts() {
        return [];
      },
    };
    const limited = await enrichCompanyAndContacts(
      { companyName: "Acme", companyDomain: "acme.com" },
      { persistence: persistence(), provider: rateLimited },
    );
    expect(limited.ok && limited.data.providerStatus.status).toBe("RATE_LIMITED");

    const noMatch: CompanyContactDataProvider = {
      providerName: "empty provider",
      async getProviderStatus() {
        return { status: "CONFIGURED", providerName: "empty provider", message: "Configured." };
      },
      async enrichCompanyByDomain() {
        return { matchStatus: "NO_MATCH", fields: [] };
      },
      async findRelevantContacts() {
        return [];
      },
    };
    const empty = await enrichCompanyAndContacts(
      { companyName: "Acme", companyDomain: "acme.com" },
      { persistence: persistence(), provider: noMatch },
    );
    expect(empty.ok && empty.data.warnings).toContain(
      "No company match was returned; no facts were invented.",
    );
  });

  it("blocks outreach links when suppression has an active opportunity", async () => {
    const result = await enrichCompanyAndContacts(
      { companyName: "Acme", companyDomain: "acme.com" },
      {
        persistence: persistence([
          {
            id: "sup-1",
            companyName: "Acme",
            domain: "acme.com",
            status: "ACTIVE_OPPORTUNITY",
          },
        ]),
        provider: new DeterministicMockCompanyContactProvider(),
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.data.workflowLinks.find((link) => link.label === "Create Outreach")?.disabled,
    ).toBe(true);
    expect(
      result.data.workflowLinks.find((link) => link.label === "Build Sequence")?.disabled,
    ).toBe(true);
  });
});
