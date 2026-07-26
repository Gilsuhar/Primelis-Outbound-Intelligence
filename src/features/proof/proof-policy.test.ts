import { describe, expect, it } from "vitest";

import {
  selectProofForContext,
  validateProofUsage,
  type ProofKnowledgeRecord,
} from "./proof-policy";

function record(overrides: Partial<ProofKnowledgeRecord>): ProofKnowledgeRecord {
  return {
    id: "product-truth",
    title: "Signal product truth",
    type: "PRODUCT_TRUTH",
    approvalStatus: "APPROVED",
    approvedText: "Signal monitors paid and organic brand search together.",
    sourceIds: ["source-1"],
    sourceTitles: ["Approved source"],
    sourceDates: ["2026-01-01"],
    ...overrides,
  };
}

describe("proof policy", () => {
  it("selects one industry-relevant approved proof record and drops the others", () => {
    const selection = selectProofForContext(
      [
        record({ id: "truth" }),
        record({
          id: "crocs",
          title: "Crocs retail case study",
          type: "CASE_STUDY",
          approvedText:
            "Case study: Crocs. Crocs reduced total branded search spend by 71.2% while monitoring paid and organic performance.",
          sourceIds: ["crocs-source"],
        }),
        record({
          id: "apps-flyer",
          title: "AppsFlyer SaaS case study",
          type: "CASE_STUDY",
          approvedText:
            "Case study: AppsFlyer. Signal helped a B2B SaaS team protect MQL and SQL quality while reducing wasted brand spend.",
          sourceIds: ["apps-source"],
        }),
      ],
      {
        workflow: "BUILD_SEQUENCE",
        companyName: "Nike",
        industry: "Retail and ecommerce",
        contactRole: "Head of Paid Search",
        question: "Validate branded search efficiency",
        requestedProof: true,
      },
    );

    expect(selection.selectedProof?.customerName).toBe("Crocs");
    expect(selection.records.map((item) => item.id)).toEqual(["truth", "crocs"]);
    expect(selection.notes.join(" ")).toContain("Crocs");
  });

  it("blocks unsupported percentages and non-selected proof customers", () => {
    const records = [
        record({
          id: "crocs",
          title: "Crocs retail case study",
          type: "CASE_STUDY",
          approvedText:
            "Case study: Crocs. Crocs reduced total branded search spend by 71.2% while CPC fell.",
          sourceIds: ["crocs-source"],
        }),
        record({
          id: "chloe",
          title: "Chloe luxury case study",
          type: "CASE_STUDY",
          approvedText: "Case study: Chloe. Ad cost fell 51% while organic traffic grew 35%.",
          sourceIds: ["chloe-source"],
        }),
      ];
    const selection = selectProofForContext(
      records,
      {
        workflow: "CREATE_OUTREACH",
        companyName: "Nike",
        industry: "Retail",
        requestedProof: true,
      },
    );

    expect(
      validateProofUsage({
        output: "Crocs reduced branded search spend by 71% while CPC fell.",
        selectedProof: selection.selectedProof,
        availableProofRecords: records,
        maxMetricMentions: 1,
      }),
    ).toMatchObject({ ok: true });

    expect(
      validateProofUsage({
        output: "Chloe reduced ad cost by 51% and Crocs reduced spend by 71%.",
        selectedProof: selection.selectedProof,
        availableProofRecords: records,
      }),
    ).toMatchObject({ ok: false });

    expect(
      validateProofUsage({
        output: "Crocs reduced branded search spend by 60%.",
        selectedProof: selection.selectedProof,
        availableProofRecords: records,
      }),
    ).toMatchObject({ ok: false });
  });

  it("does not select proof when it was not requested and no context matches", () => {
    const selection = selectProofForContext(
      [
        record({ id: "truth" }),
        record({
          id: "proof",
          title: "Retail case study",
          type: "CASE_STUDY",
          approvedText: "Case study: RetailCo. Brand spend fell by 40%.",
          sourceIds: ["proof-source"],
        }),
      ],
      {
        workflow: "REPLY_TO_PROSPECT",
        companyName: "Unknown",
        question: "Thanks, timing is not right.",
      },
    );

    expect(selection.selectedProof).toBeUndefined();
    expect(selection.records.map((item) => item.id)).toEqual(["truth"]);
  });
});
