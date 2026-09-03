import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/ask-signal-brain/actions", () => ({
  askSignalBrainAction: vi.fn(),
}));

vi.mock("@/app/account-status/actions", () => ({
  checkAccountStatusAction: vi.fn(async () => ({
    ok: true,
    data: {
      status: "CLEAR",
      canGenerate: true,
      confidence: "LOW",
      matches: [],
      warnings: [],
      nextActions: [],
    },
  })),
}));

vi.mock("@/app/build-sequence/actions", () => ({
  generateBuildSequenceAction: vi.fn(),
  pushSequenceToHubSpotAction: vi.fn(),
}));

vi.mock("@/app/create-outreach/actions", () => ({
  generateCreateOutreachAction: vi.fn(),
}));

vi.mock("@/app/reply-to-prospect/actions", () => ({
  generateReplyToProspectAction: vi.fn(),
}));

vi.mock("@/lib/auth/action-actor", () => ({
  withAuthenticatedCreator: vi.fn(),
  withAuthenticatedReviewActor: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/features/draft-refinement/draft-refinement-panel", () => ({
  DraftRefinementPanel: () => <div data-testid="draft-refinement-panel" />,
}));

import { AskSignalBrainClient } from "@/features/ask-signal-brain/ask-signal-brain-client";
import {
  __buildSequenceVariantTest,
  BuildSequenceClient,
} from "@/features/build-sequence/build-sequence-client";
import type { BuildSequenceResult, SequenceStep } from "@/features/build-sequence/types";
import { CreateOutreachClient } from "@/features/create-outreach/create-outreach-client";
import { ReplyToProspectClient } from "@/features/reply-to-prospect/reply-to-prospect-client";
import { AccountResearchClient } from "@/features/account-research/account-research-client";
import { generateBuildSequenceAction } from "@/app/build-sequence/actions";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

afterEach(() => {
  vi.clearAllMocks();
});

function buildSequenceResult(overrides: Partial<BuildSequenceResult> = {}): BuildSequenceResult {
  return {
    draftId: "draft-test",
    overallStrategy: "Build a concise paid-search sequence.",
    selectedAngle: "BRANDED_SEARCH_EFFICIENCY",
    angleRationale: "The account context points to branded-search efficiency.",
    personaEmphasis: {
      persona: "PAID_SEARCH_LEADER",
      emphasis: "operational control",
      rationale: "Keep it practical and tied to campaign decisions.",
    },
    prospectIntelligence: {
      prospectName: "Morgan Lee",
      companyName: "Cisco",
      jobTitle: "Director of Paid Search",
      persona: "PAID_SEARCH",
      relevantFacts: [],
      selectedInsights: [],
      contextInterpretation: {
        currentCompany: "Cisco",
        currentRole: "Director of Paid Search",
        currentResponsibilities: [],
        currentPrioritiesOrInterests: [],
        currentToolsOrChannels: [],
        historicalExperience: [],
        historicalCompanies: [],
        credibilitySignals: [],
        personalBackground: [],
        commercialSignals: [],
        uncertainFacts: [],
        rejectedHistoricalProjections: [],
      },
      companyContext: [],
      likelyPriorities: [],
      serpScenario: "UNKNOWN",
      serpEvidence: {
        keywords: [],
        soloKeywords: [],
        contestedKeywords: [],
        competitors: [],
        observations: [],
        structuredKeywords: [],
      },
      primaryAngle: "Brand efficiency",
      confidence: { prospect: "MEDIUM", serp: "LOW" },
    },
    messageStrategy: {
      prospectInsight: "Paid-search leader at Cisco.",
      businessQuestion: "Where does live competition change branded bidding?",
      productGap: "Google Ads does not make live SERP competition obvious.",
      primaryAngle: "Brand efficiency",
      relevantCapability: "Live SERP monitoring",
      whyThisShouldResonate: "It maps to paid-search operations.",
      openingStyle: "BUSINESS_QUESTION",
      sequenceNarrative: [
        { step: 1, objective: "Open relevance", newInformation: "Prospect context", ctaIntent: "Discovery" },
        { step: 2, objective: "Frame problem", newInformation: "Auction changes", ctaIntent: "Assess process" },
        { step: 3, objective: "Explain method", newInformation: "Signal capability", ctaIntent: "Invite review" },
        { step: 4, objective: "Proof", newInformation: "Approved proof", ctaIntent: "Soft CTA" },
      ],
      confidence: "MEDIUM",
      selectedGoldStandardExampleIds: [],
    },
    selectedGoldStandardExamples: [],
    detectedAccountSignals: [],
    steps: [],
    claimsUsed: [],
    safetyNotes: [],
    knowledgeLimitations: [],
    sequenceLength: 4,
    overallDuration: "12 business days",
    recordsUsed: [],
    sourceReferences: [],
    provider: {
      providerName: "deterministic-development",
      modelName: "deterministic",
      deterministic: true,
    },
    ...overrides,
  };
}

describe("Sales workflow UI", () => {
  it("keeps Create Outreach focused on a quick brief", () => {
    render(<CreateOutreachClient />);

    expect(screen.getByRole("heading", { name: "Quick brief" })).toBeTruthy();
    expect(screen.getByText("Company")).toBeTruthy();
    expect(screen.getByText("Buyer role")).toBeTruthy();
    expect(screen.getByText("Fit / ICP")).toBeTruthy();
    expect(screen.getByText("Industry")).toBeTruthy();
    expect(screen.getByText("Reason for outreach")).toBeTruthy();
    expect(screen.getByText("Tone")).toBeTruthy();
    expect(screen.getByText("Email length")).toBeTruthy();
    expect(screen.getByText("Use relevant case study if available")).toBeTruthy();
    expect(screen.getByText("Advanced optional details").closest("details")?.open).toBe(false);
  });

  it("infers website/domain from the company name", () => {
    render(<CreateOutreachClient />);

    fireEvent.change(screen.getByLabelText("Company"), { target: { value: "Nike" } });
    expect((screen.getByLabelText("Website") as HTMLInputElement).value).toBe("nike.com");
  });

  it("keeps Build Sequence focused on Prospect Intelligence inputs", () => {
    render(<BuildSequenceClient />);

    expect(screen.getByRole("heading", { name: "Prospect Intelligence" })).toBeTruthy();
    expect(screen.getByText("LinkedIn profile URL")).toBeTruthy();
    expect(screen.getByText("Prospect Context")).toBeTruthy();
    expect(screen.getByText("SERP Evidence")).toBeTruthy();
    expect(screen.getByText("Company")).toBeTruthy();
    expect(screen.getByText("Buyer role")).toBeTruthy();
    expect(screen.getByText("Fit / ICP")).toBeTruthy();
    expect(screen.getByText("Industry")).toBeTruthy();
    expect(screen.getByText("Reason for outreach")).toBeTruthy();
    expect(screen.getByText("Steps")).toBeTruthy();
    expect(screen.getByText("Tone")).toBeTruthy();
    expect(screen.getByText("Duration")).toBeTruthy();
    expect(screen.getByText("Edit extracted details").closest("details")?.open).toBe(false);
    expect(document.querySelector("form")?.noValidate).toBe(true);
    expect(document.querySelector<HTMLInputElement>('input[name="companyName"]')?.required).toBe(false);
  });

  it("keeps Build Sequence screenshot context optional and tucked into advanced details", () => {
    render(<BuildSequenceClient />);

    const advanced = screen.getByText("Edit extracted details").closest("details");
    expect(advanced?.open).toBe(false);

    fireEvent.click(screen.getByText("Edit extracted details"));
    expect(screen.getByText("Screenshot or SERP context available")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Screenshot or SERP context available"));
    expect(screen.getByLabelText("Screenshot context")).toBeTruthy();
    expect(screen.getByLabelText("What the screenshot shows")).toBeTruthy();
    expect(screen.getByLabelText("Brand keyword")).toBeTruthy();
  });

  it("submits Build Sequence from Prospect Context only and renders action errors", async () => {
    const action = vi.mocked(generateBuildSequenceAction);
    action.mockResolvedValueOnce({
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Test-visible generation failure.",
    });
    render(<BuildSequenceClient />);

    const prospectContext = document.querySelector<HTMLTextAreaElement>(
      'textarea[name="rawProspectContext"]',
    );
    expect(prospectContext).toBeTruthy();
    fireEvent.change(prospectContext!, {
      target: {
        value:
          "Chris\nRemofirst\nmanaged over $50M in paid media\ninterested in AI / automation for paid search\nGoogle Ads live SERP competition context",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate intelligence & sequence" }));

    expect(screen.getByText("Understanding prospect... Building strategy... Generating sequence...")).toBeTruthy();
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(action.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        companyName: "",
        contactFirstName: undefined,
        industry: undefined,
        accountStatusOverride: false,
      }),
    );
    await waitFor(() => expect(screen.getByText("Test-visible generation failure.")).toBeTruthy());
  });

  it("passes an optional LinkedIn profile URL into Build Sequence prospect context", async () => {
    const action = vi.mocked(generateBuildSequenceAction);
    action.mockResolvedValueOnce({
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Test-visible generation failure.",
    });
    render(<BuildSequenceClient />);

    const linkedinUrl = document.querySelector<HTMLInputElement>('input[name="linkedinProfileUrl"]');
    expect(linkedinUrl).toBeTruthy();
    fireEvent.change(linkedinUrl!, {
      target: { value: "https://www.linkedin.com/in/chris-example/" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate intelligence & sequence" }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(action.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        rawProspectContext: "LinkedIn URL: https://www.linkedin.com/in/chris-example/",
        prospectContext: "LinkedIn URL: https://www.linkedin.com/in/chris-example/",
      }),
    );
  });

  it("renders existing-activity warnings after successful Build Sequence generation", async () => {
    const action = vi.mocked(generateBuildSequenceAction);
    action.mockResolvedValueOnce({
      ok: true,
      data: buildSequenceResult({
        safetyNotes: [
          "Existing ownership or recent outreach activity found for Cisco. Review this before sending or pushing to CRM.",
        ],
      }),
    });
    render(<BuildSequenceClient />);

    const prospectContext = document.querySelector<HTMLTextAreaElement>(
      'textarea[name="rawProspectContext"]',
    );
    fireEvent.change(prospectContext!, {
      target: { value: "Morgan Lee\nCisco\nDirector of Paid Search" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate intelligence & sequence" }));

    await waitFor(() =>
      expect(
        screen.getByText(
          "Existing ownership or recent outreach activity found for Cisco. Review this before sending or pushing to CRM.",
        ),
      ).toBeTruthy(),
    );
  });

  it("gives Build Sequence Generate buttons materially different local variants", () => {
    const step: SequenceStep = {
      stepNumber: 1,
      channel: "EMAIL",
      delay: "Day 0",
      purpose: "FIRST_TOUCH_RELEVANCE",
      channelRationale: "Email is selected.",
      subjectLine: "Nike paid brand question",
      messageBody:
        "Hi there,\n\nI had Nike on my list because branded search can look healthy in reports.",
      cta: "Do you already track this today?",
      claimsUsed: [],
      sourceIds: [],
    };

    const bodyVariants = __buildSequenceVariantTest.bodyVariants(step, "Nike");
    const ctaVariants = __buildSequenceVariantTest.ctaVariants(step);
    const subjectVariants = __buildSequenceVariantTest.subjectVariants(step, "Nike");

    expect(bodyVariants).not.toContain(step.messageBody);
    expect(ctaVariants).not.toContain(step.cta);
    expect(subjectVariants).not.toContain(step.subjectLine);
    expect(bodyVariants.join(" ")).toMatch(/captured the click|nobody else is bidding/i);
    expect(new Set(ctaVariants).size).toBe(ctaVariants.length);
    expect(__buildSequenceVariantTest.variantIndex(-1, bodyVariants.length)).toBe(0);
  });

  it("formats Build Sequence copy-all from canonical steps exactly once", () => {
    const steps: SequenceStep[] = [1, 2, 3, 4].map((stepNumber) => ({
      stepNumber,
      channel: "EMAIL",
      delay: stepNumber === 1 ? "Day 0" : stepNumber === 4 ? "Final touch" : `Day ${stepNumber * 3}`,
      purpose:
        stepNumber === 1
          ? "FIRST_TOUCH_RELEVANCE"
          : stepNumber === 2
            ? "PROBLEM_FRAMING"
            : stepNumber === 3
              ? "METHODOLOGY_DIFFERENTIATION"
              : "BREAKUP_CLOSE_LOOP",
      channelRationale: "Email is selected.",
      subjectLine: `Subject ${stepNumber}`,
      messageBody: `Body ${stepNumber}`,
      cta: `CTA ${stepNumber}?`,
      claimsUsed: [`Claim ${stepNumber}`],
      sourceIds: [`source-${stepNumber}`],
    }));

    const copied = __buildSequenceVariantTest.buildFullSequenceText(steps);

    expect(copied.match(/Step 1 - Day 0/g)).toHaveLength(1);
    expect(copied.match(/Step 2 - Day 6/g)).toHaveLength(1);
    expect(copied.match(/Step 3 - Day 9/g)).toHaveLength(1);
    expect(copied.match(/Step 4 - Final touch/g)).toHaveLength(1);
    expect(copied).not.toMatch(/claimsUsed|sourceIds|channelRationale|overallStrategy/i);
  });

  it("infers domains in Account Research and explains the result", () => {
    render(<AccountResearchClient />);

    fireEvent.change(screen.getByLabelText("Company name"), { target: { value: "Nike" } });
    expect((screen.getByLabelText("Company domain") as HTMLInputElement).value).toBe("nike.com");
    expect(screen.getByText(/You will see the fit decision/i)).toBeTruthy();
    expect(screen.queryByText("User provided")).toBeNull();
  });

  it("keeps Reply and Brain advanced context closed by default", () => {
    render(<ReplyToProspectClient />);
    expect(screen.getByRole("heading", { name: "Quick reply brief" })).toBeTruthy();
    expect(screen.getByText("Advanced optional context").closest("details")?.open).toBe(false);

    render(<AskSignalBrainClient />);
    expect(screen.getByRole("heading", { name: "Quick question" })).toBeTruthy();
    expect(screen.getByText("Advanced account context").closest("details")?.open).toBe(false);
  });
});
