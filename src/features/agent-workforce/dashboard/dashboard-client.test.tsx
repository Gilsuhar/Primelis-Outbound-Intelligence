import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DashboardView, SafeSource, WorkforceDashboard } from "./dashboard-client";
import { getWorkforceDashboard } from "@/server/agent-workforce/dashboard/service";
import { collectSalesAgentEvidence } from "@/server/services/sales-agent-collection-service";
import {
  MemoryEvidenceStore,
  collectedContact,
  collectionNow,
  fixtureProviders,
} from "@/test/sales-agent-collection-fixtures";
import { MemoryWorkforceStore } from "@/test/workforce-fixtures";
async function fixture() {
  const evidence = new MemoryEvidenceStore();
  await collectSalesAgentEvidence("actor", undefined, {
    store: evidence,
    providers: fixtureProviders(),
    intake: {
      listOwnedContacts: async () => ({
        contacts: [collectedContact],
        complete: true,
        warnings: [],
      }),
    },
    now: () => collectionNow,
  });
  return getWorkforceDashboard("actor", {
    evidence,
    runs: new MemoryWorkforceStore(),
    now: () => collectionNow,
    configured: { hubspot: false, openai: false },
  });
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("operational dashboard without invented records", () => {
  it("renders actionable empty states with secondary Manual Research, not an intake form", async () => {
    const data = await fixture();
    data.prospects = [];
    data.metrics = { reviewedToday: 0, eligible: 0, hold: 0, rejected: 0 };
    render(<DashboardView data={data} />);
    expect(screen.getByRole("heading", { name: "Agent Workforce" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Manual Research/ }).getAttribute("href")).toBe(
      "/sales-agent/manual",
    );
    expect(screen.getByText("Your queue is ready for real contacts")).toBeTruthy();
    expect(screen.queryByLabelText("Company name")).toBeNull();
    expect(screen.getByRole("button", { name: "Collect today’s contacts" })).toBeTruthy();
  });
  it("searches and filters actual contacts, and links to stable HubSpot-keyed details", async () => {
    const data = await fixture();
    render(<DashboardView data={data} />);
    expect(screen.getByRole("link", { name: /Fixture Prospect/ }).getAttribute("href")).toBe(
      "/sales-agent/prospects/42",
    );
    fireEvent.change(screen.getByLabelText("Search prospects"), { target: { value: "not-found" } });
    expect(screen.queryByRole("link", { name: /Fixture Prospect/ })).toBeNull();
    fireEvent.change(screen.getByLabelText("Search prospects"), { target: { value: "42" } });
    expect(screen.getByRole("link", { name: /Fixture Prospect/ })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Eligibility filter"), { target: { value: "HOLD" } });
    expect(screen.getByText(/No contacts match/)).toBeTruthy();
  });
  it("shows verification and Outreach gaps, screenshot recommendations and locked drafts separately", async () => {
    const data = await fixture();
    const p = data.prospects[0];
    p.plan.decision.status = "HOLD";
    p.plan.decision.reasons = ["Outreach history incomplete"];
    p.draftReady = false;
    const reviewed = vi.fn();
    render(<DashboardView data={data} contactId="42" onReview={reviewed} />);
    expect(
      screen.getByRole("heading", { name: "Employment & business-email verification" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Outreach contact history & sequence status" }),
    ).toBeTruthy();
    expect(screen.getByText(/Suggested capture \(not a finding\)/)).toBeTruthy();
    expect(screen.getByText(/Review-only drafting may be available/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Open draft review" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mark reviewed" }));
    expect(reviewed).toHaveBeenCalledWith("42");
    expect(screen.queryByRole("button", { name: /send|enroll/i })).toBeNull();
  });
  it("never replaces an unavailable or unauthorized contact with the first queued record", async () => {
    render(<DashboardView data={await fixture()} contactId="other" />);
    expect(screen.getByText("Prospect unavailable")).toBeTruthy();
    expect(screen.queryByText("Fixture Prospect")).toBeNull();
  });
  it("does not turn unsafe or credential-bearing evidence URLs into links", () => {
    render(
      <>
        <SafeSource url="javascript:alert(1)">Unsafe</SafeSource>
        <SafeSource url="https://user:password@example.com">Credentials</SafeSource>
        <SafeSource url="https://example.com/source">Real source</SafeSource>
      </>,
    );
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link").getAttribute("href")).toBe("https://example.com/source");
  });
  it("surfaces storage/auth failures without invented metrics or fictional prospects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ ok: false, message: "Sign in again" }),
      }),
    );
    render(<WorkforceDashboard />);
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Sign in again");
    expect(screen.getAllByText("—")).toHaveLength(4);
    expect(screen.queryByText("Fixture Prospect")).toBeNull();
  });
});
