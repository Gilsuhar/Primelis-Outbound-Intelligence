import { describe, expect, it } from "vitest";

import { addKnowledgeSchema, createLocalSubmission } from "./add-knowledge";

const validInput = {
  knowledgeType: "CLAIM",
  title: "Development fixture submission",
  summary: "A neutral development fixture summary.",
  content: "This is neutral factual fixture content for review.",
  product: "Signal",
  sourceTitle: "Development Source",
  sourceType: "INTERNAL_DOCUMENT",
  externalUrl: "https://example.com/source",
  fileReference: "",
  sourceDate: "2026-06-01",
  channels: ["EMAIL"],
  personas: "Sales Representative",
  industries: "General B2B",
  competitors: "",
  internalNotes: "",
  suggestedApprovalStatus: "APPROVED",
} as const;

describe("addKnowledgeSchema", () => {
  it("accepts valid add knowledge submissions", () => {
    const result = addKnowledgeSchema.safeParse(validInput);

    expect(result.success).toBe(true);
  });

  it("rejects invalid URLs", () => {
    const result = addKnowledgeSchema.safeParse({
      ...validInput,
      externalUrl: "not a url",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.includes("externalUrl"))).toBe(true);
  });

  it("requires factual submission content", () => {
    const result = addKnowledgeSchema.safeParse({
      ...validInput,
      content: "   ",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.includes("content"))).toBe(true);
  });

  it("defaults successful local submissions to needs review", () => {
    const parsed = addKnowledgeSchema.parse(validInput);
    const submission = createLocalSubmission(parsed);

    expect(submission.approvalStatus).toBe("NEEDS_REVIEW");
  });
});
