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
    approvalStatus: "APPROVED",
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
      record.sourceIds.length > 0
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

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("ACCOUNT_STATUS_BLOCKED");
      expect(result.message).toContain("already marked as a Primelis client");
    }
    expect(persisted).toEqual([]);
  });

  it("retrieves only approved eligible knowledge from the persistence boundary", async () => {
    const { adapter } = persistence([
      knowledge({ id: "approved" }),
      knowledge({ id: "draft-excluded", approvalStatus: "DRAFT" }),
      knowledge({ id: "review-excluded", approvalStatus: "NEEDS_REVIEW" }),
      knowledge({ id: "restricted-status-excluded", approvalStatus: "RESTRICTED" }),
      knowledge({ id: "archived-excluded", approvalStatus: "ARCHIVED" }),
      knowledge({ id: "rejected-excluded", approvalStatus: "REJECTED" }),
      knowledge({ id: "needs-review-excluded", sourceIds: [] }),
      knowledge({ id: "restricted-excluded", usageRestrictions: "Internal only." }),
    ]);

    const result = await generateBuildSequence(baseInput, { persistence: adapter });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.recordsUsed.map((record) => record.id)).toEqual(["approved"]);
    }
  });

  it("does not pass unapproved case-study proof to sequence generation", async () => {
    const { adapter } = persistence([
      knowledge({ id: "approved" }),
      knowledge({
        id: "case-study-rejected",
        type: "CASE_STUDY",
        approvalStatus: "REJECTED",
        approvedText: "Rejected proof must not be used.",
      }),
      knowledge({
        id: "case-study-approved",
        type: "CASE_STUDY",
        approvalStatus: "APPROVED",
        approvedText: "Approved case-study proof may be used.",
      }),
    ]);

    const result = await generateBuildSequence(baseInput, { persistence: adapter });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.recordsUsed.map((record) => record.id)).toEqual([
        "approved",
        "case-study-approved",
      ]);
    }
  });

  it("excludes source-less content and competitor objections while allowing approved proof records", async () => {
    const { adapter } = persistence([
      knowledge({ id: "product-truth" }),
      knowledge({
        id: "case-study-approved-proof",
        type: "CASE_STUDY",
        usageScope: "INTERNAL_ONLY",
        usageRestrictions: "Previously required review, now approved by Primelis for outbound use.",
        approvedText: "ZoomInfo cut cost per MQL by 40% while increasing MQL volume.",
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
      expect(result.data.recordsUsed.map((record) => record.id)).toEqual([
        "product-truth",
        "case-study-approved-proof",
      ]);
      expect(result.data.knowledgeLimitations).not.toContain(
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

  it("uses supplied screenshot context as the Step 2 visual evidence placeholder", async () => {
    const { adapter } = persistence([knowledge({ id: "product-truth" })]);

    const result = await generateBuildSequence(
      {
        ...baseInput,
        screenshotAvailable: true,
        screenshotContext: "Generic SERP example supplied by the seller, not from Acme.",
        brandKeyword: "acme",
        marketCountry: "US",
        device: "desktop",
        observationDate: "2026-07-24",
        screenshotShows:
          "Brand ad appears above its organic result and no other advertiser is visible in this supplied example.",
      },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const stepTwo = result.data.steps[1];
      expect(stepTwo.purpose).toBe("PROBLEM_FRAMING");
      expect(stepTwo.imagePlaceholder).toBe("[Insert relevant SERP or Signal screenshot here]");
      expect(stepTwo.imageContextNote).toContain("not from Acme");
      expect(stepTwo.messageBody).toContain("supplied example");
      expect(stepTwo.messageBody).not.toMatch(/Acme is a solo bidder|Acme has no competitors/i);
    }
  });

  it("does not invent screenshot or solo-bidder observations when visual context is absent", async () => {
    const provider = new DeterministicBuildSequenceProvider();
    const originalGenerate = provider.generate.bind(provider);
    provider.generate = async (request) => {
      const result = await originalGenerate(request);
      return {
        ...result,
        steps: result.steps.map((step, index) =>
          index === 1
            ? {
                ...step,
                messageBody:
                  "The screenshot shows Acme as the only advertiser above the organic result.",
              }
            : step,
        ),
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

  it("rejects vague anonymous customer stories in Step 2", async () => {
    const provider = new DeterministicBuildSequenceProvider();
    const originalGenerate = provider.generate.bind(provider);
    provider.generate = async (request) => {
      const result = await originalGenerate(request);
      return {
        ...result,
        steps: result.steps.map((step, index) =>
          index === 1
            ? {
                ...step,
                messageBody:
                  "One customer example showed that branded spend could be reduced without a concrete approved metric.",
              }
            : step,
        ),
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

  it("rejects repeated CTAs and keeps Step 4 shorter than the explanatory steps", async () => {
    const repeatedCtaProvider = new DeterministicBuildSequenceProvider();
    const originalGenerate = repeatedCtaProvider.generate.bind(repeatedCtaProvider);
    repeatedCtaProvider.generate = async (request) => {
      const result = await originalGenerate(request);
      return {
        ...result,
        steps: result.steps.map((step) => ({
          ...step,
          cta: "Worth a brief look?",
        })),
      };
    };
    const { adapter } = persistence([knowledge({ id: "product-truth" })]);

    const rejected = await generateBuildSequence(baseInput, {
      persistence: adapter,
      provider: repeatedCtaProvider,
    });
    const accepted = await generateBuildSequence(baseInput, { persistence: adapter });

    expect(rejected).toEqual({
      ok: false,
      code: "GENERATION_REJECTED",
      message: "Generated sequence failed safety or quality validation.",
    });
    expect(accepted.ok).toBe(true);
    if (accepted.ok) {
      const finalStep = accepted.data.steps.at(-1)!;
      const averageEarlierLength =
        accepted.data.steps.slice(0, -1).reduce((total, step) => total + step.messageBody.length, 0) /
        (accepted.data.steps.length - 1);
      expect(finalStep.messageBody.length).toBeLessThan(averageEarlierLength);
    }
  });

  it("follows the four-step progression for standard email sequences", async () => {
    const { adapter } = persistence([knowledge({ id: "product-truth" })]);

    const result = await generateBuildSequence(baseInput, { persistence: adapter });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.steps.map((step) => step.purpose)).toEqual([
        "FIRST_TOUCH_RELEVANCE",
        "PROBLEM_FRAMING",
        "METHODOLOGY_DIFFERENTIATION",
        "BREAKUP_CLOSE_LOOP",
      ]);
      expect(result.data.steps[0].messageBody).toMatch(/how do you decide/i);
      expect(result.data.steps[1].messageBody).toMatch(/visibility|process question/i);
      expect(result.data.steps[2].messageBody).toMatch(/Google and Bing|competitors return/i);
      expect(result.data.steps[3].messageBody).toMatch(/close|not relevant|no problem/i);
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

  it("rejects a full four-step sequence duplicated inside one rendered step", async () => {
    const provider = new DeterministicBuildSequenceProvider();
    const originalGenerate = provider.generate.bind(provider);
    provider.generate = async (request) => {
      const result = await originalGenerate(request);
      const duplicatedSequence = result.steps
        .map(
          (step) =>
            `Step ${step.stepNumber} - ${step.delay}\n${step.subjectLine ?? ""}\n${step.messageBody}\n${step.cta}`,
        )
        .join("\n\n---\n\n");
      return {
        ...result,
        steps: result.steps.map((step, index) =>
          index === 1
            ? {
                ...step,
                messageBody: `${duplicatedSequence}\n\n---\n\n${duplicatedSequence}`,
              }
            : step,
        ),
      };
    };
    const { adapter, persisted } = persistence([knowledge({ id: "product-truth" })]);

    const result = await generateBuildSequence(baseInput, { persistence: adapter, provider });

    expect(result).toEqual({
      ok: false,
      code: "GENERATION_REJECTED",
      message: "Generated sequence failed safety or quality validation.",
    });
    expect(persisted).toEqual([]);
  });

  it("normalizes a single leading step header but rejects step contamination", async () => {
    const cleanHeaderProvider = new DeterministicBuildSequenceProvider();
    const originalCleanGenerate = cleanHeaderProvider.generate.bind(cleanHeaderProvider);
    cleanHeaderProvider.generate = async (request) => {
      const result = await originalCleanGenerate(request);
      return {
        ...result,
        steps: result.steps.map((step, index) =>
          index === 1
            ? {
                ...step,
                messageBody: `Step 2 - Day 3\n${step.messageBody}`,
              }
            : step,
        ),
      };
    };
    const contaminatedProvider = new DeterministicBuildSequenceProvider();
    const originalContaminatedGenerate = contaminatedProvider.generate.bind(contaminatedProvider);
    contaminatedProvider.generate = async (request) => {
      const result = await originalContaminatedGenerate(request);
      return {
        ...result,
        steps: result.steps.map((step, index) =>
          index === 1
            ? {
                ...step,
                messageBody: `Step 1 - Day 0\n${result.steps[0].messageBody}\n\nStep 2 - Day 3\n${step.messageBody}`,
              }
            : step,
        ),
      };
    };
    const acceptedStore = persistence([knowledge({ id: "product-truth" })]);
    const rejectedStore = persistence([knowledge({ id: "product-truth" })]);

    const accepted = await generateBuildSequence(baseInput, {
      persistence: acceptedStore.adapter,
      provider: cleanHeaderProvider,
    });
    const rejected = await generateBuildSequence(baseInput, {
      persistence: rejectedStore.adapter,
      provider: contaminatedProvider,
    });

    expect(accepted.ok).toBe(true);
    if (accepted.ok) {
      expect(accepted.data.steps[1].messageBody).not.toMatch(/^Step 2/i);
      expect(acceptedStore.persisted[0].result.steps[1].messageBody).not.toMatch(/^Step 2/i);
    }
    expect(rejected).toEqual({
      ok: false,
      code: "GENERATION_REJECTED",
      message: "Generated sequence failed safety or quality validation.",
    });
    expect(rejectedStore.persisted).toEqual([]);
  });

  it("rejects inconsistent prospect names and unrelated final-step companies", async () => {
    const provider = new DeterministicBuildSequenceProvider();
    const originalGenerate = provider.generate.bind(provider);
    provider.generate = async (request) => {
      const result = await originalGenerate(request);
      return {
        ...result,
        steps: result.steps.map((step, index) =>
          index === 0
            ? { ...step, messageBody: step.messageBody.replace("Hi Sam,", "Hi Rex,") }
            : index === result.steps.length - 1
              ? { ...step, messageBody: `${step.messageBody}\n\nIf Uber reviews this later, happy to help.` }
              : step,
        ),
      };
    };
    const { adapter, persisted } = persistence([knowledge({ id: "product-truth" })]);

    const result = await generateBuildSequence(baseInput, { persistence: adapter, provider });

    expect(result).toEqual({
      ok: false,
      code: "GENERATION_REJECTED",
      message: "Generated sequence failed safety or quality validation.",
    });
    expect(persisted).toEqual([]);
  });

  it("rejects unsupported Step 1 crowded-auction and waste claims", async () => {
    const provider = new DeterministicBuildSequenceProvider();
    const originalGenerate = provider.generate.bind(provider);
    provider.generate = async (request) => {
      const result = await originalGenerate(request);
      return {
        ...result,
        steps: result.steps.map((step, index) =>
          index === 0
            ? {
                ...step,
                messageBody:
                  "Hi Sam,\n\nWhen a brand query gets crowded, waste shows up fast and control gets weak.",
              }
            : step,
        ),
      };
    };
    const { adapter } = persistence([knowledge({ id: "product-truth" })]);

    const result = await generateBuildSequence(
      { ...baseInput, paidSearchContext: undefined, internalNotes: undefined },
      { persistence: adapter, provider },
    );

    expect(result).toEqual({
      ok: false,
      code: "GENERATION_REJECTED",
      message: "Generated sequence failed safety or quality validation.",
    });
  });

  it("rejects Step 4 when it restarts the product pitch", async () => {
    const provider = new DeterministicBuildSequenceProvider();
    const originalGenerate = provider.generate.bind(provider);
    provider.generate = async (request) => {
      const result = await originalGenerate(request);
      return {
        ...result,
        steps: result.steps.map((step, index) =>
          index === result.steps.length - 1
            ? {
                ...step,
                messageBody:
                  "Hi Sam,\n\nSignal monitors Google Ads, Search Console, Bing and competitors, then can reduce bids, pause, restore coverage and provide another framework walkthrough.\n\nIf timing is wrong, no need to reply.",
              }
            : step,
        ),
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

  it("passes only the selected approved case-study proof to the sequence provider", async () => {
    let providerRecordIds: string[] = [];
    const provider = new DeterministicBuildSequenceProvider();
    const originalGenerate = provider.generate.bind(provider);
    provider.generate = async (request) => {
      providerRecordIds = request.records.map((record) => record.id);
      return originalGenerate(request);
    };
    const { adapter } = persistence([
      knowledge({ id: "product-truth" }),
      knowledge({
        id: "retail-proof",
        title: "Crocs retail proof",
        type: "CASE_STUDY",
        approvedText:
          "Case study: Crocs. Total branded search spend decreased by 71.2% while monitoring paid and organic performance.",
      }),
      knowledge({
        id: "saas-proof",
        title: "AppsFlyer B2B SaaS proof",
        type: "CASE_STUDY",
        approvedText:
          "Case study: AppsFlyer. Signal protected MQL and SQL quality while reducing wasted brand spend.",
      }),
    ]);

    const result = await generateBuildSequence(baseInput, { persistence: adapter, provider });

    expect(result.ok).toBe(true);
    expect(providerRecordIds).toContain("product-truth");
    expect(providerRecordIds).toContain("retail-proof");
    expect(providerRecordIds).not.toContain("saas-proof");
  });

  it("rejects sequences that use more than one case-study proof company", async () => {
    const provider = new DeterministicBuildSequenceProvider();
    const originalGenerate = provider.generate.bind(provider);
    provider.generate = async (request) => {
      const result = await originalGenerate(request);
      return {
        ...result,
        steps: result.steps.map((step, index) => ({
          ...step,
          messageBody:
            index === 0
              ? "Chloé reduced ad cost by 51% while organic traffic increased."
              : index === 1
                ? "Crocs reduced branded-search spend by 71%."
                : step.messageBody,
        })),
      };
    };
    const { adapter } = persistence([
      knowledge({ id: "product-truth" }),
      knowledge({
        id: "chloe-proof",
        title: "Chloé reduces ad cost",
        type: "CASE_STUDY",
        approvedText: "Case study: Chloé. Metrics: Ad cost decreased by 51%.",
      }),
      knowledge({
        id: "crocs-proof",
        title: "Crocs cuts brand bidding costs",
        type: "CASE_STUDY",
        approvedText: "Case study: Crocs. Metrics: Total branded search spend decreased by 71%.",
      }),
    ]);

    const result = await generateBuildSequence(baseInput, { persistence: adapter, provider });

    expect(result).toEqual({
      ok: false,
      code: "GENERATION_REJECTED",
      message: expect.stringMatching(
        /Generated sequence failed (safety or quality|proof) validation\./,
      ),
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
      expect(
        result.data.steps[0].messageBody.match(/how do you decide when branded ads/gi)?.length,
      ).toBe(1);
      expect(result.data.steps[1].messageBody).toMatch(/visibility|process question/i);
      expect(result.data.steps[1].messageBody).not.toMatch(/Google does not offer an easy way/i);
      expect(result.data.steps[2].messageBody).toMatch(/not relevant|no problem|later/i);
      expect(result.data.steps[0].messageBody).toMatch(/brand|branded/i);
      expect(result.data.steps.at(-1)?.purpose).toBe("BREAKUP_CLOSE_LOOP");
      expect(JSON.stringify(result.data.steps)).not.toMatch(/quick discovery|core icp/i);
      expect(JSON.stringify(result.data.steps)).not.toMatch(
        /SERP|conversion-source|methodology gives|operational than|branded paid search is incremental/i,
      );
      expect(JSON.stringify(result.data.steps)).not.toMatch(/\b(pricing|poc|guarantee)\b/i);
    }
  });

  it("builds a sequence with conservative defaults after a recent-outreach override", async () => {
    const { adapter, persisted } = persistence(
      [knowledge({ id: "product-truth" })],
      "SALES_USER",
    );
    const recentAwareAdapter = {
      ...adapter,
      getRecentDrafts: async () => [
        {
          id: "recent-nike",
          workflow: "CREATE_OUTREACH",
          companyName: "Nike",
          companyDomain: "nike.com",
          createdAt: "2026-07-19T08:00:00.000Z",
        },
      ],
      getRecentAssessments: async () => [],
    };

    const result = await generateBuildSequence(
      {
        companyName: "nike",
        companyWebsite: "nike.com",
        primaryChannel: "EMAIL",
        sequenceLength: 4,
        desiredTone: "CONSULTATIVE",
        accountStatusOverride: true,
        creatorId: "seed-sales-user",
      },
      { persistence: recentAwareAdapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.steps).toHaveLength(4);
      expect(persisted[0].request.contactRole).toBe("Head of Performance Marketing");
      expect(persisted[0].request.companyContext).toBe("Potential fit - validate spend/demand");
      expect(persisted[0].request.observedTrigger).toBe("Light discovery before pitching Signal");
    }
  });

  it("changes copy when persona and tone change", async () => {
    const { adapter } = persistence([knowledge({ id: "product-truth" })]);
    const directOperator = await generateBuildSequence(
      {
        ...baseInput,
        companyName: "Booking.com",
        contactRole: "Head of Paid Search",
        desiredTone: "DIRECT",
      },
      { persistence: adapter },
    );
    const executiveGrowth = await generateBuildSequence(
      {
        ...baseInput,
        companyName: "Booking.com",
        contactRole: "CMO",
        desiredTone: "EXECUTIVE",
      },
      { persistence: adapter },
    );

    expect(directOperator.ok).toBe(true);
    expect(executiveGrowth.ok).toBe(true);
    if (directOperator.ok && executiveGrowth.ok) {
      const directBody = directOperator.data.steps[0].messageBody;
      const executiveBody = executiveGrowth.data.steps[0].messageBody;
      expect(directBody).not.toBe(executiveBody);
      expect(directBody).toMatch(/stay covered|lower bids|organic/i);
      expect(executiveBody).toMatch(/budget control|visibility|business|revenue/i);
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

  it("does not show deterministic fallback as a successful OpenAI sequence", async () => {
    const { adapter } = persistence([knowledge({ id: "product-truth" })]);
    const result = await generateBuildSequence(baseInput, {
      persistence: adapter,
      provider: {
        metadata: {
          providerName: "openai",
          modelName: "gpt-test",
          deterministic: false,
        },
        generate: async ({ input, records, generation }) => {
          const fallback = new DeterministicBuildSequenceProvider();
          const generated = await fallback.generate({
            input,
            records,
            sourceReferences: [],
            generation,
          });
          return {
            ...generated,
            safetyNotes: [
              ...generated.safetyNotes,
              "AI provider failed safely. Deterministic fallback was used.",
            ],
          };
        },
      },
    });

    expect(result).toEqual({
      ok: false,
      code: "AI_PROVIDER_FAILED",
      message:
        "OpenAI did not generate this sequence. AI provider failed safely. Deterministic fallback was used.",
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
      message: "Build Sequence needs: Company, Channel, Steps, Tone.",
    });
    expect(forbidden).toEqual({
      ok: false,
      code: "FORBIDDEN",
      message: "Only authorized sales or knowledge users can build sequences.",
    });
  });

  it("accepts sourced case-study proof even when legacy usage scope is missing", async () => {
    const { adapter } = persistence([
      knowledge({ id: "product-truth" }),
      knowledge({
        id: "eligible-case-study",
        title: "Eligible case study",
        type: "CASE_STUDY",
        usageRestrictions: "Legacy imported restriction.",
        approvedText: "Dior reduced ad cost by 54% at equal performance.",
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
