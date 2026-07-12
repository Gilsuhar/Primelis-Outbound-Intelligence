import { describe, expect, it } from "vitest";

import { fixtureKnowledgeAdapter } from "@/data/adapters/fixture-knowledge-adapter";
import { getAdminReviewableKnowledgeItems } from "@/features/knowledge/admin-queries";

import {
  getApprovedCaseStudies,
  getApprovedClaims,
  getApprovedCompetitorMaterial,
  getApprovedKnowledgeItems,
  getApprovedMessageExamples,
} from "./approved-queries";

describe("approved generation-facing queries", () => {
  it("returns only approved knowledge records", () => {
    const records = getApprovedKnowledgeItems(fixtureKnowledgeAdapter);

    expect(records.length).toBeGreaterThan(0);
    expect(records.every((record) => record.approvalStatus === "APPROVED")).toBe(true);
  });

  it("excludes restricted, draft, needs-review, archived, and rejected material", () => {
    const records = getApprovedKnowledgeItems(fixtureKnowledgeAdapter);
    const statuses = new Set<string>(records.map((record) => record.approvalStatus));

    expect(statuses.has("RESTRICTED")).toBe(false);
    expect(statuses.has("DRAFT")).toBe(false);
    expect(statuses.has("NEEDS_REVIEW")).toBe(false);
    expect(statuses.has("ARCHIVED")).toBe(false);
    expect(statuses.has("REJECTED")).toBe(false);
  });

  it("returns only approved claims, case studies, and message examples", () => {
    expect(
      getApprovedClaims(fixtureKnowledgeAdapter).every(
        (claim) => claim.approvalStatus === "APPROVED",
      ),
    ).toBe(true);
    expect(
      getApprovedCaseStudies(fixtureKnowledgeAdapter).every(
        (caseStudy) => caseStudy.approvalStatus === "APPROVED",
      ),
    ).toBe(true);
    expect(
      getApprovedMessageExamples(fixtureKnowledgeAdapter).every(
        (item) => item.approvalStatus === "APPROVED" && item.knowledgeType === "MESSAGE_EXAMPLE",
      ),
    ).toBe(true);
  });

  it("does not return draft competitor material in default generation queries", () => {
    expect(getApprovedCompetitorMaterial(fixtureKnowledgeAdapter)).toHaveLength(0);
  });

  it("allows admin review queries to retrieve non-approved reviewable items", () => {
    const records = getAdminReviewableKnowledgeItems(fixtureKnowledgeAdapter);

    expect(records.some((record) => record.approvalStatus !== "APPROVED")).toBe(true);
  });
});
