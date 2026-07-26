import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ImportedSignalRecord } from "@/features/imported-signal-review/types";

import { retrieveImportedSignalReview } from "./imported-signal-review-service";
import { getSignalPlaybookData } from "./signal-playbook-service";

vi.mock("./imported-signal-review-service", () => ({
  retrieveImportedSignalReview: vi.fn(),
}));

const mockedRetrieve = vi.mocked(retrieveImportedSignalReview);

function record(overrides: Partial<ImportedSignalRecord>): ImportedSignalRecord {
  return {
    id: "record",
    category: "PRODUCT_TRUTH",
    title: "Record",
    contentType: "Product Truth",
    status: "APPROVED",
    originalText: "Original text",
    approvedWording: "Approved wording",
    channels: ["EMAIL"],
    industries: [],
    personas: [],
    sources: [],
    metrics: [],
    reviewHistory: [],
    isNamedCustomerCaseStudy: false,
    isCompetitorRelated: false,
    ...overrides,
  };
}

describe("Signal Playbook service", () => {
  beforeEach(() => {
    mockedRetrieve.mockReset();
  });

  it("returns approved product truth and approved-only case studies", async () => {
    mockedRetrieve.mockResolvedValue({
      ok: true,
      data: {
        records: [
          record({ id: "truth", category: "PRODUCT_TRUTH", status: "APPROVED" }),
          record({ id: "case-approved", category: "CASE_STUDY", status: "APPROVED" }),
          record({ id: "case-restricted", category: "CASE_STUDY", status: "RESTRICTED" }),
          record({ id: "case-archived", category: "CASE_STUDY", status: "ARCHIVED" }),
        ],
        progress: {
          total: 4,
          approved: 2,
          rejected: 0,
          needsReview: 0,
          restricted: 1,
        },
        sources: [],
        industries: [],
      },
    });

    const data = await getSignalPlaybookData();

    expect(data.approvedProductTruth.map((item) => item.id)).toEqual(["truth"]);
    expect(data.caseStudies.map((item) => item.id)).toEqual(["case-approved"]);
  });
});
