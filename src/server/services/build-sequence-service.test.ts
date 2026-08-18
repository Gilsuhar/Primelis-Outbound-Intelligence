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

  it("rejects non-reference sequence lengths and keeps the sequence fixed at four steps", async () => {
    const { adapter } = persistence([knowledge({ id: "product-truth" })]);

    const rejected = await generateBuildSequence(
      { ...baseInput, sequenceLength: 5 },
      { persistence: adapter },
    );
    const accepted = await generateBuildSequence(baseInput, { persistence: adapter });

    expect(rejected).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Build Sequence needs: Steps.",
    });
    expect(accepted.ok).toBe(true);
    if (accepted.ok) {
      expect(accepted.data.steps).toHaveLength(4);
      expect(new Set(accepted.data.steps.map((step) => step.purpose)).size).toBe(4);
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
      expect(stepTwo.imagePlaceholder).toBe("{{! Insert screenshot }}");
      expect(stepTwo.imageContextNote).toContain("not from Acme");
      expect(stepTwo.imageContextNote).toContain("supplied example");
      expect(stepTwo.messageBody).not.toMatch(/Acme is a solo bidder|Acme has no competitors/i);
    }
  });

  it("keeps approved proof in the final social-proof step instead of Step 2", async () => {
    const { adapter } = persistence([
      knowledge({ id: "product-truth" }),
      knowledge({
        id: "dior-proof",
        title: "Dior fashion proof",
        type: "CASE_STUDY",
        approvedText: "Case study: Dior. Ad cost decreased by 54% while performance stayed stable.",
        sourceIds: ["source-2"],
        sourceTitles: ["Dior approved proof"],
      }),
    ]);

    const result = await generateBuildSequence(
      { ...baseInput, industry: "Fashion and Luxury" },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const stepTwo = result.data.steps[1];
      expect(stepTwo.messageBody).not.toContain("Dior");
      expect(stepTwo.messageBody).not.toContain("54%");
      expect(stepTwo.messageBody).not.toMatch(/a customer example|one customer|a client/i);
      expect(result.data.steps[2].messageBody).toContain("existing Google Ads setup");
      expect(result.data.steps[2].messageBody).not.toContain("Dior example");
      expect(result.data.steps[3].purpose).toBe("SOCIAL_PROOF");
      expect(result.data.steps[3].messageBody).toContain("Dior example");
      expect(result.data.steps[3].messageBody).toContain("54%");
      expect(result.data.steps[3].messageBody).not.toContain("AppsFlyer");
    }
  });

  it("uses the Step 2 screenshot placeholder even when no visual has been supplied yet", async () => {
    const { adapter } = persistence([
      knowledge({ id: "product-truth" }),
      knowledge({
        id: "metricless-case-study",
        title: "Metricless case study",
        type: "CASE_STUDY",
        approvedText: "Approved case study without an external metric.",
        sourceIds: ["source-2"],
      }),
    ]);

    const result = await generateBuildSequence(baseInput, { persistence: adapter });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const stepTwo = result.data.steps[1];
      expect(stepTwo.imagePlaceholder).toBe("{{! Insert screenshot }}");
      expect(stepTwo.messageBody).toMatch(/Signal monitors Google and Bing SERPs minute by minute|visibility/i);
      expect(stepTwo.messageBody).not.toMatch(/\b\d+(?:\.\d+)?\s*%|\bMQL\b|\bSQL\b/i);
      expect(stepTwo.messageBody).not.toMatch(/customer example|one customer|one client/i);
    }
  });

  it("keeps the LELO prompt-regression output free of unsupported assumptions", async () => {
    const { adapter } = persistence([knowledge({ id: "product-truth" })]);

    const result = await generateBuildSequence(
      {
        ...baseInput,
        companyName: "LELO",
        companyWebsite: "lelo.com",
        paidSearchContext: undefined,
        observedTrigger: "Light branded-search process question",
      },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const rendered = JSON.stringify(result.data.steps);
      expect(rendered).not.toMatch(/doing more work than it should/i);
      expect(rendered).not.toMatch(/competitors are taking slots/i);
      expect(rendered).not.toMatch(/organic already covers/i);
      expect(rendered).not.toMatch(/a customer example|one customer|one client/i);
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
        "SOCIAL_PROOF",
      ]);
      expect(result.data.steps[0].messageBody).toMatch(/narrow branded-search question|visibility question/i);
      expect(result.data.steps[1].messageBody).toMatch(/Signal monitors Google and Bing SERPs minute by minute|visibility/i);
      expect(result.data.steps[2].messageBody).toMatch(/existing Google Ads setup|Google and Bing SERPs/i);
      expect(result.data.steps[3].messageBody).toMatch(/AppsFlyer cut branded spend 29%/i);
      expect(result.data.steps[3].cta).toBe("Open to a quick overview?");
    }
  });

  it("uses Prospect Intelligence SERP scenarios in the generated sequence", async () => {
    const { adapter } = persistence([knowledge({ id: "product-truth" })]);
    const cases: Array<{
      evidence?: string;
      scenario: "SOLO" | "CONTESTED" | "MIXED" | "UNKNOWN";
      expectedCopy: RegExp;
      forbiddenCopy?: RegExp;
    }> = [
      {
        evidence: "acme - brand bidding alone\nacme pricing - brand alone",
        scenario: "SOLO",
        expectedCopy: /solo brand moments|solo periods/i,
        forbiddenCopy: /proof of waste/i,
      },
      {
        evidence: "acme shoes - competitor visible\nacme coupon - competitor visible",
        scenario: "CONTESTED",
        expectedCopy: /competitors appearing|minimum CPC|defensive efficiency/i,
        forbiddenCopy: /turn brand ads off/i,
      },
      {
        evidence: "acme - brand alone\nacme shoes - competitor visible",
        scenario: "MIXED",
        expectedCopy: /mixed pattern|different auctions|static brand-bid rule/i,
      },
      {
        scenario: "UNKNOWN",
        expectedCopy: /Without reliable SERP evidence|visibility question/i,
        forbiddenCopy: /only advertiser|competitors appearing/i,
      },
    ];

    for (const item of cases) {
      const result = await generateBuildSequence(
        { ...baseInput, serpEvidence: item.evidence },
        { persistence: adapter },
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        const rendered = JSON.stringify(result.data.steps);
        expect(result.data.prospectIntelligence.serpScenario).toBe(item.scenario);
        expect(rendered).toMatch(item.expectedCopy);
        if (item.forbiddenCopy) {
          expect(rendered).not.toMatch(item.forbiddenCopy);
        }
      }
    }
  });

  it("uses prospect context as personalization without inventing unsupported details", async () => {
    const { adapter } = persistence([knowledge({ id: "product-truth" })]);

    const result = await generateBuildSequence(
      {
        ...baseInput,
        prospectContext:
          "Sam posted about experimentation and growth efficiency across self-serve acquisition.",
      },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.prospectIntelligence.persona).toBe("GROWTH");
      expect(result.data.steps[0].messageBody).toContain("experimentation and growth efficiency");
      expect(JSON.stringify(result.data.steps)).not.toMatch(/budget owner|managed a .* budget|led paid search/i);
    }
  });

  it("accepts managed-account promotion copy through full sequence validation", async () => {
    const { adapter } = persistence([knowledge({ id: "product-truth" })]);

    const result = await generateBuildSequence(
      {
        ...baseInput,
        companyName: "Americaneagle",
        companyWebsite: "americaneagle.com",
        contactFirstName: undefined,
        contactRole: "Head of Performance Marketing",
        companyContext: "Digital agency managing multiple client accounts",
        observedTrigger: "Promotion to PPC Team Lead",
        prospectContext: "Mia Johnson\nPPC Team Lead\nAmericaneagle.com.\nFull-time · 3 yrs 3 mos.",
        serpEvidence: "solo brand moments on all kws biiding",
        brandKeyword: undefined,
      },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const rendered = JSON.stringify(result.data.steps);
      expect(result.data.steps[0].subjectLine).toBe("branded search across managed accounts");
      expect(result.data.steps[0].messageBody).toContain("Hi Mia");
      expect(result.data.steps[0].messageBody).toContain("Congrats on the move to PPC Team Lead");
      expect(rendered).toContain("across multiple accounts");
      expect(rendered).not.toContain("35-60%");
      expect(rendered).not.toContain("250 brands");
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
        sequenceLength: 4,
        desiredOverallDuration: "8 business days",
      },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.steps).toHaveLength(4);
      expect(result.data.steps[0].subjectLine).toContain("Nike");
      expect(result.data.steps[0].messageBody).toContain("Nike");
      expect(result.data.steps[0].messageBody).toContain("VP Performance Marketing");
      expect(result.data.steps[0].messageBody).not.toContain("Fashion and Luxury category");
      expect(result.data.steps[0].messageBody).not.toContain("looks like the kind of account");
      expect(result.data.steps[0].messageBody).toMatch(/narrow branded-search question/i);
      expect(
        result.data.steps[0].messageBody.match(/narrow branded-search question/gi)?.length,
      ).toBe(1);
      expect(result.data.steps[1].messageBody).toMatch(/Signal monitors Google and Bing SERPs minute by minute|visibility/i);
      expect(result.data.steps[3].messageBody).toMatch(/AppsFlyer cut branded spend 29%/i);
      expect(result.data.steps[0].messageBody).toMatch(/brand|branded/i);
      expect(result.data.steps.at(-1)?.purpose).toBe("SOCIAL_PROOF");
      expect(JSON.stringify(result.data.steps)).not.toMatch(/quick discovery|core icp/i);
      expect(JSON.stringify(result.data.steps)).not.toMatch(
        /conversion-source|methodology gives|operational than|branded paid search is incremental/i,
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
      expect(directBody).toMatch(/how do you decide|visibility/i);
      expect(executiveBody).toMatch(/how do you decide|visibility/i);
      expect(directOperator.data.personaEmphasis.emphasis).toBe("operational control");
      expect(executiveGrowth.data.personaEmphasis.emphasis).toBe("governance");
    }
  });

  it("uses valid delays and a purpose-specific final social-proof step", async () => {
    const { adapter } = persistence([knowledge({ id: "product-truth" })]);

    const result = await generateBuildSequence(baseInput, { persistence: adapter });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.steps.every((step) => step.delay.length > 0)).toBe(true);
      expect(result.data.steps.at(-1)).toMatchObject({
        purpose: "SOCIAL_PROOF",
        cta: "Open to a quick overview?",
      });
      expect(`${result.data.steps.at(-1)?.messageBody} ${result.data.steps.at(-1)?.cta}`).toMatch(
        /AppsFlyer cut branded spend 29%|quick overview/i,
      );
    }
  });

  it("allows an explicit final breakup step when selected by the provider", async () => {
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
                purpose: "BREAKUP_CLOSE_LOOP",
                subjectLine: "Quick follow-up",
                messageBody: "Hi Sam,\n\nNot sure if this is a priority right now.",
                cta: "Happy to share more if useful.",
                claimsUsed: ["Signal evaluates paid and organic brand search together to support efficient decisions."],
              }
            : step,
        ),
      };
    };
    const { adapter } = persistence([knowledge({ id: "product-truth" })]);

    const result = await generateBuildSequence(baseInput, { persistence: adapter, provider });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.steps.at(-1)).toMatchObject({
        purpose: "BREAKUP_CLOSE_LOOP",
        cta: "Happy to share more if useful.",
      });
      expect(result.data.steps.at(-1)?.messageBody).toContain("Not sure if this is a priority right now");
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
          "No structured paid-search context was provided; raw context was used conservatively.",
          "No SERP evidence was provided, so account-specific search conditions were not claimed.",
        ]),
      );
      expect(JSON.stringify(result.data.steps)).toContain("Without reliable SERP evidence");
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

  it("uses the approved fallback template when OpenAI output fails structure validation", async () => {
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
            steps: generated.steps.map((step) => ({
              ...step,
              cta: "Worth a quick look?",
            })),
          };
        },
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.provider.providerName).toBe("deterministic-development");
      expect(result.data.safetyNotes).toContain(
        "OpenAI output failed sequence structure validation, so the approved fallback template was used.",
      );
      expect(result.data.steps).toHaveLength(4);
      expect(result.data.steps.map((step) => step.purpose)).toEqual([
        "FIRST_TOUCH_RELEVANCE",
        "PROBLEM_FRAMING",
        "METHODOLOGY_DIFFERENTIATION",
        "SOCIAL_PROOF",
      ]);
    }
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
      { ...baseInput, sequenceLength: 4 },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.recordsUsed.map((record) => record.id)).toContain("eligible-case-study");
      expect(result.data.steps[1].purpose).toBe("PROBLEM_FRAMING");
      expect(result.data.steps[1].messageBody).not.toContain("Dior");
      expect(result.data.steps[1].messageBody).not.toContain("54%");
      expect(result.data.steps[2].messageBody).toContain("existing Google Ads setup");
      expect(result.data.steps[2].messageBody).not.toContain("Dior");
      expect(result.data.steps[3].messageBody).toContain("Dior example");
      expect(result.data.steps[3].messageBody).toContain("54%");
    }
  });
});
