import { describe, expect, it } from "vitest";

import { fixtureUsers, knowledgeSubmissionFixtures } from "@/data/fixtures/knowledge-fixtures";
import { canTransitionSubmission } from "@/lib/permissions";

import { applyReviewAction } from "./actions";

const salesUser = fixtureUsers.find((user) => user.role === "SALES_USER")!;
const adminUser = fixtureUsers.find((user) => user.role === "KNOWLEDGE_ADMIN")!;

describe("review actions", () => {
  it("prevents sales users from approving submissions", () => {
    const submission = knowledgeSubmissionFixtures.find(
      (item) => item.id === "submission-needs-review",
    )!;

    expect(canTransitionSubmission(salesUser, submission, "APPROVED")).toBe(false);
  });

  it("allows knowledge admins to approve when a source exists", () => {
    const submission = knowledgeSubmissionFixtures.find(
      (item) => item.id === "submission-needs-review",
    )!;

    expect(canTransitionSubmission(adminUser, submission, "APPROVED")).toBe(true);
  });

  it("prevents approving claims without a source", () => {
    const submission = knowledgeSubmissionFixtures.find(
      (item) => item.id === "submission-missing-source",
    )!;

    expect(canTransitionSubmission(adminUser, submission, "APPROVED")).toBe(false);
  });

  it("creates review-history entries when an action succeeds", () => {
    const submission = knowledgeSubmissionFixtures.find(
      (item) => item.id === "submission-needs-review",
    )!;
    const result = applyReviewAction(submission, adminUser, "APPROVED");

    expect(result.ok).toBe(true);
    expect(result.submission.reviewHistory).toHaveLength(submission.reviewHistory.length + 1);
    expect(result.submission.reviewHistory[0].toStatus).toBe("APPROVED");
  });
});
