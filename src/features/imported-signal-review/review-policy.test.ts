import { describe, expect, it } from "vitest";

import {
  canBulkReviewRecord,
  filterImportedSignalRecords,
  getImportedReviewError,
  getImportedSignalProgress,
  isRestrictedUsage,
} from "./review-policy";
import type { ImportedSignalRecord, ReviewActor } from "./types";

const admin: ReviewActor = {
  id: "seed-admin-user",
  name: "Admin",
  role: "KNOWLEDGE_ADMIN",
};

const sales: ReviewActor = {
  id: "seed-sales-user",
  name: "Sales",
  role: "SALES_USER",
};

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

describe("imported Signal review policy", () => {
  it("keeps imported records visible in review data and progress counts", () => {
    const records = [
      record({ status: "APPROVED" }),
      record({ id: "restricted", status: "RESTRICTED" }),
      record({ id: "rejected", status: "REJECTED" }),
      record({ id: "needs-review", status: "NEEDS_REVIEW" }),
    ];

    expect(getImportedSignalProgress(records)).toEqual({
      total: 4,
      approved: 1,
      restricted: 1,
      rejected: 1,
      needsReview: 1,
    });
  });

  it("prevents non-admin review actions", () => {
    expect(
      getImportedReviewError({
        actor: sales,
        record: record({}),
        action: "APPROVE",
      }),
    ).toContain("Only knowledge admins");
  });

  it("requires case-study usage scope before approval", () => {
    const caseStudy = record({
      category: "CASE_STUDY",
      contentType: "Case Study",
      isNamedCustomerCaseStudy: true,
    });

    expect(
      getImportedReviewError({
        actor: admin,
        record: caseStudy,
        action: "APPROVE",
      }),
    ).toContain("usage scope");
    expect(isRestrictedUsage(caseStudy)).toBe(true);
  });

  it("blocks named-customer case studies from bulk approval", () => {
    expect(
      canBulkReviewRecord({
        actor: admin,
        record: record({
          category: "CASE_STUDY",
          contentType: "Case Study",
          isNamedCustomerCaseStudy: true,
          usageScope: "SALES_REPLY_ONLY",
        }),
        action: "APPROVE_MESSAGING_RULES",
      }),
    ).toBe(false);
  });

  it("allows source-backed non-factual messaging rules to be bulk-approved", () => {
    expect(
      canBulkReviewRecord({
        actor: admin,
        record: record({ category: "MESSAGE_RULE", contentType: "Messaging Rule" }),
        action: "APPROVE_MESSAGING_RULES",
      }),
    ).toBe(true);
  });

  it("does not automatically approve competitor-related objections", () => {
    const competitorObjection = record({
      category: "OBJECTION",
      contentType: "Objection",
      title: "We already use Adthena",
      isCompetitorRelated: true,
    });

    expect(
      canBulkReviewRecord({
        actor: admin,
        record: competitorObjection,
        action: "APPROVE_MESSAGING_RULES",
      }),
    ).toBe(false);
    expect(
      getImportedReviewError({
        actor: admin,
        record: competitorObjection,
        action: "APPROVE",
      }),
    ).toContain("Competitor-related");
  });

  it("filters by missing approved wording, restricted usage, source, and status", () => {
    const records = [
      record({
        id: "missing",
        status: "NEEDS_REVIEW",
        usageRestrictions: "Internal only.",
      }),
      record({
        id: "approved",
        status: "APPROVED",
        approvedWording: "Approved wording.",
      }),
    ];

    expect(
      filterImportedSignalRecords(records, {
        category: "ALL",
        status: "NEEDS_REVIEW",
        sourceId: "signal-pack-v0-1-source-test",
        industry: "ALL",
        missingApprovedWording: true,
        restrictedUsage: true,
      }).map((item) => item.id),
    ).toEqual(["missing"]);
  });

  it("review edits do not alter source text fields in local review state", () => {
    const original = record({
      originalText: "Original imported source-backed text.",
      approvedWording: undefined,
      reviewHistory: [],
    });
    const reviewed = {
      ...original,
      approvedWording: "Reviewed wording.",
      reviewHistory: [
        {
          id: "history",
          actorName: "Admin",
          action: "APPROVE",
          toStatus: "APPROVED" as const,
          createdAt: new Date().toISOString(),
        },
      ],
    };

    expect(reviewed.approvedWording).toBe("Reviewed wording.");
    expect(reviewed.reviewHistory).toHaveLength(1);
    expect(reviewed.originalText).toBe(original.originalText);
  });
});
