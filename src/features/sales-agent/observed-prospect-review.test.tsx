import React from "react";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { observedProspectSchema, observedProspectDecision } from "./observed-prospect-review";
import { ObservedProspectPanel } from "./observed-prospect-panel";

const fixture = {
  kind: "READ_ONLY_OBSERVATIONS",
  observedAt: "2026-10-20T12:00:00.000Z",
  contact: {
    id: "123",
    ownerId: "1087915602",
    name: "Fictional Person",
    title: "Senior Manager, Paid Search",
    company: "Fictional Company",
    url: "https://example.test/contact/123",
  },
  observations: [
    {
      label: "CRM fields",
      value: "397 employees; revenue 91000000; sequence false; email valid",
      limitation:
        "No currency, independent employment, current email binding or Outreach authority.",
      url: "https://example.test/contact/123",
    },
  ],
  context: [],
  hypothesis: "Test brand coverage only after evidence is verified.",
  nextActions: ["Obtain independent evidence."],
};

describe("read-only prospect context", () => {
  it("does not convert CRM observations or a Search title into clearance", () => {
    const decision = observedProspectDecision(observedProspectSchema.parse(fixture));
    expect(decision.status).toBe("HOLD");
    expect(decision.drafts).toEqual([]);
    expect(decision.reasons).toContain("Outreach history incomplete");
    expect(decision.reasons).toContain("Annual revenue not verified");
    expect(decision.reasons).toContain(
      "Business email lacks current independent VALID verification",
    );
    expect(decision.grounding).toBe("NOT_RUN");
    expect(decision.semanticJudgement).toBe("NOT_RUN");
  });
  it.each([
    { ...fixture, approved: true },
    { ...fixture, emails: ["Unauthorized draft"] },
    { ...fixture, contact: { ...fixture.contact, email: "person@example.test" } },
    { ...fixture, contact: { ...fixture.contact, ownerId: "another-owner" } },
    { ...fixture, contact: { ...fixture.contact, url: "javascript:alert(1)" } },
    { ...fixture, contact: { ...fixture.contact, url: "https://user:password@example.test/" } },
  ])("rejects unauthorized fields, ownership or unsafe links", (value) => {
    expect(observedProspectSchema.safeParse(value).success).toBe(false);
  });
  it("renders real HOLD and explicitly separates fictional examples without actions", () => {
    render(<ObservedProspectPanel packet={observedProspectSchema.parse(fixture)} />);
    expect(screen.getByText("Real prospect review — HOLD")).toBeInTheDocument();
    expect(screen.getByText("No real-contact drafts.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(
      screen.getByText(/fictional examples below do not qualify this person/),
    ).toBeInTheDocument();
  });
});
