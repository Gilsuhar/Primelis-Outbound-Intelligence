import { describe, expect, it } from "vitest";

import { canApplyReviewAction } from "@/features/review/status-transition";
import { getNavigationForRole } from "@/lib/navigation";
import { getTrustedRoleContext, normalizeTrustedRole } from "@/lib/role-context";

describe("role-based navigation", () => {
  it("shows the simplified sales navigation for sales users", () => {
    const navigation = getNavigationForRole("SALES_USER");

    expect(navigation.sales.map((item) => item.href)).toEqual([
      "/",
      "/playbook",
      "/account-research",
      "/icp-insights",
      "/create-outreach",
      "/build-sequence",
      "/reply-to-prospect",
      "/ask-signal-brain",
      "/do-not-contact",
    ]);
    expect(navigation.admin).toEqual([]);
  });

  it("adds admin navigation for knowledge admins", () => {
    const navigation = getNavigationForRole("KNOWLEDGE_ADMIN");

    expect(navigation.admin.map((item) => item.href)).toEqual([
      "/knowledge-library",
      "/add-knowledge",
      "/review-queue",
      "/imported-signal-review",
      "/account-research/import",
      "/claims/development-fixture",
    ]);
  });

  it("derives role from a constrained trusted context", () => {
    expect(normalizeTrustedRole("KNOWLEDGE_ADMIN")).toBe("KNOWLEDGE_ADMIN");
    expect(normalizeTrustedRole("anything-else")).toBe("SALES_USER");
    expect(
      getTrustedRoleContext({
        ...process.env,
        PRIMELIS_ROLE_CONTEXT: "KNOWLEDGE_ADMIN",
      }).role,
    ).toBe("KNOWLEDGE_ADMIN");
  });

  it("sales role cannot perform admin review actions", () => {
    expect(
      canApplyReviewAction(
        { id: "sales", name: "Sales", role: "SALES_USER" },
        {
          id: "submission",
          title: "Submission",
          submitterId: "sales",
          submitterRole: "SALES_USER",
          knowledgeType: "PRODUCT_TRUTH",
          approvalStatus: "NEEDS_REVIEW",
          sourceIds: ["source"],
          submittedAt: new Date().toISOString(),
          summary: "Summary",
          content: "Content",
          channels: ["EMAIL"],
          personas: [],
          industries: [],
          competitors: [],
          reviewHistory: [],
          isClaim: false,
        },
        "APPROVE",
      ),
    ).toBe(false);
  });
});
