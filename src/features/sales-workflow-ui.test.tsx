import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
import type { SequenceStep } from "@/features/build-sequence/types";
import { CreateOutreachClient } from "@/features/create-outreach/create-outreach-client";
import { ReplyToProspectClient } from "@/features/reply-to-prospect/reply-to-prospect-client";
import { AccountResearchClient } from "@/features/account-research/account-research-client";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

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
    expect(screen.getByText("Advanced optional details").closest("details")?.open).toBe(false);
  });

  it("keeps Build Sequence screenshot context optional and tucked into advanced details", () => {
    render(<BuildSequenceClient />);

    const advanced = screen.getByText("Advanced optional details").closest("details");
    expect(advanced?.open).toBe(false);

    fireEvent.click(screen.getByText("Advanced optional details"));
    expect(screen.getByText("Screenshot or SERP context available")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Screenshot or SERP context available"));
    expect(screen.getByLabelText("Screenshot context")).toBeTruthy();
    expect(screen.getByLabelText("What the screenshot shows")).toBeTruthy();
    expect(screen.getByLabelText("Brand keyword")).toBeTruthy();
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
