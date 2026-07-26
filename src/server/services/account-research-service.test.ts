import { describe, expect, it } from "vitest";

import type {
  AccountAssessmentResult,
  AccountResearchInput,
} from "@/features/account-research/types";
import type { DoNotContactRecord } from "@/features/do-not-contact/types";

import { assessAccountResearch, type AccountResearchPersistence } from "./account-research-service";

const baseInput: AccountResearchInput = {
  companyName: "Acme",
  companyDomain: "acme.example",
  industry: "Retail and E-commerce",
  headquartersOrMainMarket: "US",
  marketsOrCountries: "US and UK",
  revenueContext: "$60M revenue",
  employeeContext: "250 employees",
  companyType: "E_COMMERCE",
  brandedSearchAdsActive: "YES",
  strongOrganicBrandVisibility: "YES",
  meaningfulBrandedSearchDemand: "YES",
  multiMarketOrBrandComplexity: "YES",
  dedicatedPaidSearchOrPerformanceTeam: "YES",
  knownPaidSearchOwner: "Director of Paid Search",
  knownCurrentToolOrVendor: undefined,
  meaningfulPaidSearchInvestment: "YES",
  observedTrigger: "Expansion into multiple markets.",
  knownPain: "Efficiency and measurement pain.",
  accountOwner: undefined,
  lastContactDate: undefined,
  existingCustomer: "NO",
  activeOpportunity: "NO",
  ownedByAnotherRep: "NO",
  doNotContactStatus: "NO",
  internalNotes: "Manual research only.",
  factStatuses: {
    brandedSearchAdsActive: "VERIFIED",
    strongOrganicBrandVisibility: "VERIFIED",
    meaningfulBrandedSearchDemand: "VERIFIED",
    multiMarketOrBrandComplexity: "USER_PROVIDED",
    dedicatedPaidSearchOrPerformanceTeam: "USER_PROVIDED",
    knownPaidSearchOwner: "USER_PROVIDED",
    revenueContext: "USER_PROVIDED",
  },
  creatorId: "seed-sales-user",
};

function persistence(records: DoNotContactRecord[] = [], actorRole = "SALES_USER") {
  const persisted: Array<{
    creatorId: string;
    request: AccountResearchInput;
    result: Omit<AccountAssessmentResult, "assessmentId">;
  }> = [];
  const adapter: AccountResearchPersistence = {
    getActor: async (actorId) => ({ id: actorId, role: actorRole }),
    getSuppressionRecords: async () => records,
    persistAssessment: async (assessment) => {
      persisted.push(assessment);
      return "assessment-id";
    },
  };
  return { adapter, persisted, records };
}

describe("Account Research service", () => {
  it("returns Strong fit with several verified positive signals", async () => {
    const { adapter } = persistence();

    const result = await assessAccountResearch(baseInput, { persistence: adapter });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.qualificationResult).toBe("Strong fit");
      expect(result.data.confidence).toBe("High");
      expect(result.data.verifiedSignals).toEqual(
        expect.arrayContaining(["Meaningful branded-search demand", "Active branded-search ads"]),
      );
    }
  });

  it("returns Possible fit when signals are partial", async () => {
    const { adapter } = persistence();

    const result = await assessAccountResearch(
      {
        ...baseInput,
        companyName: "Partial SaaS",
        industry: "B2B SaaS and Technology",
        revenueContext: "$30M revenue",
        brandedSearchAdsActive: "YES",
        strongOrganicBrandVisibility: "UNKNOWN",
        meaningfulBrandedSearchDemand: "UNKNOWN",
        multiMarketOrBrandComplexity: "UNKNOWN",
        dedicatedPaidSearchOrPerformanceTeam: "UNKNOWN",
        knownPaidSearchOwner: undefined,
        meaningfulPaidSearchInvestment: "UNKNOWN",
        knownPain: undefined,
      },
      { persistence: adapter },
    );

    expect(result.ok && result.data.qualificationResult).toBe("Possible fit");
  });

  it("returns Do not target for confirmed suppression and blocks outreach actions", async () => {
    const suppression: DoNotContactRecord = {
      id: "dnc-1",
      companyName: "Blocked Co",
      domain: "blocked.example",
      status: "ACTIVE_OPPORTUNITY",
      owner: "Another rep",
      reason: "Open opportunity.",
    };
    const { adapter, records } = persistence([suppression]);

    const result = await assessAccountResearch(
      {
        ...baseInput,
        companyName: "Blocked Co",
        companyDomain: "blocked.example",
      },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.qualificationResult).toBe("Do not target");
      expect(result.data.suppression.status).toBe("BLOCKED");
      expect(
        result.data.workflowLinks.find((link) => link.label === "Create Outreach")?.disabled,
      ).toBe(true);
    }
    expect(records).toEqual([suppression]);
  });

  it("returns Insufficient information when input is weak and preserves unknown values", async () => {
    const { adapter } = persistence();

    const result = await assessAccountResearch(
      {
        ...baseInput,
        companyName: "Unknown Co",
        companyDomain: "unknown.example",
        industry: undefined,
        revenueContext: undefined,
        employeeContext: undefined,
        brandedSearchAdsActive: "UNKNOWN",
        strongOrganicBrandVisibility: "UNKNOWN",
        meaningfulBrandedSearchDemand: "UNKNOWN",
        multiMarketOrBrandComplexity: "UNKNOWN",
        dedicatedPaidSearchOrPerformanceTeam: "UNKNOWN",
        knownPaidSearchOwner: undefined,
        meaningfulPaidSearchInvestment: "UNKNOWN",
        knownPain: undefined,
        factStatuses: {},
      },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.qualificationResult).toBe("Insufficient information");
      expect(result.data.unknowns).toContain("Branded-search ads active");
      expect(result.data.suppression.label).toBe("No suppression match found");
      expect(result.data.suppression.verificationWarning).toMatch(/not proof/i);
    }
  });

  it("does not qualify an account from revenue alone", async () => {
    const { adapter } = persistence();

    const result = await assessAccountResearch(
      {
        ...baseInput,
        revenueContext: "$500M revenue",
        employeeContext: "5000 employees",
        brandedSearchAdsActive: "UNKNOWN",
        strongOrganicBrandVisibility: "UNKNOWN",
        meaningfulBrandedSearchDemand: "UNKNOWN",
        multiMarketOrBrandComplexity: "UNKNOWN",
        dedicatedPaidSearchOrPerformanceTeam: "UNKNOWN",
        knownPaidSearchOwner: undefined,
        meaningfulPaidSearchInvestment: "UNKNOWN",
        knownPain: undefined,
      },
      { persistence: adapter },
    );

    expect(result.ok && result.data.qualificationResult).toBe("Insufficient information");
  });

  it("does not present assumptions as verified facts", async () => {
    const { adapter } = persistence();

    const result = await assessAccountResearch(
      {
        ...baseInput,
        factStatuses: {
          brandedSearchAdsActive: "ASSUMPTION",
          strongOrganicBrandVisibility: "VERIFIED",
        },
      },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.assumptions).toContain("Branded-search ads active: Yes");
      expect(result.data.verifiedSignals).not.toContain("Branded-search ads active: Yes");
      expect(result.data.verifiedSignals).not.toContain("Active branded-search ads");
      expect(result.data.structuredResearch.inferredContext).toContain(
        "Branded-search ads active: Yes",
      );
    }
  });

  it("keeps user-provided context separate from approved verified facts", async () => {
    const { adapter } = persistence();

    const result = await assessAccountResearch(
      {
        ...baseInput,
        factStatuses: {
          brandedSearchAdsActive: "USER_PROVIDED",
          strongOrganicBrandVisibility: "VERIFIED",
          meaningfulBrandedSearchDemand: "USER_PROVIDED",
        },
      },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const brandAds = result.data.factClassifications.find(
        (fact) => fact.field === "brandedSearchAdsActive",
      );
      expect(brandAds).toMatchObject({
        trustLevel: "USER_PROVIDED",
        allowedAsFactualOutreachPersonalization: false,
        allowedOnlyAsQuestionOrHypothesis: true,
      });
      expect(result.data.structuredResearch.verifiedFacts).toContain(
        "Strong organic brand visibility: Yes",
      );
      expect(result.data.structuredResearch.verifiedFacts).not.toContain(
        "Branded-search ads active: Yes",
      );
      expect(result.data.structuredResearch.userProvidedContext).toContain(
        "Branded-search ads active: Yes",
      );
    }
  });

  it("keeps unknown fields unknown and out of factual downstream context", async () => {
    const { adapter } = persistence();

    const result = await assessAccountResearch(
      {
        ...baseInput,
        companyName: "Sparse Co",
        revenueContext: undefined,
        employeeContext: undefined,
        brandedSearchAdsActive: "UNKNOWN",
        strongOrganicBrandVisibility: "UNKNOWN",
        meaningfulBrandedSearchDemand: "UNKNOWN",
        multiMarketOrBrandComplexity: "UNKNOWN",
        dedicatedPaidSearchOrPerformanceTeam: "UNKNOWN",
        knownPaidSearchOwner: undefined,
        meaningfulPaidSearchInvestment: "UNKNOWN",
        factStatuses: {},
      },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.qualificationResult).toBe("Insufficient information");
      expect(result.data.unknowns).toContain("Meaningful branded-search demand");
      expect(result.data.downstreamHandoff.paidSearchContext).toBeUndefined();
      expect(result.data.structuredResearch.verifiedFacts).toEqual([]);
    }
  });

  it("follows approved persona tier logic and seniority alone does not determine priority", async () => {
    const { adapter } = persistence();
    const directOwner = await assessAccountResearch(baseInput, { persistence: adapter });
    const executive = await assessAccountResearch(
      {
        ...baseInput,
        knownPaidSearchOwner: "CMO",
      },
      { persistence: adapter },
    );

    expect(directOwner.ok && directOwner.data.personaRecommendation.primaryPersona).toMatch(
      /Director of Paid Search/i,
    );
    expect(executive.ok && executive.data.personaRecommendation.seniorityGuidance).toMatch(
      /Seniority alone|operational owner/i,
    );
  });

  it("recommends stakeholder categories without inventing employee names", async () => {
    const { adapter } = persistence();

    const result = await assessAccountResearch(
      {
        ...baseInput,
        knownPaidSearchOwner: "CMO",
      },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.stakeholderRecommendations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: "Head of Paid Search",
            priority: "Secondary stakeholder",
          }),
          expect.objectContaining({
            role: "CMO",
            priority: expect.stringMatching(/Possible influencer|Likely wrong contact/),
          }),
        ]),
      );
      expect(JSON.stringify(result.data.stakeholderRecommendations)).not.toMatch(/Jane|John|Jack/i);
      expect(result.data.downstreamHandoff.contactRole).toBe("CMO");
    }
  });

  it("returns correct industry evidence labels", async () => {
    const { adapter } = persistence();
    const proven = await assessAccountResearch(baseInput, { persistence: adapter });
    const hypothesis = await assessAccountResearch(
      { ...baseInput, industry: "Travel and Airlines" },
      { persistence: adapter },
    );
    const exploratory = await assessAccountResearch(
      { ...baseInput, industry: "Insurance" },
      { persistence: adapter },
    );

    expect(proven.ok && proven.data.industryEvidence.level).toBe("PROVEN");
    expect(hypothesis.ok && hypothesis.data.industryEvidence.level).toBe("STRONG_HYPOTHESIS");
    expect(exploratory.ok && exploratory.data.industryEvidence.level).toBe("EXPLORATORY");
  });

  it("does not use a competitor angle without known competitor context", async () => {
    const { adapter } = persistence();
    const noVendor = await assessAccountResearch(baseInput, { persistence: adapter });
    const vendor = await assessAccountResearch(
      { ...baseInput, knownCurrentToolOrVendor: "Adthena" },
      { persistence: adapter },
    );

    expect(noVendor.ok && noVendor.data.angleRecommendation.primaryAngle).not.toBe(
      "methodology comparison",
    );
    expect(vendor.ok && vendor.data.angleRecommendation.primaryAngle).toBe(
      "methodology comparison",
    );
    expect(vendor.ok && vendor.data.angleRecommendation.mustNotClaim).toMatch(
      /unsupported claims/i,
    );
  });

  it("returns conditional opportunities, safe questions, and claims to avoid", async () => {
    const { adapter } = persistence();

    const result = await assessAccountResearch(baseInput, { persistence: adapter });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.likelyOpportunities.join(" ")).toMatch(/\bIf\b/);
      expect(result.data.angleRecommendation.safeOpeningQuestion).toMatch(/\?$/);
      expect(result.data.claimsToAvoid).toEqual(
        expect.arrayContaining([
          "Do not claim competitors are bidding without evidence.",
          "Do not claim CPC is rising without evidence.",
          "Do not claim wasted spend as a verified fact.",
          "Do not promise a specific saving percentage for this company.",
        ]),
      );
      expect(result.data.angleRecommendation.primaryAngle).not.toMatch(/competitor/i);
    }
  });

  it("passes only filtered research context to downstream workflows", async () => {
    const { adapter } = persistence();

    const result = await assessAccountResearch(
      {
        ...baseInput,
        knownPain: "Seller thinks CPC may be rising.",
        factStatuses: {
          brandedSearchAdsActive: "VERIFIED",
          strongOrganicBrandVisibility: "VERIFIED",
          meaningfulBrandedSearchDemand: "VERIFIED",
          knownPain: "ASSUMPTION",
        },
      },
      { persistence: adapter },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.downstreamHandoff.companyName).toBe("Acme");
      expect(result.data.downstreamHandoff.observedTrigger).toBe(
        result.data.angleRecommendation.safeOpeningQuestion,
      );
      expect(result.data.downstreamHandoff.internalNotes).toContain("Use as questions, not facts");
      expect(result.data.downstreamHandoff.internalNotes).toContain("Claims to avoid");
      expect(result.data.downstreamHandoff.internalNotes).not.toContain(
        "VERIFIED_APPROVED_INTERNAL",
      );
      expect(result.data.downstreamHandoff.internalNotes).not.toContain("MODEL_INFERENCE");
    }
  });

  it("persists assessments separately without modifying knowledge or suppression data", async () => {
    const suppression: DoNotContactRecord = {
      id: "partner",
      companyName: "Partner Co",
      status: "PARTNER",
    };
    const { adapter, persisted, records } = persistence([suppression]);
    const original = { ...baseInput };

    const result = await assessAccountResearch(baseInput, { persistence: adapter });

    expect(result.ok).toBe(true);
    expect(persisted).toHaveLength(1);
    expect(persisted[0].result.qualificationResult).toBe("Strong fit");
    expect(baseInput).toEqual(original);
    expect(records).toEqual([suppression]);
  });

  it("blocks admin-only evidence inspection for non-admin users", async () => {
    const result = await assessAccountResearch(
      { ...baseInput, adminEvidenceRequested: true },
      { persistence: persistence([], "SALES_USER").adapter },
    );
    const admin = await assessAccountResearch(
      { ...baseInput, adminEvidenceRequested: true },
      { persistence: persistence([], "KNOWLEDGE_ADMIN").adapter },
    );

    expect(result).toEqual({
      ok: false,
      code: "FORBIDDEN",
      message: "Only knowledge admins can inspect assessment evidence.",
    });
    expect(admin.ok).toBe(true);
  });

  it("returns structured errors for invalid input and unauthorized actors", async () => {
    const invalid = await assessAccountResearch(
      { companyName: "" },
      { persistence: persistence().adapter },
    );
    const forbidden = await assessAccountResearch(baseInput, {
      persistence: persistence([], "VIEWER").adapter,
    });

    expect(invalid).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Account Research input is malformed.",
    });
    expect(forbidden).toEqual({
      ok: false,
      code: "FORBIDDEN",
      message: "Only authorized sales or knowledge users can assess accounts.",
    });
  });
});
