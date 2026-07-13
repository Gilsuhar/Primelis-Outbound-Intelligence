import { describe, expect, it } from "vitest";

import type { DoNotContactRecord } from "@/features/do-not-contact/types";

import {
  buildSuppressionPreview,
  confirmSuppressionImport,
  previewSuppressionImport,
  type SuppressionImportPersistence,
} from "./suppression-import-service";
import { assessAccountResearch } from "./account-research-service";

const csv = `company_name,status,domain,account_owner,reason,source,last_contact_date,notes
New Customer,EXISTING_CUSTOMER,new.example,Ada,Customer list,crm,2026-01-01,Imported
Open Opp,ACTIVE_OPPORTUNITY,opp.example,Ben,Open opp,crm,2026-01-02,Imported
Bad Status,NOPE,bad.example,,,crm,,
Duplicate Domain,DO_NOT_CONTACT,new.example,,,crm,,`;

function persistence(existing: DoNotContactRecord[] = [], role = "KNOWLEDGE_ADMIN") {
  const records = [...existing];
  const batches: unknown[] = [];
  const adapter: SuppressionImportPersistence = {
    getActor: async (actorId) => ({ id: actorId, role }),
    getExistingRecords: async () => records,
    confirmImport: async ({ preview }) => {
      batches.push(preview);
      records.push(
        ...preview.proposedNewRecords.map((row, index) => ({
          id: `new-${index}`,
          companyName: row.companyName,
          domain: row.domain,
          status: row.status,
          owner: row.accountOwner,
          reason: row.reason,
        })),
      );
      return {
        batchId: "batch-id",
        imported: preview.proposedNewRecords.length,
        updated: preview.proposedUpdates.length,
        skipped: preview.skippedRows.length,
      };
    },
  };
  return { adapter, records, batches };
}

describe("suppression CSV import", () => {
  it("previews valid, invalid, duplicate, and conflict rows without writing", async () => {
    const { adapter, records } = persistence([
      { id: "existing", companyName: "Open Opp", domain: "opp.example", status: "PARTNER" },
    ]);

    const result = await previewSuppressionImport(
      { csvText: csv, filename: "import.csv", mode: "ADD_NEW_ONLY" },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.summary).toMatchObject({ imported: 1, invalid: 1, conflicts: 1 });
      expect(result.data.duplicates).toHaveLength(1);
    }
    expect(records).toHaveLength(1);
  });

  it("rejects missing headers, invalid domains, invalid dates, and formula injection", () => {
    expect(
      buildSuppressionPreview("company_name\nAcme", [], "ADD_NEW_ONLY").invalidRows[0].reason,
    ).toMatch(/Missing/);
    expect(
      buildSuppressionPreview(
        "company_name,status,domain\nAcme,DO_NOT_CONTACT,not-a-domain",
        [],
        "ADD_NEW_ONLY",
      ).invalidRows[0].reason,
    ).toMatch(/Invalid domain/);
    expect(
      buildSuppressionPreview(
        "company_name,status,last_contact_date\nAcme,DO_NOT_CONTACT,today",
        [],
        "ADD_NEW_ONLY",
      ).invalidRows[0].reason,
    ).toMatch(/Invalid last_contact_date/);
    expect(
      buildSuppressionPreview("company_name,status\n=cmd,DO_NOT_CONTACT", [], "ADD_NEW_ONLY")
        .invalidRows[0].reason,
    ).toMatch(/formula/);
  });

  it("confirms valid imports, blocks sales users, and avoids partial invalid imports", async () => {
    const validCsv = `company_name,status,domain\nNew Customer,EXISTING_CUSTOMER,new.example`;
    const { adapter, records, batches } = persistence();
    const confirmed = await confirmSuppressionImport(
      { csvText: validCsv, filename: "valid.csv", mode: "ADD_NEW_ONLY" },
      { persistence: adapter },
    );
    const invalid = await confirmSuppressionImport(
      { csvText: csv, filename: "bad.csv", mode: "ADD_NEW_ONLY" },
      { persistence: adapter },
    );
    const forbidden = await previewSuppressionImport(
      { csvText: validCsv, filename: "valid.csv", mode: "ADD_NEW_ONLY" },
      { persistence: persistence([], "SALES_USER").adapter },
    );

    expect(confirmed.ok && confirmed.data.imported).toBe(1);
    expect(records).toHaveLength(1);
    expect(batches).toHaveLength(1);
    expect(invalid).toMatchObject({ ok: false, code: "IMPORT_INVALID" });
    expect(forbidden).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("imported suppression blocks account research outreach actions", async () => {
    const suppression: DoNotContactRecord = {
      id: "dnc",
      companyName: "Blocked",
      domain: "blocked.example",
      status: "ACTIVE_OPPORTUNITY",
      reason: "Imported open opportunity",
    };
    const result = await assessAccountResearch(
      {
        companyName: "Blocked",
        companyDomain: "blocked.example",
        companyType: "B2B",
        brandedSearchAdsActive: "UNKNOWN",
        strongOrganicBrandVisibility: "UNKNOWN",
        meaningfulBrandedSearchDemand: "UNKNOWN",
        multiMarketOrBrandComplexity: "UNKNOWN",
        dedicatedPaidSearchOrPerformanceTeam: "UNKNOWN",
        meaningfulPaidSearchInvestment: "UNKNOWN",
        existingCustomer: "UNKNOWN",
        activeOpportunity: "UNKNOWN",
        ownedByAnotherRep: "UNKNOWN",
        doNotContactStatus: "UNKNOWN",
        factStatuses: {},
      },
      {
        persistence: {
          getActor: async (actorId) => ({ id: actorId, role: "SALES_USER" }),
          getSuppressionRecords: async () => [suppression],
          persistAssessment: async () => "assessment-id",
        },
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.qualificationResult).toBe("Do not target");
      expect(
        result.data.workflowLinks.find((link) => link.label === "Create Outreach")?.disabled,
      ).toBe(true);
      expect(
        result.data.workflowLinks.find((link) => link.label === "Build Sequence")?.disabled,
      ).toBe(true);
    }
  });
});
