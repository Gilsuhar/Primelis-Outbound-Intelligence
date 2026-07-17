import { describe, expect, it } from "vitest";

import type {
  BuildSequenceInput,
  BuildSequenceResult,
  SequenceKnowledgeRecord,
} from "@/features/build-sequence/types";
import type { DoNotContactRecord } from "@/features/do-not-contact/types";

import { DeterministicBuildSequenceProvider } from "./build-sequence-provider";
import { generateBuildSequence, type BuildSequencePersistence } from "./build-sequence-service";

const baseInput: BuildSequenceInput = {
  companyName: "Acme",
  companyWebsite: "https://example.invalid",
  contactFirstName: "Sam",
  contactRole: "VP Performance Marketing",
  industry: "Retail",
  companyContext: "Mid-market ecommerce brand",
  geographyOrMarkets: "US and UK",
  paidSearchContext: "Brand search spend appears active across several markets.",
  currentVendor: "Existing search platform",
  observedTrigger: "Hiring for paid search efficiency and market expansion.",
  primaryChannel: "EMAIL",
  sequenceLength: 4,
  desiredTone: "CONSULTATIVE",
  desiredOverallDuration: "12 business days",
  internalNotes: "Keep this conservative.",
  creatorId: "seed-sales-user",
};

function knowledge(overrides: Partial<SequenceKnowledgeRecord>): SequenceKnowledgeRecord {
  return {
    id: "approved-product-truth",
    title: "Approved product truth",
    type: "PRODUCT_TRUTH",
    approvedText:
      "Signal evaluates paid and organic brand search together to support efficient decisions.",
    channels: ["EMAIL", "LINKEDIN", "INTERNAL"],
    sourceIds: ["source-1"],
    sourceTitles: ["Approved source"],
    sourceDates: ["2026-01-01"],
    ...overrides,
  };
}

function isFixtureEligible(record: SequenceKnowledgeRecord, input: BuildSequenceInput) {
  const channelOk =
    record.channels.includes("INTERNAL") ||
    (input.primaryChannel === "MIXED"
      ? record.channels.includes("EMAIL") || record.channels.includes("LINKEDIN")
      : record.channels.includes(input.primaryChannel));
  if (record.type === "CASE_STUDY") {
    return (
      record.approvedText.length > 0 &&
      record.sourceIds.length > 0 &&
      !record.usageRestrictions &&
      (record.usageScope === "EMAIL_AND_LINKEDIN" || record.usageScope === "PUBLIC_MARKETING")
    );
  }
  return (
    channelOk &&
    !record.usageRestrictions &&
    record.sourceIds.length > 0 &&
    record.approvedText.length > 0 &&
    !(
      record.type === "OBJECTION" &&
      /adthena|revvim|competitor|better than/i.test(record.approvedText)
    )
  );
}

function persistence(
  records: SequenceKnowledgeRecord[],
  actorRole = "SALES_USER",
  suppressionRecords: DoNotContactRecord[] = [],
) {
  const persisted: Array<{
    creatorId: string;
    request: BuildSequenceInput;
    result: Omit<BuildSequenceResult, "draftId">;
  }> = [];
  const adapter: BuildSequencePersistence = {
    getActor: async (actorId) => ({ id: actorId, role: actorRole }),
    getSuppressionRecords: async () => suppressionRecords,
    retrieveEligibleKnowledge: async (input) =>
      records.filter((record) => isFixtureEligible(record, input)),
    persistDraft: async (draft) => {
      persisted.push(draft);
      return "sequence-draft-id";
    },
  };
  return { adapter, persisted };
}

describe("Build Sequence service", () => {
  it("blocks sequence generation when the account is in suppression", async () => {
    const suppression: DoNotContactRecord = {
      id: "apollo-customer",
      companyName: "Zenleads Inc. DBA Apollo.io",
      domain: "apollo.io",
      status: "EXISTING_CUSTOMER",
      reason: "Existing Signal customer.",
    };
    const { adapter, persisted } = persistence([knowledge({ id: "product-truth" })], "SALES_USER", [
      suppression,
    ]);

    const result = await generateBuildSequence(
      {
        ...baseInput,
        companyName: "Apollo",
        companyWebsite: undefined,
      },
      { persistence: adapter },
    );

    expect(result).toEqual({
      ok: false,
      code: "SUPPRESSION_BLOCKED",
      message:
        "Do not build a sequence for this account. Zenleads Inc. DBA Apollo.io (apollo.io) is in Do Not Contact / customer suppression as existing customer. Reason: Existing Signal customer. Use it only as internal context or social proof, not as a target account.",
    });
    expect(persisted).toEqual([]);
  });

  it("retrieves only approved eligible knowledge from the persistence boundary", async () => {
    const { adapter } = persistence([
      knowledge({ id: "approved" }),
      knowledge({ id: "needs-review-excluded", sourceIds: [] }),
      knowledge({ id: "restricted-excluded", usageRestrictions: "Internal only." }),
    ]);

    const result = await generateBuildSequence(baseInput, { persistence: adapter });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.recordsUsed.map((record) => record.id)).toEqual(["approved"]);
    }
  });

  it("excludes needs-review content, ineligible case studies, and competitor objections", async () => {
    const { adapter } = persistence([
      knowledge({ id: "product-truth" }),
      knowledge({
        id: "case-study-restricted",
        type: "CASE_STUDY",
        usageScope: "INTERNAL_ONLY",
        approvedText: "Restricted customer evidence.",
      }),
      knowledge({
        id: "competitor-objection",
        type: "OBJECTION",
        approvedText: "Adthena is better than other tools.",
      }),
    ]);

    const result = await generateBuildSequence(baseInput, { persistence: adapter });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.recordsUsed.map((record) => record.id)).toEqual(["product-truth"]);
      expect(result.data.knowledgeLimitations).toContain(
        "No eligible case-study evidence was used in this sequence.",
      );
      expect(JSON.stringify(result.data.steps)).not.toMatch(/adthena|better than/i);
    }
  });

  it("blocks pricing and POC wording from generated output", async () => {
    const { adapter } = persistence([
      knowledge({
        id: "product-truth",
        approvedText: "Signal supports better decisions without POC pricing language.",
      }),
    ]);

    const result = await generateBuildSequence(
      { ...baseInput, internalNotes: "Do not mention pricing or POC." },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(JSON.stringify(result.data.steps)).not.toMatch(/\b(pricing|price|poc|trial)\b/i);
      expect(result.data.safetyNotes).toContain(
        "Pricing, POC, trial, discount, and commercial-offer language was blocked.",
      );
    }
  });

  it("respects sequence length and gives every step a distinct purpose", async () => {
    const { adapter } = persistence([knowledge({ id: "product-truth" })]);

    const result = await generateBuildSequence(
      { ...baseInput, sequenceLength: 5 },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.steps).toHaveLength(5);
      expect(new Set(result.data.steps.map((step) => step.purpose)).size).toBe(5);
    }
  });

  it("rejects repeated or near-duplicate steps", async () => {
    const provider = new DeterministicBuildSequenceProvider();
    const originalGenerate = provider.generate.bind(provider);
    provider.generate = async (request) => {
      const result = await originalGenerate(request);
      return {
        ...result,
        steps: result.steps.map((step) => ({
          ...step,
          messageBody: "Same repeated message body for every step with the same repeated angle.",
        })),
      };
    };
    const { adapter } = persistence([knowledge({ id: "product-truth" })]);

    const result = await generateBuildSequence(baseInput, { persistence: adapter, provider });

    expect(result).toEqual({
      ok: false,
      code: "GENERATION_REJECTED",
      message: "Generated sequence failed safety or quality validation.",
    });
  });

  it("creates mixed-channel steps that differ meaningfully", async () => {
    const { adapter } = persistence([knowledge({ id: "product-truth" })]);

    const result = await generateBuildSequence(
      { ...baseInput, primaryChannel: "MIXED", sequenceLength: 4 },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.steps.some((step) => step.channel === "EMAIL")).toBe(true);
      expect(result.data.steps.some((step) => step.channel === "LINKEDIN")).toBe(true);
      expect(new Set(result.data.steps.map((step) => step.messageBody)).size).toBe(
        result.data.steps.length,
      );
    }
  });

  it("creates a concise Nike-style sequence from quick dropdown inputs", async () => {
    const { adapter } = persistence([
      knowledge({
        id: "product-truth",
        approvedText:
          "Signal combines SERP conditions with Google Ads, Google Search Console and conversion-source data to evaluate blended paid and organic traffic, CPC, conversions and business outcomes.",
      }),
    ]);

    const result = await generateBuildSequence(
      {
        ...baseInput,
        companyName: "Nike",
        contactFirstName: undefined,
        contactRole: "VP Performance Marketing",
        industry: "Fashion and Luxury",
        companyContext: "Strong fit - brand demand and paid-search owner",
        geographyOrMarkets: "United States",
        paidSearchContext: "Runs branded-search ads",
        currentVendor: "Unknown",
        observedTrigger: "Validate branded-search activity",
        sequenceLength: 3,
        desiredOverallDuration: "8 business days",
      },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.steps).toHaveLength(3);
      expect(result.data.steps[0].subjectLine).toContain("Nike");
      expect(result.data.steps[0].messageBody).toContain("Nike");
      expect(result.data.steps[0].messageBody).not.toContain("VP Performance Marketing");
      expect(result.data.steps[0].messageBody).not.toContain("Fashion and Luxury category");
      expect(result.data.steps[0].messageBody).not.toContain("looks like the kind of account");
      expect(result.data.steps[0].messageBody).toMatch(/how do you decide when branded ads/i);
      expect(result.data.steps[1].messageBody).toMatch(/Google does not offer an easy way/i);
      expect(result.data.steps[1].messageBody).toMatch(/captured organically/i);
      expect(result.data.steps[2].messageBody).toMatch(/close the loop/i);
      expect(result.data.steps[0].messageBody).toMatch(/brand|branded/i);
      expect(result.data.steps.at(-1)?.purpose).toBe("BREAKUP_CLOSE_LOOP");
      expect(JSON.stringify(result.data.steps)).not.toMatch(/quick discovery|core icp/i);
      expect(JSON.stringify(result.data.steps)).not.toMatch(
        /SERP|conversion-source|methodology gives|operational than|branded paid search is incremental/i,
      );
      expect(JSON.stringify(result.data.steps)).not.toMatch(/\b(pricing|poc|guarantee)\b/i);
    }
  });

  it("uses valid delays and a low-pressure final breakup step", async () => {
    const { adapter } = persistence([knowledge({ id: "product-truth" })]);

    const result = await generateBuildSequence(baseInput, { persistence: adapter });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.steps.every((step) => step.delay.length > 0)).toBe(true);
      expect(result.data.steps.at(-1)).toMatchObject({
        purpose: "BREAKUP_CLOSE_LOOP",
      });
      expect(`${result.data.steps.at(-1)?.messageBody} ${result.data.steps.at(-1)?.cta}`).toMatch(
        /close the loop|not relevant|no problem/i,
      );
    }
  });

  it("labels assumptions and avoids fabricated account facts", async () => {
    const { adapter } = persistence([knowledge({ id: "product-truth" })]);

    const result = await generateBuildSequence(
      { ...baseInput, companyWebsite: undefined, paidSearchContext: undefined },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(
        result.data.detectedAccountSignals.some((signal) => signal.confidence === "INFERRED"),
      ).toBe(true);
      expect(result.data.knowledgeLimitations).toEqual(
        expect.arrayContaining([
          "Company website was not provided, so account facts are treated conservatively.",
          "No verified paid-search context was provided.",
        ]),
      );
      expect(JSON.stringify(result.data.steps)).toContain("user-provided");
    }
  });

  it("changes persona emphasis by role", async () => {
    const { adapter } = persistence([knowledge({ id: "product-truth" })]);
    const paidSearch = await generateBuildSequence(
      { ...baseInput, contactRole: "Paid Search Director" },
      { persistence: adapter },
    );
    const cmo = await generateBuildSequence(
      { ...baseInput, contactRole: "CMO" },
      { persistence: adapter },
    );

    expect(paidSearch.ok && paidSearch.data.personaEmphasis.emphasis).toBe("operational control");
    expect(cmo.ok && cmo.data.personaEmphasis.emphasis).toBe("governance");
  });

  it("persists generated sequence separately and leaves knowledge unchanged", async () => {
    const original = knowledge({ id: "stable" });
    const { adapter, persisted } = persistence([original]);

    const result = await generateBuildSequence(baseInput, { persistence: adapter });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.draftId).toBe("sequence-draft-id");
      expect(persisted[0].result.provider.providerName).toBe("deterministic-development");
      expect(persisted[0].result.steps).toHaveLength(4);
      expect(original).toEqual(knowledge({ id: "stable" }));
    }
  });

  it("uses deterministic fallback without an API key", async () => {
    const provider = new DeterministicBuildSequenceProvider();

    expect(provider.metadata).toMatchObject({
      providerName: "deterministic-development",
      deterministic: true,
    });
  });

  it("returns structured errors for invalid input and unauthorized users", async () => {
    const { adapter } = persistence([]);
    const invalid = await generateBuildSequence({ companyName: "" }, { persistence: adapter });
    const forbidden = await generateBuildSequence(baseInput, {
      persistence: persistence([knowledge({})], "VIEWER").adapter,
    });

    expect(invalid).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Build Sequence input is malformed.",
    });
    expect(forbidden).toEqual({
      ok: false,
      code: "FORBIDDEN",
      message: "Only authorized sales or knowledge users can build sequences.",
    });
  });

  it("accepts eligible case studies only when usage scope is explicit", async () => {
    const { adapter } = persistence([
      knowledge({ id: "product-truth" }),
      knowledge({
        id: "eligible-case-study",
        title: "Eligible case study",
        type: "CASE_STUDY",
        usageScope: "EMAIL_AND_LINKEDIN",
        approvedText: "An approved customer story can be used for external sales outreach.",
        sourceIds: ["source-2"],
        sourceTitles: ["Case source"],
      }),
    ]);

    const result = await generateBuildSequence(
      { ...baseInput, sequenceLength: 5 },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.recordsUsed.map((record) => record.id)).toContain("eligible-case-study");
      expect(result.data.steps.some((step) => step.purpose === "SOCIAL_PROOF")).toBe(true);
    }
  });
});
