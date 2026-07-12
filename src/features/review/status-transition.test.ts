import { describe, expect, it } from "vitest";

import { fixtureUsers, knowledgeSubmissionFixtures } from "@/data/fixtures/knowledge-fixtures";

import { applyStatusTransition, allowedTransitionMatrix } from "./status-transition";

const salesUser = fixtureUsers.find((user) => user.role === "SALES_USER")!;
const adminUser = fixtureUsers.find((user) => user.role === "KNOWLEDGE_ADMIN")!;

describe("status-transition service", () => {
  it("defines the transition matrix explicitly", () => {
    expect(allowedTransitionMatrix.REJECTED).toEqual(["NEEDS_REVIEW"]);
    expect(allowedTransitionMatrix.ARCHIVED).toEqual(["NEEDS_REVIEW"]);
  });

  it("prevents sales users from admin transitions", () => {
    const submission = knowledgeSubmissionFixtures.find(
      (item) => item.id === "submission-needs-review",
    )!;
    const result = applyStatusTransition({ actor: salesUser, submission, action: "APPROVE" });

    expect(result.ok).toBe(false);
    expect(result.submission.reviewHistory).toHaveLength(submission.reviewHistory.length);
  });

  it("allows valid admin approval when a source exists", () => {
    const submission = knowledgeSubmissionFixtures.find(
      (item) => item.id === "submission-needs-review",
    )!;
    const result = applyStatusTransition({ actor: adminUser, submission, action: "APPROVE" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.submission.approvalStatus).toBe("APPROVED");
    }
  });

  it("blocks archived or rejected items from jumping directly to approved", () => {
    const rejected = knowledgeSubmissionFixtures.find((item) => item.id === "submission-rejected")!;
    const result = applyStatusTransition({
      actor: adminUser,
      submission: rejected,
      action: "APPROVE",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INVALID_TRANSITION");
    }
  });

  it("creates one history entry for successful transitions", () => {
    const submission = knowledgeSubmissionFixtures.find(
      (item) => item.id === "submission-needs-review",
    )!;
    const result = applyStatusTransition({ actor: adminUser, submission, action: "RESTRICT" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.submission.reviewHistory).toHaveLength(submission.reviewHistory.length + 1);
    }
  });

  it("does not create history for failed transitions", () => {
    const submission = knowledgeSubmissionFixtures.find(
      (item) => item.id === "submission-missing-source",
    )!;
    const result = applyStatusTransition({ actor: adminUser, submission, action: "APPROVE" });

    expect(result.ok).toBe(false);
    expect(result.submission.reviewHistory).toHaveLength(submission.reviewHistory.length);
  });

  it("prevents permission bypass through the low-level transition service", () => {
    const submission = knowledgeSubmissionFixtures.find(
      (item) => item.id === "submission-needs-review",
    )!;
    const result = applyStatusTransition({ actor: salesUser, submission, action: "REJECT" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("FORBIDDEN");
    }
  });
});
