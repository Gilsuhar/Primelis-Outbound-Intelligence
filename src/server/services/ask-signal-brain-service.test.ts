import { describe, expect, it } from "vitest";

import type {
  SignalBrainInput,
  SignalBrainKnowledgeRecord,
  SignalBrainResult,
} from "@/features/ask-signal-brain/types";

import { DeterministicSignalBrainProvider } from "./ask-signal-brain-provider";
import { askSignalBrain, type SignalBrainPersistence } from "./ask-signal-brain-service";

const baseInput: SignalBrainInput = {
  question: "What is the difference between Solo, Competitive, and Ghost?",
  companyName: "Acme",
  contactRole: "Director of Paid Search",
  industry: "Retail",
  paidSearchContext: "The account has active brand ads and strong organic visibility.",
  mode: "QUICK_ANSWER",
  creatorId: "seed-sales-user",
};

function knowledge(overrides: Partial<SignalBrainKnowledgeRecord>): SignalBrainKnowledgeRecord {
  return {
    id: "approved-product-truth",
    title: "Approved product truth",
    type: "PRODUCT_TRUTH",
    approvedText:
      "Signal evaluates Solo, Competitive, and Ghost branded-search scenarios by looking at paid and organic outcomes together.",
    channels: ["EMAIL", "LINKEDIN", "INTERNAL"],
    sourceIds: ["source-1"],
    sourceTitles: ["Approved Signal source"],
    sourceDates: ["2026-01-01"],
    ...overrides,
  };
}

function persistence(records: SignalBrainKnowledgeRecord[], actorRole = "SALES_USER") {
  const persisted: Array<{
    creatorId: string;
    request: SignalBrainInput;
    result: Omit<SignalBrainResult, "draftId">;
  }> = [];
  const adapter: SignalBrainPersistence = {
    getActor: async (actorId) => ({ id: actorId, role: actorRole }),
    retrieveEligibleKnowledge: async () => records,
    persistDraft: async (draft) => {
      persisted.push(draft);
      return "signal-brain-draft-id";
    },
  };
  return { adapter, persisted };
}

describe("Ask Signal Brain service", () => {
  it("retrieves only approved eligible knowledge and returns source references", async () => {
    const { adapter } = persistence([
      knowledge({ id: "approved" }),
      knowledge({ id: "needs-review-excluded", sourceIds: [] }),
      knowledge({ id: "restricted-excluded", usageRestrictions: "Internal only." }),
    ]);

    const result = await askSignalBrain(baseInput, { persistence: adapter });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.recordsUsed.map((record) => record.id)).toEqual(["approved"]);
      expect(result.data.sourceReferences.map((source) => source.title)).toEqual([
        "Approved Signal source",
      ]);
    }
  });

  it("excludes ineligible restricted content and competitor claims", async () => {
    const { adapter } = persistence([
      knowledge({ id: "approved" }),
      knowledge({
        id: "competitor-claim",
        type: "OBJECTION",
        approvedText: "Adthena is worse than Signal.",
      }),
      knowledge({
        id: "restricted-case-study",
        type: "CASE_STUDY",
        approvedText: "Restricted customer proof.",
        usageRestrictions: "Do not use externally.",
        usageScope: "INTERNAL_ONLY",
      }),
    ]);

    const result = await askSignalBrain(
      {
        ...baseInput,
        question: "How should I approach a prospect already using Adthena?",
        currentVendor: "Adthena",
        mode: "OBJECTION_GUIDANCE",
      },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.recordsUsed.map((record) => record.id)).toEqual(["approved"]);
      expect(JSON.stringify(result.data)).not.toMatch(/worse than/i);
      expect(result.data.safetyWarnings).toContain(
        "Competitor context should validate the current setup and avoid replacement pressure.",
      );
    }
  });

  it("blocks pricing and POC wording", async () => {
    const { adapter } = persistence([
      knowledge({ id: "approved" }),
      knowledge({
        id: "commercial-record",
        approvedText: "Signal pricing is best discussed through a POC trial discount.",
      }),
    ]);

    const result = await askSignalBrain(
      {
        ...baseInput,
        question: "Can I mention POC pricing and a trial discount?",
        mode: "CLAIM_SAFETY_CHECK",
      },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.recordsUsed.map((record) => record.id)).toEqual(["approved"]);
      expect(result.data.claimSafety?.status).toBe("Restricted");
      expect(result.data.directAnswer).not.toMatch(/\bpricing|poc|trial|discount\b/i);
    }
  });

  it("returns account-fit results from approved ICP logic and insufficient information when needed", async () => {
    const { adapter } = persistence([knowledge({ id: "approved" })]);
    const strong = await askSignalBrain(
      {
        ...baseInput,
        question: "Is this account a Strong fit, Possible fit, or Do not target?",
        companyWebsite: "https://example.invalid",
        geographyOrMarkets: "Multiple markets",
        paidSearchContext:
          "Active brand ads, strong organic visibility, dedicated Paid Search team, and efficiency pain.",
        companySizeOrRevenue: "$50M revenue",
        mode: "ACCOUNT_QUALIFICATION",
      },
      { persistence: adapter },
    );
    const insufficient = await askSignalBrain(
      {
        ...baseInput,
        question: "Is this account a fit?",
        paidSearchContext: undefined,
        contactRole: undefined,
        mode: "ACCOUNT_QUALIFICATION",
      },
      { persistence: adapter },
    );

    expect(strong.ok && strong.data.accountFit?.result).toBe("Strong fit");
    expect(insufficient.ok && insufficient.data.accountFit?.result).toBe(
      "Insufficient information",
    );
  });

  it("recommends personas from approved tier logic and does not use seniority alone", async () => {
    const { adapter } = persistence([knowledge({ id: "approved" })]);
    const paidSearch = await askSignalBrain(
      { ...baseInput, question: "Who should I target?", mode: "PERSONA_RECOMMENDATION" },
      { persistence: adapter },
    );
    const cmo = await askSignalBrain(
      {
        ...baseInput,
        question: "Should I target the CMO?",
        contactRole: "CMO",
        mode: "PERSONA_RECOMMENDATION",
      },
      { persistence: adapter },
    );

    expect(paidSearch.ok && paidSearch.data.personaRecommendation?.primaryPersona).toMatch(
      /Paid Search/i,
    );
    expect(cmo.ok && cmo.data.personaRecommendation?.whenNotToPrioritize).toMatch(
      /operational Paid Search/i,
    );
  });

  it("enforces case-study restrictions and returns eligible usage scope", async () => {
    const { adapter } = persistence([
      knowledge({ id: "approved" }),
      knowledge({
        id: "eligible-case-study",
        title: "Eligible retail case study",
        type: "CASE_STUDY",
        approvedText: "Approved customer evidence for retail branded-search decisions.",
        usageScope: "EMAIL_AND_LINKEDIN",
        metrics: ["Efficiency: approved metric"],
        sourceIds: ["source-2"],
        sourceTitles: ["Case source"],
      }),
      knowledge({
        id: "blocked-case-study",
        title: "Blocked case study",
        type: "CASE_STUDY",
        approvedText: "Blocked proof.",
        usageRestrictions: "Restricted.",
        usageScope: "INTERNAL_ONLY",
      }),
    ]);

    const result = await askSignalBrain(
      {
        ...baseInput,
        question: "Which case study should I use in outreach?",
        mode: "CASE_STUDY_SELECTION",
      },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.caseStudyRecommendation).toMatchObject({
        recommendedCaseStudy: "Eligible retail case study",
        eligibleUsageScope: "EMAIL_AND_LINKEDIN",
      });
      expect(result.data.recordsUsed.map((record) => record.id)).not.toContain(
        "blocked-case-study",
      );
    }
  });

  it("catches guarantees and unsupported performance claims", async () => {
    const { adapter } = persistence([knowledge({ id: "approved" })]);

    const result = await askSignalBrain(
      {
        ...baseInput,
        question:
          "Signal will always reduce branded-search spend by 50% without affecting conversions.",
        mode: "CLAIM_SAFETY_CHECK",
      },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.claimSafety?.status).toBe("Unsupported");
      expect(result.data.claimSafety?.problematicWording).toEqual(
        expect.arrayContaining([
          "guarantee or certainty language",
          "specific unverified performance metric",
        ]),
      );
      expect(result.data.directAnswer).not.toMatch(/\balways\b|50%/i);
    }
  });

  it("persists generated answers separately and leaves original knowledge unchanged", async () => {
    const original = knowledge({ id: "stable" });
    const { adapter, persisted } = persistence([original]);

    const result = await askSignalBrain(baseInput, { persistence: adapter });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.draftId).toBe("signal-brain-draft-id");
      expect(persisted[0].result.provider.providerName).toBe("deterministic-development");
      expect(persisted[0].result.detectedIntent).toContain("PRODUCT_FUNDAMENTALS");
      expect(original).toEqual(knowledge({ id: "stable" }));
    }
  });

  it("uses deterministic fallback without an API key", () => {
    const provider = new DeterministicSignalBrainProvider();

    expect(provider.metadata).toMatchObject({
      providerName: "deterministic-development",
      deterministic: true,
    });
  });

  it("answers Revvim questions with positioning instead of a generic product answer", async () => {
    const { adapter } = persistence([
      knowledge({
        id: "revvim-objection",
        title: "Existing Revvim reply",
        type: "OBJECTION",
        approvedText:
          "Validate Revvim as a relevant setup and focus on whether the paid-brand decision is automated when the search page changes.",
      }),
      knowledge({ id: "approved-product" }),
    ]);

    const result = await askSignalBrain(
      {
        ...baseInput,
        question: "Who is Revvim and how should I explain our strength?",
        currentVendor: "Revvim",
        mode: "OBJECTION_GUIDANCE",
      },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.directAnswer).toMatch(/relevant branded-search|serious setup/i);
    expect(result.data.directAnswer).toMatch(/decision layer|search-page activity|manual review/i);
    expect(result.data.directAnswer).not.toMatch(/replace|bad|worse/i);
  });

  it("explains blended CTR in plain Signal language", async () => {
    const { adapter } = persistence([
      knowledge({
        id: "blended-ctr",
        title: "Blended CTR framework",
        type: "PRODUCT_TRUTH",
        approvedText:
          "Blended CTR combines paid brand and organic brand click-through visibility to understand total search-page outcomes.",
      }),
    ]);

    const result = await askSignalBrain(
      {
        ...baseInput,
        question: "Explain blended CTR and why it matters for Signal.",
        mode: "QUICK_ANSWER",
      },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.directAnswer).toMatch(/combined click-through|paid brand and organic/i);
    expect(result.data.directAnswer).toMatch(/paid click is not changing the outcome/i);
  });

  it("returns structured errors for invalid input and unauthorized users", async () => {
    const invalid = await askSignalBrain(
      { question: "" },
      { persistence: persistence([]).adapter },
    );
    const forbidden = await askSignalBrain(baseInput, {
      persistence: persistence([knowledge({})], "VIEWER").adapter,
    });

    expect(invalid).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Ask Signal Brain input is malformed.",
    });
    expect(forbidden).toEqual({
      ok: false,
      code: "FORBIDDEN",
      message: "Only authorized sales or knowledge users can ask Signal Brain.",
    });
  });

  it("covers the requested deterministic smoke prompts", async () => {
    const { adapter, persisted } = persistence([
      knowledge({ id: "approved-product" }),
      knowledge({
        id: "approved-objection",
        title: "Approved vendor objection",
        type: "OBJECTION",
        approvedText:
          "Validate the existing setup and compare methodology without replacement pressure.",
      }),
      knowledge({
        id: "approved-case-study",
        title: "Approved retail case study",
        type: "CASE_STUDY",
        approvedText: "Approved retail evidence for branded-search decision quality.",
        usageScope: "EMAIL_AND_LINKEDIN",
        sourceIds: ["source-2"],
        sourceTitles: ["Retail case source"],
      }),
    ]);

    const product = await askSignalBrain(
      {
        ...baseInput,
        question: "What is the difference between Solo, Competitive, and Ghost?",
        contactRole: undefined,
        mode: "QUICK_ANSWER",
      },
      { persistence: adapter },
    );
    const persona = await askSignalBrain(
      {
        ...baseInput,
        question:
          "Who should I target at a US e-commerce company with a Director of Paid Search and a Head of Growth?",
        contactRole: "Director of Paid Search and Head of Growth",
        industry: "E-commerce",
        mode: "PERSONA_RECOMMENDATION",
      },
      { persistence: adapter },
    );
    const fit = await askSignalBrain(
      {
        ...baseInput,
        question:
          "The company has active brand ads, strong organic visibility, multiple markets, and a dedicated Paid Search team. Is it a fit?",
        companyWebsite: "https://example.invalid",
        geographyOrMarkets: "Multiple markets",
        paidSearchContext:
          "Active brand ads, strong organic visibility, multiple markets, and a dedicated Paid Search team.",
        mode: "ACCOUNT_QUALIFICATION",
      },
      { persistence: adapter },
    );
    const competitor = await askSignalBrain(
      {
        ...baseInput,
        question: "How should I approach a prospect already using Adthena?",
        currentVendor: "Adthena",
        mode: "OBJECTION_GUIDANCE",
      },
      { persistence: adapter },
    );
    const claim = await askSignalBrain(
      {
        ...baseInput,
        question:
          "Signal will always reduce branded-search spend by 50% without affecting conversions.",
        mode: "CLAIM_SAFETY_CHECK",
      },
      { persistence: adapter },
    );

    expect(product.ok && product.data.directAnswer).toMatch(/Solo, Competitive, and Ghost/i);
    expect(persona.ok && persona.data.personaRecommendation?.primaryPersona).toMatch(
      /Paid Search/i,
    );
    expect(fit.ok && fit.data.accountFit?.result).toBe("Strong fit");
    expect(competitor.ok && competitor.data.safetyWarnings).toContain(
      "Competitor context should validate the current setup and avoid replacement pressure.",
    );
    expect(claim.ok && claim.data.claimSafety?.status).toBe("Unsupported");
    expect(persisted).toHaveLength(5);
    expect(persisted.every((draft) => draft.result.provider.deterministic)).toBe(true);
  });
});
