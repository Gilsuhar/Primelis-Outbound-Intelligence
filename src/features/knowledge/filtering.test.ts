import { describe, expect, it } from "vitest";

import { knowledgeItemFixtures } from "@/data/fixtures/knowledge-fixtures";

import { filterKnowledgeItems, getEmptyKnowledgeLibraryFilters } from "./filtering";

describe("knowledge library filtering", () => {
  it("returns expected fixture records by approval status", () => {
    const results = filterKnowledgeItems(knowledgeItemFixtures, {
      ...getEmptyKnowledgeLibraryFilters(),
      approvalStatus: "RESTRICTED",
    });

    expect(results.map((item) => item.id)).toContain("knowledge-objection");
  });

  it("keeps restricted items visibly restricted", () => {
    const restrictedItem = knowledgeItemFixtures.find((item) => item.id === "knowledge-objection");

    expect(restrictedItem?.approvalStatus).toBe("RESTRICTED");
  });

  it("returns expected fixture records by competitor", () => {
    const results = filterKnowledgeItems(knowledgeItemFixtures, {
      ...getEmptyKnowledgeLibraryFilters(),
      competitor: "Generic Search Platform",
    });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("knowledge-competitor");
  });

  it("returns no results for unmatched searches", () => {
    const results = filterKnowledgeItems(knowledgeItemFixtures, {
      ...getEmptyKnowledgeLibraryFilters(),
      search: "no fixture should match this phrase",
    });

    expect(results).toHaveLength(0);
  });
});
