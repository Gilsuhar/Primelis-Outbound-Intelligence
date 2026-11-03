import { describe, expect, it } from "vitest";

import type { ImportedSignalRecord } from "@/features/imported-signal-review/types";

import { retrieveImportedSignalReview } from "./imported-signal-review-service";

function record(overrides: Partial<ImportedSignalRecord>): ImportedSignalRecord {
  return {
    id: "signal-pack-v0-1-message-rule-test",
    category: "MESSAGE_RULE",
    title: "Messaging rule",
    contentType: "Messaging Rule",
    status: "NEEDS_REVIEW",
    originalText: "Answer the question first.",
    channels: ["INTERNAL"],
    industries: [],
    personas: [],
    sources: [
      {
        id: "signal-pack-v0-1-source-test",
        title: "Source",
        sourceType: "INTERNAL_DOCUMENT",
      },
    ],
    metrics: [],
    reviewHistory: [],
    isNamedCustomerCaseStudy: false,
    isCompetitorRelated: false,
    ...overrides,
  };
}

describe("imported Signal review service", () => {
  it("returns imported records with progress and filter options", async () => {
    const result = await retrieveImportedSignalReview({
      records: [
        record({
          id: "signal-pack-v0-1-knowledge-test",
          category: "PRODUCT_TRUTH",
          contentType: "Product Truth",
          industries: ["Retail"],
        }),
        record({
          id: "signal-pack-v0-1-case-study-test",
          category: "CASE_STUDY",
          contentType: "Case Study",
          status: "RESTRICTED",
          industries: ["Luxury"],
        }),
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.records).toHaveLength(2);
      expect(result.data.progress.total).toBe(2);
      expect(result.data.progress.restricted).toBe(1);
      expect(result.data.sources.map((source) => source.id)).toEqual([
        "signal-pack-v0-1-source-test",
      ]);
      expect(result.data.industries).toEqual(["Luxury", "Retail"]);
    }
  });
});
