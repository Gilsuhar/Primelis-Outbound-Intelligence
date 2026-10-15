import { describe, expect, it, vi } from "vitest";
import { verifyApprovedDraftProof, recheckDraftProofs } from "./approved-draft-proof";
import { createDemoFixtures } from "@/features/sales-agent/demo-fixtures";
import type { MinimalPrismaClient } from "@/lib/prisma";
const entry = () => createDemoFixtures()[0].snapshot.research[3];
const record = () => ({
  id: entry().caseStudyId,
  title: "Fictional approved test case",
  approvalStatus: "APPROVED",
  approvedExternalWording: entry().text,
  usageScope: "EMAIL_AND_LINKEDIN",
  usageRestrictions: null,
  sources: [{ id: "approved-source", externalUrl: entry().sourceUrl, approvalStatus: "APPROVED" }],
});
const db = (value: unknown) =>
  ({ caseStudy: { findUnique: vi.fn().mockResolvedValue(value) } }) as unknown as Pick<
    MinimalPrismaClient,
    "caseStudy"
  >;
describe("Sales Agent uses existing approved proof policy and live library state", () => {
  it("accepts only exact approved external wording and its linked approved source", async () => {
    const client = db(record());
    expect(await verifyApprovedDraftProof(entry(), client)).toBe(true);
    expect(client.caseStudy.findUnique).toHaveBeenCalledWith({
      where: { id: entry().caseStudyId },
      include: { sources: true },
    });
  });
  it.each([
    { approvalStatus: "REJECTED" },
    { approvalStatus: "NEEDS_REVIEW" },
    { usageScope: "INTERNAL_ONLY" },
    { usageScope: "SALES_REPLY_ONLY" },
    { usageScope: "DECK_ONLY" },
    { usageScope: null },
    { usageRestrictions: "Confidential. Do not use externally." },
    { approvedExternalWording: "Unapproved wording must never replace the approved claim." },
    { sources: [] },
    { sources: [{ id: "source", externalUrl: entry().sourceUrl, approvalStatus: "NEEDS_REVIEW" }] },
    {
      sources: [
        { id: "source", externalUrl: "https://other.example/source", approvalStatus: "APPROVED" },
      ],
    },
  ])(
    "fails closed for unapproved, restricted, modified or unsupported proof: %j",
    async (change) => {
      expect(await verifyApprovedDraftProof(entry(), db({ ...record(), ...change }))).toBe(false);
    },
  );
  it("does not turn a reviewer's checkbox into approval or fabricate metrics", async () => {
    const client = db(record());
    expect(await verifyApprovedDraftProof({ ...entry(), caseStudyId: undefined }, client)).toBe(
      false,
    );
    expect(await verifyApprovedDraftProof({ ...entry(), approvedForOutbound: false }, client)).toBe(
      false,
    );
    expect(
      await verifyApprovedDraftProof({ ...entry(), text: `${entry().text} Saves 90%.` }, client),
    ).toBe(false);
  });
  it("rechecks approval every time and holds proof if the library is unavailable", async () => {
    const verify = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error("unavailable"));
    expect((await recheckDraftProofs([entry()], verify))[0].approvedForOutbound).toBe(true);
    expect((await recheckDraftProofs([entry()], verify))[0].approvedForOutbound).toBe(false);
    expect((await recheckDraftProofs([entry()], verify))[0].approvedForOutbound).toBe(false);
  });
});
