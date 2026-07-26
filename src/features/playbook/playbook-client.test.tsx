import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PlaybookClient } from "./playbook-client";
import { industries, personas, practiceScenarios } from "./playbook-content";

const data = {
  approvedProductTruth: [
    {
      id: "truth",
      category: "PRODUCT_TRUTH" as const,
      title: "Signal core value proposition",
      contentType: "Product Truth",
      status: "APPROVED" as const,
      originalText: "Original",
      approvedWording: "Approved Product Truth is used here.",
      channels: ["EMAIL" as const],
      industries: [],
      personas: [],
      sources: [],
      metrics: [],
      reviewHistory: [],
      isNamedCustomerCaseStudy: false,
      isCompetitorRelated: false,
    },
  ],
  approvedMessagingRules: [],
  objections: [],
  caseStudies: [
    {
      id: "approved-case",
      category: "CASE_STUDY" as const,
      title: "Approved example case study",
      contentType: "Case Study",
      status: "APPROVED" as const,
      originalText: "Approved case",
      channels: ["EMAIL" as const],
      industries: ["Retail"],
      personas: ["VP Performance Marketing"],
      usageScope: "EMAIL_AND_LINKEDIN" as const,
      sources: [
        { id: "source", title: "Approved case source", sourceType: "INTERNAL_DOCUMENT" as const },
      ],
      metrics: [
        {
          id: "approved-metric",
          metricName: "Approved metric",
          value: "N/A",
          direction: "UNKNOWN",
        },
      ],
      reviewHistory: [],
      isNamedCustomerCaseStudy: true,
      isCompetitorRelated: false,
    },
    {
      id: "restricted-case",
      category: "CASE_STUDY" as const,
      title: "Restricted example case study",
      contentType: "Case Study",
      status: "RESTRICTED" as const,
      originalText: "Case",
      channels: ["INTERNAL" as const],
      industries: ["Retail"],
      personas: ["VP Performance Marketing"],
      usageScope: "INTERNAL_ONLY" as const,
      sources: [{ id: "source", title: "Case source", sourceType: "INTERNAL_DOCUMENT" as const }],
      metrics: [{ id: "metric", metricName: "Metric", value: "N/A", direction: "UNKNOWN" }],
      reviewHistory: [],
      isNamedCustomerCaseStudy: true,
      isCompetitorRelated: false,
    },
  ],
  industries,
  personas,
  practiceScenarios,
};

describe("Playbook route content", () => {
  it("renders onboarding, evidence labels, approved product truth, and approved-only proof", () => {
    render(<PlaybookClient data={data} viewerRole="SALES_USER" />);

    expect(screen.getByText("Signal Playbook")).toBeTruthy();
    expect(screen.getByText("Primelis Signal onboarding")).toBeTruthy();
    expect(screen.getByText("1. Learn the product")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Learn Signal" }));
    expect(screen.getByText("Approved Product Truth is used here.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Product" }));
    expect(screen.getByText("Solo Bidder")).toBeTruthy();
    expect(screen.getByText("Monitoring versus automation")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Industries" }));
    expect(screen.getAllByText("Proven").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Strong hypothesis").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Exploratory").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Case Studies" }));
    expect(screen.getByText("Approved example case study")).toBeTruthy();
    expect(screen.queryByText("Restricted example case study")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Handoff" }));
    expect(screen.getByText("Qualified opportunity handoff")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Claims to Avoid" }));
    expect(screen.getByText("Never make these claims casually")).toBeTruthy();
    expect(screen.getByText(/Do not invent pricing/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Progress" }));
    expect(screen.getByText("Manager approval (manager only)")).toBeTruthy();
  });
});
