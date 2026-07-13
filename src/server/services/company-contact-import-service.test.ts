import { describe, expect, it } from "vitest";

import {
  buildCompanyContactImportPreview,
  confirmCompanyContactImport,
  previewCompanyContactImport,
  type CompanyContactImportPersistence,
} from "./company-contact-import-service";

function persistence(role = "KNOWLEDGE_ADMIN"): CompanyContactImportPersistence & {
  writes: number;
} {
  return {
    writes: 0,
    async getActor(actorId: string) {
      return { id: actorId, role };
    },
    async getExistingCompanyDomains() {
      return new Set(["existing.com"]);
    },
    async getExistingContactKeys() {
      return new Set(["existing.com|sam search|director of paid search"]);
    },
    async confirmImport() {
      this.writes += 1;
      return { batchId: "batch-1", imported: 1, updated: 0, skipped: 0 };
    },
  };
}

describe("company/contact CSV import", () => {
  it("previews valid company CSV and performs no writes", async () => {
    const store = persistence();
    const response = await previewCompanyContactImport(
      {
        importType: "COMPANY",
        mode: "ADD_NEW_ONLY",
        filename: "companies.csv",
        csvText:
          "company_name,domain,industry,employee_range,revenue_range\nAcme,acme.com,E-commerce,500-1,000,$100M-$250M",
      },
      { persistence: store },
    );
    expect(response.ok).toBe(true);
    expect(store.writes).toBe(0);
    if (!response.ok) return;
    expect(response.data.summary.imported).toBe(1);
  });

  it("previews contact CSV, duplicate rows, existing conflicts, invalid email, URL, domain, and formulas", () => {
    const csv = [
      "full_name,title,company_name,domain,professional_profile_url,business_email",
      "A One,Director of Paid Search,Acme,acme.com,https://example.com/a,a@acme.com",
      "A One,Director of Paid Search,Acme,acme.com,https://example.com/a,a@acme.com",
      "Sam Search,Director of Paid Search,Existing,existing.com,https://example.com/s,sam@existing.com",
      "Bad Mail,Head of Growth,Acme,acme.com,https://example.com/b,not-an-email",
      "Bad Url,Head of Growth,Acme,acme.com,notaurl,bad@acme.com",
      "Bad Domain,Head of Growth,Acme,localhost,https://example.com/bd,bd@acme.com",
      "=Formula,Head of Growth,Acme,acme.com,https://example.com/f,f@acme.com",
    ].join("\n");
    const preview = buildCompanyContactImportPreview(
      csv,
      "CONTACT",
      "ADD_NEW_ONLY",
      new Set(["existing.com"]),
      new Set(["existing.com|sam search|director of paid search"]),
    );
    expect(preview.summary.imported).toBe(1);
    expect(preview.duplicates).toHaveLength(1);
    expect(preview.conflicts).toHaveLength(1);
    expect(preview.invalidRows).toHaveLength(4);
  });

  it("requires admin access and rejects missing headers", async () => {
    const forbidden = await previewCompanyContactImport(
      {
        importType: "COMPANY",
        mode: "ADD_NEW_ONLY",
        filename: "companies.csv",
        csvText: "company_name\nAcme",
        creatorId: "seed-sales-user",
      },
      { persistence: persistence("SALES_USER") },
    );
    expect(forbidden.ok).toBe(false);
    expect(!forbidden.ok && forbidden.code).toBe("FORBIDDEN");

    const missing = buildCompanyContactImportPreview(
      "company_name\nAcme",
      "COMPANY",
      "ADD_NEW_ONLY",
      new Set(),
      new Set(),
    );
    expect(missing.invalidRows[0].reason).toContain("Missing required header");
  });

  it("confirmation writes only after a valid preview and preserves add-new-only behavior", async () => {
    const store = persistence();
    const response = await confirmCompanyContactImport(
      {
        importType: "COMPANY",
        mode: "ADD_NEW_ONLY",
        filename: "companies.csv",
        csvText:
          "company_name,domain,industry\nAcme,acme.com,E-commerce\nExisting,existing.com,Retail",
      },
      { persistence: store },
    );
    expect(response.ok).toBe(true);
    expect(store.writes).toBe(1);
  });
});
