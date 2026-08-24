import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type {
  BuildSequenceInput,
  BuildSequenceResult,
  ProspectMemory,
  ProspectRecord,
  ProspectSource,
  SequenceKnowledgeRecord,
} from "@/features/build-sequence/types";
import type { DoNotContactRecord } from "@/features/do-not-contact/types";
import {
  factsFromExtraction,
  mergeProspectRecord,
  resolveIdentity,
} from "@/features/build-sequence/prospect-memory";

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

const originalAiProvider = process.env.AI_PROVIDER;

beforeEach(() => {
  process.env.AI_PROVIDER = "deterministic-development";
});

afterEach(() => {
  if (originalAiProvider === undefined) {
    delete process.env.AI_PROVIDER;
  } else {
    process.env.AI_PROVIDER = originalAiProvider;
  }
});

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
    prospectId?: string;
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

function prospectPersistence({
  records = [knowledge({ id: "product-truth" })],
  initialProspects = [],
}: {
  records?: SequenceKnowledgeRecord[];
  initialProspects?: ProspectRecord[];
} = {}) {
  const base = persistence(records);
  const prospects = [...initialProspects];
  const sources: ProspectSource[] = [];
  const facts: ProspectMemory["facts"] = [];
  let nextId = prospects.length + 1;
  const sourceCounts = new Map<string, number>();
  const adapter: BuildSequencePersistence = {
    ...base.adapter,
    listProspects: async () => prospects,
    createProspectMemory: async ({ creatorId, extraction, rawText, identityResolution }) => {
      const prospect: ProspectRecord = {
        id: `prospect-${nextId++}`,
        firstName: extraction.firstName,
        lastName: extraction.lastName,
        fullName: extraction.fullName,
        email: extraction.email,
        jobTitle: extraction.jobTitle,
        companyName: extraction.companyName,
        companyDomain: extraction.companyDomain,
        linkedinUrl: extraction.linkedinUrl,
        status: "CONTEXT_READY",
        createdAt: "2026-08-23T00:00:00.000Z",
        updatedAt: "2026-08-23T00:00:00.000Z",
      };
      void creatorId;
      prospects.push(prospect);
      const source: ProspectSource = {
        id: `source-${sources.length + 1}`,
        prospectId: prospect.id,
        type: "MANUAL_PASTE",
        rawContent: rawText,
        sourceLabel: "Manual paste",
        createdAt: "2026-08-23T00:00:00.000Z",
      };
      sources.push(source);
      sourceCounts.set(prospect.id, (sourceCounts.get(prospect.id) ?? 0) + 1);
      const extractedFacts = factsFromExtraction(source, extraction);
      facts.push(...extractedFacts);
      return {
        prospect,
        source,
        sourceCount: sourceCounts.get(prospect.id) ?? 1,
        extraction,
        facts: extractedFacts,
        identityResolution,
        conflicts: [],
      };
    },
    updateProspectMemory: async ({ prospectId, extraction, rawText, identityResolution }) => {
      const existingIndex = prospects.findIndex((prospect) => prospect.id === prospectId);
      const existing = prospects[existingIndex];
      const merged = mergeProspectRecord(existing, extraction);
      prospects[existingIndex] = merged.prospect;
      const source: ProspectSource = {
        id: `source-${sources.length + 1}`,
        prospectId,
        type: "MANUAL_PASTE",
        rawContent: rawText,
        sourceLabel: "Manual paste",
        createdAt: "2026-08-23T00:00:00.000Z",
      };
      sources.push(source);
      sourceCounts.set(prospectId, (sourceCounts.get(prospectId) ?? 0) + 1);
      const extractedFacts = factsFromExtraction(source, extraction);
      facts.push(...extractedFacts);
      return {
        prospect: prospects[existingIndex],
        source,
        sourceCount: sourceCounts.get(prospectId) ?? 1,
        extraction,
        facts: extractedFacts,
        identityResolution,
        conflicts: merged.conflicts,
      };
    },
    persistDraft: async (draft) => {
      base.persisted.push(draft);
      return "sequence-draft-id";
    },
  };
  return { adapter, persisted: base.persisted, prospects, sources, facts };
}

function existingProspect(overrides: Partial<ProspectRecord>): ProspectRecord {
  return {
    id: "existing-prospect",
    firstName: "Chris",
    lastName: "Example",
    fullName: "Chris Example",
    email: undefined,
    jobTitle: "Head of Growth",
    companyName: "Remofirst",
    companyDomain: "remofirst.com",
    linkedinUrl: undefined,
    status: "CONTEXT_READY",
    createdAt: "2026-08-22T00:00:00.000Z",
    updatedAt: "2026-08-22T00:00:00.000Z",
    ...overrides,
  };
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
      expect(stepTwo.imagePlaceholder).toBeUndefined();
      expect(stepTwo.imageContextNote).toContain("not from Acme");
      expect(stepTwo.imageContextNote).toContain("supplied example");
      expect(stepTwo.imageContextNote).toContain("outside the email body");
      expect(stepTwo.messageBody).not.toMatch(/Acme is a solo bidder|Acme has no competitors/i);
      expect(stepTwo.messageBody).not.toContain("{{! Insert screenshot }}");
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

  it("keeps the Step 2 screenshot reminder out of the rendered email body", async () => {
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
      expect(stepTwo.imagePlaceholder).toBeUndefined();
      expect(stepTwo.imageContextNote).toContain("outside the email body");
      expect(stepTwo.messageBody).toMatch(/Signal monitors Google and Bing SERPs minute by minute|visibility/i);
      expect(stepTwo.messageBody).not.toContain("{{! Insert screenshot }}");
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
      message: expect.stringContaining("Generated sequence failed safety or quality validation"),
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
      message: expect.stringContaining("Generated sequence failed safety or quality validation"),
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
      message: expect.stringContaining("Generated sequence failed safety or quality validation"),
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
        expectedCopy: /Without account-specific auction evidence|visibility question/i,
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
        prospectContext: "About\nMia Johnson\nPPC Team Lead\nAmericaneagle.com.\nOct 2025 - Present · 11 mos.",
        keywords: [
          { term: "Americaneagle web design", status: "contested", competitor: "WebFX" },
          { term: "Americaneagle ecommerce", status: "solo" },
        ],
        brandKeyword: undefined,
      },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const rendered = JSON.stringify(result.data.steps);
      expect(result.data.steps[0].subjectLine).toBe("branded search across managed accounts");
      expect(result.data.steps[0].messageBody).toContain("Hi Mia");
      expect(result.data.steps[0].messageBody).toContain("Congrats on your promotion to PPC Team Lead");
      expect(result.data.steps[1].messageBody).toContain("\"Americaneagle web design\" was a contested brand auction with WebFX visible");
      expect(result.data.steps[2].messageBody).toContain("\"Americaneagle ecommerce\"");
      expect(result.data.steps[2].messageBody).toContain("solo brand auction");
      expect(rendered).toContain("across multiple accounts");
      expect(rendered).not.toContain("Hi About");
      expect(rendered).not.toContain("Oct 2025");
      expect(rendered).not.toContain("35-60%");
      expect(rendered).not.toContain("250 brands");
    }
  });

  it("filters structured keyword evidence that does not match the prospect account", async () => {
    const { adapter } = persistence([knowledge({ id: "product-truth" })]);

    const result = await generateBuildSequence(
      {
        ...baseInput,
        companyName: "Americaneagle",
        companyWebsite: "americaneagle.com",
        contactRole: "PPC Team Lead",
        companyContext: "Digital agency managing multiple client accounts",
        keywords: [
          { term: "Nike running shoes", status: "contested", competitor: "Adidas" },
        ],
      },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const rendered = JSON.stringify(result.data);
      expect(rendered).not.toContain("Nike running shoes");
      expect(result.data.safetyNotes).toContain("Mismatched keyword evidence was filtered before generation.");
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
      message: expect.stringContaining("Generated sequence failed safety or quality validation"),
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
      message: expect.stringContaining("Generated sequence failed safety or quality validation"),
    });
    expect(persisted).toEqual([]);
  });

  it("keeps hybrid-validated OpenAI copy instead of replacing the whole sequence with the template", async () => {
    const provider = new DeterministicBuildSequenceProvider();
    provider.metadata = {
      providerName: "openai",
      modelName: "gpt-test",
      deterministic: false,
    };
    const originalGenerate = provider.generate.bind(provider);
    provider.generate = async (request) => {
      const result = await originalGenerate(request);
      return {
        ...result,
        safetyNotes: [...result.safetyNotes, "Hybrid rewrite accepted for step 1."],
        steps: result.steps.map((step, index) =>
          index === 0
            ? {
                ...step,
                subjectLine: "acme brand coverage",
                messageBody:
                  "Hi Sam,\n\nAcme's branded search is worth one narrow look.\n\nA campaign can look healthy while the brand auction is quiet.",
              }
            : step,
        ),
      };
    };
    const { adapter } = persistence([knowledge({ id: "product-truth" })]);

    const result = await generateBuildSequence(baseInput, { persistence: adapter, provider });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.provider.providerName).toBe("openai");
      expect(result.data.steps[0].messageBody).toContain("Acme's branded search is worth one narrow look");
      expect(result.data.safetyNotes).toContain("Hybrid rewrite accepted for step 1.");
    }
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
      message: expect.stringContaining("Generated sequence failed safety or quality validation"),
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
      message: expect.stringContaining("Generated sequence failed safety or quality validation"),
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
      message: expect.stringContaining("Generated sequence failed safety or quality validation"),
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
      message: expect.stringContaining("Generated sequence failed safety or quality validation"),
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
      message: expect.stringContaining("Generated sequence failed safety or quality validation"),
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

  it("builds a draft with conservative defaults and a warning when recent outreach exists", async () => {
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
        creatorId: "seed-sales-user",
      },
      { persistence: recentAwareAdapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.steps).toHaveLength(4);
      expect(result.data.safetyNotes).toContain(
        "Existing ownership or recent outreach activity found for Nike. Review this before sending or pushing to CRM.",
      );
      expect(persisted[0].request.contactRole).toBe("Head of Performance Marketing");
      expect(persisted[0].request.companyContext).toBe("Potential fit - validate spend/demand");
      expect(persisted[0].request.observedTrigger).toBe("Light discovery before pitching Signal");
    }
  });

  it("generates Cisco from pasted context despite existing activity and surfaces a warning", async () => {
    const { adapter } = prospectPersistence({ records: [knowledge({ id: "product-truth" })] });
    const recentAwareAdapter = {
      ...adapter,
      getRecentDrafts: async () => [
        {
          id: "recent-cisco",
          workflow: "BUILD_SEQUENCE",
          companyName: "Cisco",
          companyDomain: "cisco.com",
          createdAt: "2026-08-01T08:00:00.000Z",
        },
      ],
      getRecentAssessments: async () => [],
    };

    const result = await generateBuildSequence(
      {
        ...baseInput,
        companyName: "",
        companyWebsite: undefined,
        contactFirstName: undefined,
        rawProspectContext:
          "Morgan Lee\nCisco\nDirector of Paid Search\nGoogle Ads live SERP competition context",
      },
      { persistence: recentAwareAdapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.steps).toHaveLength(4);
      expect(result.data.prospectMemory?.prospect.companyName).toBe("Cisco");
      expect(result.data.safetyNotes).toContain(
        "Existing ownership or recent outreach activity found for Cisco. Review this before sending or pushing to CRM.",
      );
    }
  });

  it("does not add an account-activity warning for a clean account", async () => {
    const { adapter } = prospectPersistence({ records: [knowledge({ id: "product-truth" })] });

    const result = await generateBuildSequence(
      {
        ...baseInput,
        companyName: "",
        companyWebsite: undefined,
        contactFirstName: undefined,
        rawProspectContext: "Avery Stone\nCleanCo\nDirector of Paid Search",
      },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.steps).toHaveLength(4);
      expect(result.data.safetyNotes).not.toEqual(
        expect.arrayContaining([
          expect.stringContaining("Existing ownership or recent outreach activity found"),
        ]),
      );
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
      expect(directBody).toMatch(/how do you decide|how do you see|visibility/i);
      expect(executiveBody).toMatch(/how do you decide|how do you see|visibility/i);
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
      expect(JSON.stringify(result.data.steps)).toContain("Without account-specific auction evidence");
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

  it("recovers repeated OpenAI CTAs without replacing the full sequence", async () => {
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
            steps: generated.steps.map((step, index) =>
              index === 1
                ? {
                    ...step,
                    cta: generated.steps[0].cta,
                  }
                : step,
            ),
          };
        },
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.provider.providerName).toBe("openai");
      expect(result.data.safetyNotes.join(" ")).toContain("Final validation recovered");
      expect(result.data.diagnostics?.finalFullSequenceFallbackUsed).toBe(false);
      expect(result.data.diagnostics?.finalRecoveredStepNumbers).toEqual([2]);
      expect(result.data.steps).toHaveLength(4);
      expect(result.data.steps.map((step) => step.purpose)).toEqual([
        "FIRST_TOUCH_RELEVANCE",
        "PROBLEM_FRAMING",
        "METHODOLOGY_DIFFERENTIATION",
        "SOCIAL_PROOF",
      ]);
    }
  });

  it("preserves valid AI steps while replacing only a locally invalid step", async () => {
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
              "Hybrid rewrite accepted for step 1.",
              "Hybrid rewrite accepted for step 3.",
              "Hybrid rewrite accepted for step 4.",
            ],
            steps: generated.steps.map((step, index) =>
              index === 0
                ? {
                    ...step,
                    messageBody:
                      "Hi Sam,\n\nAcme's branded-search visibility is worth one narrow look.\n\nA campaign can look healthy while the auction changes underneath it.",
                  }
                : index === 1
                  ? {
                      ...step,
                      messageBody:
                        "Hi Sam,\n\nCan you see this today? Do you check this manually? Would that change how you bid?",
                    }
                  : index === 2
                    ? {
                        ...step,
                        messageBody:
                          "Hi Sam,\n\nThe useful method is comparing live search-page conditions before changing bids.\n\nSignal works alongside your existing Google Ads setup, without requiring the team to rebuild campaigns or change your current bidding strategy.",
                      }
                    : step,
            ),
          };
        },
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.provider.providerName).toBe("openai");
      expect(result.data.steps[0].messageBody).toContain("Acme's branded-search visibility");
      expect(result.data.steps[1].messageBody).not.toContain("Can you see this today?");
      expect(result.data.steps[2].messageBody).toContain("comparing live search-page conditions");
      expect(result.data.diagnostics?.finalRecoveredStepNumbers).toEqual([2]);
      expect(result.data.diagnostics?.aiStepsPreserved).toBe(3);
      expect(result.data.diagnostics?.finalFullSequenceFallbackUsed).toBe(false);
    }
  });

  it("falls back when generated copy is too close to a gold standard example", async () => {
    const { adapter } = persistence([knowledge({ id: "product-truth" })]);
    const chrisInput: BuildSequenceInput = {
      ...baseInput,
      companyName: "Remofirst",
      companyWebsite: "remofirst.com",
      contactFirstName: "Chris",
      contactRole: "Head of Paid Search",
      prospectContext:
        "Chris has managed over $50M in ad spend and is actively exploring how AI and automation can improve paid-search decisions.",
    };
    const result = await generateBuildSequence(chrisInput, {
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
            steps: generated.steps.map((step, index) =>
              index === 0
                ? {
                    ...step,
                    subjectLine: "the branded search question google ads can't answer",
                    messageBody:
                      "Hi Chris,\n\nI'm reaching out because you've managed over $50M in ad spend and are actively exploring how AI and automation can improve paid-search decisions.\n\nOne area Google Ads still doesn't handle well is adapting branded bids to live SERP competition. It reports performance, but doesn't clearly distinguish between moments when Remofirst is defending against another advertiser and moments when it's paying alone.",
                    cta: "Curious if you've already explored this?",
                  }
                : step,
            ),
          };
        },
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.provider.providerName).toBe("deterministic-development");
      expect(result.data.steps[0].messageBody).not.toContain(
        "I'm reaching out because you've managed over $50M",
      );
    }
  });

  it("turns the Chris Remofirst strategy into specific copy instead of generic positioning", async () => {
    const { adapter } = persistence([
      knowledge({ id: "product-truth" }),
      knowledge({
        id: "zoominfo-proof",
        title: "ZoomInfo reduced branded CPC",
        type: "CASE_STUDY",
        approvedText:
          "ZoomInfo used Signal to reduce branded CPC by 40% while increasing MQL volume by 20%.",
        sourceIds: ["source-zoominfo"],
        sourceTitles: ["ZoomInfo approved proof"],
      }),
    ]);

    const result = await generateBuildSequence(
      {
        ...baseInput,
        companyName: "Remofirst",
        companyWebsite: "remofirst.com",
        contactFirstName: "Chris",
        contactRole: "Head of Paid Search",
        prospectContext:
          "Chris has managed over $50M in ad spend and is actively exploring how AI and automation can improve paid-search decisions.",
      },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const rendered = JSON.stringify(result.data.steps);
      expect(rendered).toContain("$50M");
      expect(rendered).toMatch(/AI and automation/i);
      expect(rendered).toMatch(/Google Ads reports performance/i);
      expect(rendered).toMatch(/defending against another advertiser/i);
      expect(rendered).toMatch(/paying alone/i);
      expect(rendered).toContain("ZoomInfo used Signal to reduce branded CPC by 40%");
      expect(rendered).not.toContain("I noticed this about Remofirst");
    }
  });

  it("does not leak structured intake labels into Chris Remofirst copy", async () => {
    const { adapter } = persistence([
      knowledge({ id: "product-truth" }),
      knowledge({
        id: "zoominfo-proof",
        title: "ZoomInfo reduced branded CPC",
        type: "CASE_STUDY",
        approvedText:
          "ZoomInfo used Signal to reduce branded CPC by 40% while increasing MQL volume by 20%.",
        sourceIds: ["source-zoominfo"],
        sourceTitles: ["ZoomInfo approved proof"],
      }),
    ]);

    const result = await generateBuildSequence(
      {
        ...baseInput,
        companyName: "Remofirst",
        companyWebsite: "remofirst.com",
        contactFirstName: "Chris",
        contactRole: "Head of Paid Search",
        prospectContext:
          "Prospect: Chris.\nContext: Chris has managed over $50M+ in paid media and is actively exploring AI and automation for paid-search decisions.",
      },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const bodies = result.data.steps.map((step) => step.messageBody);
      const rendered = bodies.join("\n\n");
      expect(rendered).not.toMatch(/\b(?:Prospect|Company|Role|Context|Notes|SERP|Keywords|Important):/);
      expect(rendered).not.toContain("I saw that Prospect: Chris.");
      expect(bodies[0]).toContain("you've managed over $50M in paid media");
      expect(rendered).not.toMatch(/\bChris has\b|\bChris is\b/);
      expect(rendered).not.toContain("I noticed this about Remofirst");
      expect(rendered).not.toContain("over $50M+");
      expect(rendered).toMatch(/AI and automation/i);
      expect(bodies[0]).toMatch(/Google Ads reports performance/i);
      expect(bodies[1]).toMatch(/Google and Bing/i);
      expect(bodies[1]).not.toMatch(/Google Ads reports performance/i);
      expect(bodies[2]).toMatch(/Without account-specific auction evidence/i);
      expect(rendered).not.toMatch(/organic is already enough|organic would have captured|organic cannot do/i);
      expect(rendered).toContain("ZoomInfo used Signal to reduce branded CPC by 40%");
    }
  });

  it("preserves safe supplied keyword phrases that contain commercial words", async () => {
    const { adapter } = persistence([knowledge({ id: "product-truth" })]);

    const result = await generateBuildSequence(
      {
        ...baseInput,
        companyName: "Cursor",
        companyWebsite: "cursor.com",
        contactFirstName: "Taylor",
        contactRole: "Head of Growth",
        companyContext: "Fast-growing AI developer tool",
        keywords: [
          { term: "Cursor pricing", status: "solo" },
          { term: "Cursor AI editor", status: "contested", competitor: "Notion" },
        ],
      },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const rendered = JSON.stringify(result.data);
      expect(rendered).toContain("Cursor pricing");
      expect(rendered).not.toContain("Cursor commercial details");
    }
  });

  it("uses SOLO evidence concretely without claiming wasted spend", async () => {
    const { adapter } = persistence([knowledge({ id: "product-truth" })]);

    const result = await generateBuildSequence(
      {
        ...baseInput,
        companyName: "Merrell",
        companyWebsite: "merrell.com",
        contactFirstName: "Alex",
        contactRole: "Director of Ecommerce",
        keywords: [{ term: "merrell shoes", status: "solo" }],
      },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const rendered = JSON.stringify(result.data.steps);
      expect(rendered).toContain("merrell shoes");
      expect(rendered).toMatch(/brand appeared alone/i);
      expect(rendered).toMatch(/does not prove wasted spend|does not prove inefficiency/i);
      expect(rendered).not.toMatch(/\bis wasted\b|\bwasting money\b/i);
    }
  });

  it("creates a prospect, source, extracted facts, and prospect-linked sequence from one paste", async () => {
    const { adapter, prospects, sources, persisted } = prospectPersistence();

    const result = await generateBuildSequence(
      {
        ...baseInput,
        companyName: "",
        rawProspectContext:
          "Chris Example\nHead of Growth at Remofirst\nchris@example.com\nChris has managed over $50M in ad spend and is exploring AI and automation for paid-search decisions.\nCompany: Remofirst\nWebsite: remofirst.com",
      },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(prospects).toHaveLength(1);
      expect(sources).toHaveLength(1);
      expect(result.data.prospectId).toBe(prospects[0].id);
      expect(result.data.prospectMemory?.sourceCount).toBe(1);
      expect(result.data.prospectMemory?.extraction.prospectFacts.join(" ")).toMatch(/\$50M|AI and automation/i);
      expect(persisted[0].prospectId).toBe(prospects[0].id);
    }
  });

  it("generates from prospect context only without requiring legacy company or role fields", async () => {
    const { adapter, prospects, sources, facts, persisted } = prospectPersistence();

    const result = await generateBuildSequence(
      {
        ...baseInput,
        companyName: "",
        companyWebsite: undefined,
        contactFirstName: undefined,
        contactRole: "Head of Performance Marketing",
        industry: undefined,
        rawProspectContext:
          "Chris\nRemofirst\nmanaged over $50M in paid media\ninterested in AI / automation for paid search\nGoogle Ads live SERP competition context",
      },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(prospects).toHaveLength(1);
      expect(sources).toHaveLength(1);
      expect(facts.length).toBeGreaterThan(0);
      expect(facts.every((fact) => fact.sourceId === sources[0].id)).toBe(true);
      expect(result.data.prospectMemory?.prospect.firstName).toBe("Chris");
      expect(result.data.prospectMemory?.prospect.companyName).toBe("Remofirst");
      expect(result.data.prospectIntelligence.serpScenario).toBe("UNKNOWN");
      expect(result.data.steps).toHaveLength(4);
      expect(persisted[0].prospectId).toBe(prospects[0].id);
    }
  });

  it("uses grounded AI semantic intake before persisting Prospect Memory facts", async () => {
    const { adapter, prospects, sources, facts, persisted } = prospectPersistence();

    const result = await generateBuildSequence(
      {
        ...baseInput,
        companyName: "",
        companyWebsite: undefined,
        contactFirstName: undefined,
        rawProspectContext:
          "Chris\nRemofirst\nChris has managed over $50M in paid media.\nHe is actively exploring AI and automation for paid-search decisions.\nSERP:\nremofirst - solo",
      },
      {
        persistence: adapter,
        semanticExtractionProvider: async () => ({
          identity: { firstName: "Chris" },
          company: { companyName: "Remofirst" },
          prospectFacts: [
            {
              text: "managed over $50M in paid media",
              sourceEvidence: "Chris has managed over $50M in paid media.",
              confidence: "HIGH",
            },
            {
              text: "leading a global AI transformation",
              sourceEvidence: "global AI transformation",
              confidence: "LOW",
            },
          ],
          serpEvidence: [
            {
              keyword: "remofirst",
              observation: "remofirst - solo",
              scenarioHint: "SOLO",
              sourceEvidence: "remofirst - solo",
            },
          ],
        }),
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(prospects).toHaveLength(1);
      expect(sources).toHaveLength(1);
      expect(persisted[0].prospectId).toBe(prospects[0].id);
      expect(facts.map((fact) => fact.value).join("\n")).toContain("managed over $50M in paid media");
      expect(facts.map((fact) => fact.value).join("\n")).not.toContain("global AI transformation");
      expect(facts.every((fact) => fact.sourceId === sources[0].id)).toBe(true);
      expect(result.data.prospectIntelligence.serpScenario).toBe("SOLO");
      expect(result.data.safetyNotes).toEqual(
        expect.arrayContaining([
          expect.stringContaining("unsupported semantic intake extraction"),
        ]),
      );
    }
  });

  it("uses a validated AI message strategy before sequence generation", async () => {
    const { adapter } = prospectPersistence({
      records: [
        knowledge({ id: "product-truth" }),
        knowledge({
          id: "proof-zoominfo",
          title: "ZoomInfo proof",
          type: "CASE_STUDY",
          approvedText:
            "ZoomInfo used Signal to reduce branded CPC by 40% while increasing MQL volume by 20%.",
        }),
      ],
    });

    const result = await generateBuildSequence(
      {
        ...baseInput,
        companyName: "Remofirst",
        contactFirstName: "Chris",
        contactRole: "Head of Paid Search",
        prospectContext:
          "Chris has managed over $50M in paid media and is exploring AI and automation for paid-search decisions.",
      },
      {
        persistence: adapter,
        messageStrategyProvider: async (request) => ({
          prospectInsight: "managed over $50M in paid media",
          whyNow:
            "The supplied context connects paid-media scale and AI automation interest to a live SERP decision gap.",
          primaryAngle: "Live decision gap between Google Ads reporting and SERP competition.",
          secondaryAngle: "Live decision gap with a narrower operational follow-up.",
          businessQuestion:
            "How do you know when branded bids should change because live competition changed?",
          productGapId: "GOOGLE_ADS_LIVE_COMPETITION_GAP",
          relevantCapabilityId: "LIVE_SERP_COMPETITION",
          proofPointId: "proof-zoominfo",
          openingStyle: "PROSPECT_FACT",
          sequenceNarrative: ([1, 2, 3, 4] as const).map((stepNumber) => ({
            stepNumber,
            objective: [
              "Open with the prospect-specific reason this is relevant.",
              "Explain the live competition decision gap.",
              "Show how Signal uses live Google and Bing visibility.",
              "Use one approved proof point and keep the ask soft.",
            ][stepNumber - 1],
            newInformation: [
              "Live decision gap between Google Ads reporting and SERP competition.",
              "How live SERP visibility changes bid and coverage decisions.",
              "Signal monitors Google and Bing SERPs in real time.",
              "ZoomInfo approved result as the single proof point.",
            ][stepNumber - 1],
            angle: [
              "Live decision gap between Google Ads reporting and SERP competition.",
              "How live SERP visibility changes bid and coverage decisions.",
              "Signal monitors Google and Bing SERPs in real time.",
              "Proof-backed low-pressure evaluation.",
            ][stepNumber - 1],
            evidenceToUse: [
              "managed over $50M in paid media",
              "AI and automation for paid-search decisions",
              "Signal monitors Google and Bing SERPs in real time",
              "ZoomInfo used Signal to reduce branded CPC by 40% while increasing MQL volume by 20%.",
            ][stepNumber - 1],
            proofToUseId: stepNumber === 4 ? "proof-zoominfo" : undefined,
            CTAIntent: [
              "Ask whether this question is already handled.",
              "Ask how the team detects the moment.",
              "Ask whether a narrow review would help.",
              "Offer a quick overview.",
            ][stepNumber - 1],
            avoidRepeating: [
              "Do not explain methodology yet.",
              "Do not repeat the prospect fact.",
              "Do not restate the Google Ads gap.",
              "Do not introduce another proof point.",
            ][stepNumber - 1],
          })),
          emailStepPlans: ([1, 2, 3, 4] as const).map((stepNumber) => ({
            stepNumber,
            objective: [
              "Open with the prospect-specific reason this is relevant.",
              "Explain the live competition decision gap.",
              "Show how Signal uses live Google and Bing visibility.",
              "Use one approved proof point and keep the ask soft.",
            ][stepNumber - 1],
            newInformation: [
              "Live decision gap between Google Ads reporting and SERP competition.",
              "How live SERP visibility changes bid and coverage decisions.",
              "Signal monitors Google and Bing SERPs in real time.",
              "ZoomInfo approved result as the single proof point.",
            ][stepNumber - 1],
            angle: [
              "Live decision gap between Google Ads reporting and SERP competition.",
              "How live SERP visibility changes bid and coverage decisions.",
              "Signal monitors Google and Bing SERPs in real time.",
              "Proof-backed low-pressure evaluation.",
            ][stepNumber - 1],
            evidenceToUse: [
              "managed over $50M in paid media",
              "AI and automation for paid-search decisions",
              "Signal monitors Google and Bing SERPs in real time",
              "ZoomInfo used Signal to reduce branded CPC by 40% while increasing MQL volume by 20%.",
            ][stepNumber - 1],
            proofToUseId: stepNumber === 4 ? "proof-zoominfo" : undefined,
            CTAIntent: [
              "Ask whether this question is already handled.",
              "Ask how the team detects the moment.",
              "Ask whether a narrow review would help.",
              "Offer a quick overview.",
            ][stepNumber - 1],
            avoidRepeating: [
              "Do not explain methodology yet.",
              "Do not repeat the prospect fact.",
              "Do not restate the Google Ads gap.",
              "Do not introduce another proof point.",
            ][stepNumber - 1],
          })),
          whyThisShouldResonate:
            "The plan uses Chris's supplied paid-media scale and AI automation interest.",
          confidence: "HIGH",
          groundingReferences: ["managed over $50M in paid media"],
          selectedGoldStandardExampleIds: request.goldStandardExamples.map((example) => example.id),
        }),
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.messageStrategy.plannerMode).toBe("AI_STRATEGY");
      expect(result.data.messageStrategy.primaryAngle).toContain("Live decision gap");
      expect(result.data.messageStrategy.businessQuestion).toContain("live competition changed");
      expect(result.data.steps).toHaveLength(4);
    }
  });

  it("reuses an existing prospect by exact email and appends a new source", async () => {
    const { adapter, prospects, sources } = prospectPersistence({
      initialProspects: [existingProspect({ email: "chris@example.com", fullName: "Chris Example" })],
    });

    const result = await generateBuildSequence(
      {
        ...baseInput,
        companyName: "",
        rawProspectContext:
          "Chris Example\nEmail: chris@example.com\nCompany: Remofirst\nChris is exploring AI and automation in paid search.",
      },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    expect(prospects).toHaveLength(1);
    expect(sources).toHaveLength(1);
    if (result.ok) {
      expect(result.data.prospectMemory?.identityResolution.status).toBe("EXACT_MATCH");
      expect(result.data.prospectMemory?.identityResolution.matchedBy).toContain("email");
      expect(result.data.prospectMemory?.sourceCount).toBe(1);
    }
  });

  it("reuses an existing prospect by normalized LinkedIn URL", async () => {
    const { adapter, prospects } = prospectPersistence({
      initialProspects: [
        existingProspect({
          linkedinUrl: "linkedin.com/in/chris-example",
          fullName: "Chris Example",
          email: undefined,
        }),
      ],
    });

    const result = await generateBuildSequence(
      {
        ...baseInput,
        companyName: "",
        rawProspectContext:
          "Chris Example\nhttps://www.linkedin.com/in/chris-example/\nCompany: Remofirst\nHead of Growth",
      },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    expect(prospects).toHaveLength(1);
    if (result.ok) {
      expect(result.data.prospectMemory?.identityResolution.matchedBy).toContain("linkedinUrl");
      expect(result.data.prospectId).toBe("existing-prospect");
    }
  });

  it("matches by exact full name plus company and does not merge ambiguous name-only matches", async () => {
    const exact = resolveIdentity(
      {
        firstName: "Chris",
        lastName: "Example",
        fullName: "Chris Example",
        companyName: "Remofirst",
        prospectFacts: [],
        companyFacts: [],
        linkedinInsights: [],
        notes: [],
        serpEvidence: [],
        confidence: { identity: 0.8, company: 0.8, extraction: 0.8 },
      },
      [existingProspect({ fullName: "Chris Example", companyName: "Remofirst" })],
    );
    const ambiguous = resolveIdentity(
      {
        firstName: "Chris",
        lastName: "Example",
        fullName: "Chris Example",
        prospectFacts: [],
        companyFacts: [],
        linkedinInsights: [],
        notes: [],
        serpEvidence: [],
        confidence: { identity: 0.8, company: 0.2, extraction: 0.8 },
      },
      [existingProspect({ fullName: "Chris Example", companyName: "Remofirst" })],
    );

    expect(exact.status).toBe("HIGH_CONFIDENCE_MATCH");
    expect(exact.matchedBy).toEqual(["fullName", "companyName"]);
    expect(ambiguous.status).toBe("AMBIGUOUS");
  });

  it("appends a new source without destroying previous sources", async () => {
    const { adapter, prospects, sources } = prospectPersistence({
      initialProspects: [existingProspect({ email: "chris@example.com", fullName: "Chris Example" })],
    });

    await generateBuildSequence(
      { ...baseInput, companyName: "", rawProspectContext: "Chris Example\nEmail: chris@example.com\nCompany: Remofirst" },
      { persistence: adapter },
    );
    await generateBuildSequence(
      { ...baseInput, companyName: "", rawProspectContext: "Chris Example\nEmail: chris@example.com\nNew LinkedIn post about AI automation.\nCompany: Remofirst" },
      { persistence: adapter },
    );

    expect(prospects).toHaveLength(1);
    expect(sources).toHaveLength(2);
  });

  it("preserves conflicting existing values instead of silently overwriting them", async () => {
    const { adapter, prospects } = prospectPersistence({
      initialProspects: [
        existingProspect({
          email: "chris@example.com",
          jobTitle: "Head of Growth",
        }),
      ],
    });

    const result = await generateBuildSequence(
      {
        ...baseInput,
        companyName: "",
        rawProspectContext:
          "Chris Example\nEmail: chris@example.com\nTitle: VP Marketing\nCompany: Remofirst",
      },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    expect(prospects[0].jobTitle).toBe("Head of Growth");
    if (result.ok) {
      expect(result.data.prospectMemory?.conflicts.some((conflict) => conflict.field === "jobTitle")).toBe(true);
    }
  });

  it("extracts mixed SERP evidence while preserving exact Cursor keywords", async () => {
    const { adapter } = prospectPersistence();

    const result = await generateBuildSequence(
      {
        ...baseInput,
        companyName: "",
        rawProspectContext:
          "Taylor Growth\nHead of Growth\nCompany: Cursor\nWebsite: cursor.com\nCursor pricing — solo\nCursor AI editor — Notion appeared",
      },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const extraction = result.data.prospectMemory?.extraction;
      expect(extraction?.serpEvidence).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ keyword: "Cursor pricing", status: "SOLO" }),
          expect.objectContaining({ keyword: "Cursor AI editor", status: "CONTESTED" }),
        ]),
      );
      expect(JSON.stringify(result.data.steps)).toContain("Cursor pricing");
      expect(JSON.stringify(result.data.steps)).not.toContain("Cursor commercial details");
    }
  });

  it("safely saves weak context without inventing achievements", async () => {
    const { adapter } = prospectPersistence();

    const result = await generateBuildSequence(
      {
        ...baseInput,
        companyName: "",
        rawProspectContext: "Mia Chen\nPPC Team Lead\nCompany: Americaneagle\nWebsite: americaneagle.com",
      },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.prospectId).toBeTruthy();
      expect(result.data.prospectMemory?.extraction.prospectFacts.join(" ")).not.toMatch(/\$50M|managed over|AI and automation/i);
      expect(result.data.prospectMemory?.extraction.serpEvidence).toEqual([]);
      expect(result.data.prospectIntelligence.serpScenario).toBe("UNKNOWN");
      expect(JSON.stringify(result.data.steps)).not.toMatch(/\$50M|managed over/i);
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
      message: "Build Sequence needs: Channel, Steps, Tone.",
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
