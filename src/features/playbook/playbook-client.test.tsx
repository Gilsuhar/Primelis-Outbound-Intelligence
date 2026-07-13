import React from "react";
import { render, screen } from "@testing-library/react";
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
      id: "case",
      category: "CASE_STUDY" as const,
      title: "Example case study",
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
  it("renders the playbook, evidence labels, approved product truth, and restricted warnings", () => {
    render(<PlaybookClient data={data} viewerRole="SALES_USER" />);

    expect(screen.getByText("Signal Playbook")).toBeTruthy();
    expect(screen.getByText("Approved Product Truth is used here.")).toBeTruthy();
    expect(screen.getAllByText("Proven").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Strong hypothesis").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Exploratory").length).toBeGreaterThan(0);
    expect(screen.getByText("Internal use only")).toBeTruthy();
    expect(screen.getByText("Manager approval (manager only)")).toBeTruthy();
  });
});
