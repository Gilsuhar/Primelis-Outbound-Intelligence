import { describe, expect, it, vi } from "vitest";
import { loadApprovedProductKnowledge } from "./knowledge-agent";
import type { MinimalPrismaClient } from "@/lib/prisma";
import { testKnowledge } from "@/test/workforce-fixtures";
function client(records: unknown[], cases: unknown[] = []) {
  return {
    $queryRaw: vi.fn().mockResolvedValue(records),
    caseStudy: { findMany: vi.fn().mockResolvedValue(cases) },
  } as unknown as MinimalPrismaClient;
}
describe("Product Knowledge Agent uses the actual approved database contract", () => {
  it("loads only source-linked approved external wording and filters restricted records", async () => {
    const db = client([
      ...testKnowledge,
      { ...testKnowledge[0], id: "restricted", restrictions: "Internal only" },
      { ...testKnowledge[0], id: "unsupported", sourceIds: [] },
    ]);
    expect(await loadApprovedProductKnowledge(db)).toEqual(testKnowledge);
    const query = vi.mocked(db.$queryRaw).mock.calls[0][0].join("");
    expect(query).toContain("\"approvalStatus\" = 'APPROVED'");
    expect(query).toContain("'EMAIL' = ANY");
    expect(query).toContain("\"productScope\" = 'Signal'");
  });
  it("requires approved product knowledge even when a customer case study exists", async () => {
    await expect(loadApprovedProductKnowledge(client([]))).rejects.toMatchObject({
      code: "MISSING_KNOWLEDGE",
    });
  });
  it("retains approved case metrics without inventing results or admitting restricted proof", async () => {
    const base = {
      id: "case",
      title: "Test approved case",
      approvalStatus: "APPROVED",
      approvedExternalWording: "Test approved outcome: 12% change in a fictional test record.",
      usageScope: "EMAIL_AND_LINKEDIN",
      usageRestrictions: null,
      sources: [
        { id: "source", approvalStatus: "APPROVED", externalUrl: "https://example.com/proof" },
      ],
    };
    const rows = await loadApprovedProductKnowledge(
      client(testKnowledge, [
        base,
        { ...base, id: "unapproved", approvalStatus: "NEEDS_REVIEW" },
        {
          ...base,
          id: "restricted",
          usageScope: "INTERNAL_ONLY",
          usageRestrictions: "Internal only",
        },
      ]),
    );
    expect(rows.filter((r) => r.kind === "CASE_STUDY")).toHaveLength(1);
    expect(rows[1].text).toBe(base.approvedExternalWording);
  });
});
