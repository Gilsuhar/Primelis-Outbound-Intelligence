import { describe, expect, it } from "vitest";

import { generatedDraftFixtures } from "@/data/fixtures/knowledge-fixtures";
import { fixtureKnowledgeAdapter } from "@/data/adapters/fixture-knowledge-adapter";
import { getApprovedKnowledgeItems } from "@/features/knowledge/approved-queries";

import {
  assertGeneratedDraftCannotBeApproved,
  submitGeneratedDraftForReview,
} from "./generated-draft-service";

describe("generated draft separation", () => {
  it("prevents generated drafts from being approved", () => {
    const draft = { ...generatedDraftFixtures[0], approvalStatus: "APPROVED" };

    expect(assertGeneratedDraftCannotBeApproved(draft)).toBe(false);
  });

  it("does not include generated drafts in approved knowledge queries", () => {
    const approvedKnowledge = getApprovedKnowledgeItems(fixtureKnowledgeAdapter);

    expect(approvedKnowledge.some((item) => item.id === generatedDraftFixtures[0].id)).toBe(false);
  });

  it("submits generated drafts only as needs-review submissions with origin metadata", () => {
    const submission = submitGeneratedDraftForReview({
      draft: generatedDraftFixtures[0],
      title: "Generated Draft Review Submission",
      suggestedType: "MESSAGE_EXAMPLE",
      submitterRole: "SALES_USER",
    });

    expect(submission.approvalStatus).toBe("NEEDS_REVIEW");
    expect(submission.origin).toEqual({
      type: "GENERATED_DRAFT",
      generatedDraftId: generatedDraftFixtures[0].id,
      workflow: generatedDraftFixtures[0].workflow,
    });
  });
});
