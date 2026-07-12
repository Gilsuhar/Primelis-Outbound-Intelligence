import { describe, expect, it } from "vitest";

import { retrieveApprovedKnowledge } from "./approved-knowledge-service";
import { submitGeneratedDraftBoundary } from "./generated-draft-service";
import { createKnowledgeSubmission } from "./knowledge-submission-service";
import { transitionReviewStatus } from "./review-status-service";

describe("server-side service boundaries", () => {
  it("validates malformed knowledge submission input", async () => {
    const result = await createKnowledgeSubmission({ title: "" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("VALIDATION_ERROR");
    }
  });

  it("validates malformed review transition input", async () => {
    const result = await transitionReviewStatus({ actorId: "" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("VALIDATION_ERROR");
    }
  });

  it("does not expose approval without permission checks", async () => {
    const result = await transitionReviewStatus({
      actorId: "fixture-user-sales",
      submissionId: "submission-needs-review",
      action: "APPROVE",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("FORBIDDEN");
    }
  });

  it("retrieves approved knowledge through the generation boundary", async () => {
    const result = await retrieveApprovedKnowledge();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.knowledgeItems.every((item) => item.approvalStatus === "APPROVED")).toBe(
        true,
      );
    }
  });

  it("submits generated drafts for review with origin metadata", async () => {
    const result = await submitGeneratedDraftBoundary({
      generatedDraftId: "generated-draft-fixture",
      title: "Generated Draft Boundary Submission",
      suggestedType: "MESSAGE_EXAMPLE",
      submitterRole: "SALES_USER",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.approvalStatus).toBe("NEEDS_REVIEW");
      expect(result.data.origin?.type).toBe("GENERATED_DRAFT");
    }
  });
});
