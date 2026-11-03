import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
import { createWorkforceBuildInfo } from "../../../../scripts/workforce-build-info";
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
  vi.unstubAllEnvs();
});
describe("operational dashboard without invented records", () => {
  it("offers deliberate historical batches and hides unsupported local sync actions", async () => {
    const data = await fixture();
    data.localReadOnly = true;
    data.integrations.forEach((i) => {
      i.localReadOnly = true;
    });
    const collect = vi.fn(),
      change = vi.fn();
    render(
      <DashboardView
        data={data}
        intakeWindow="PAST_YEAR"
        onCollect={collect}
        onIntakeWindow={change}
      />,
    );
    expect(screen.queryAllByRole("button", { name: "Sync read-only" })).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Run now" })).toBeNull();
    expect(collect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Read 10 historical contacts" }));
    expect(collect).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByLabelText("Review window"), {
      target: { value: "TODAY" },
    });
    expect(change).toHaveBeenCalledWith("TODAY");
  });
  it("embeds the build identity in the rendered client without changing integration controls", async () => {
    const build = createWorkforceBuildInfo(process.cwd());
    vi.stubEnv("NEXT_PUBLIC_WORKFORCE_BUILD_INFO", JSON.stringify(build));
    const { container } = render(<DashboardView data={await fixture()} />);
    expect(
      JSON.parse(
        container.querySelector("[data-workforce-build]")!.getAttribute("data-workforce-build")!,
      ),
    ).toEqual(build);
    expect(screen.getByRole("region", { name: "Connection Health" })).toBeTruthy();
    expect(screen.getByText("Advanced details").closest("details")).toHaveProperty("open", false);
    fireEvent.click(screen.getByText("Advanced details"));
    expect(screen.getAllByRole("button", { name: "Check access" }).length).toBeGreaterThan(0);
  });
  it("renders integration actions for a successful dashboard response without sync metadata", async () => {
    const data = await fixture();
    data.integrations = data.integrations.map((integration) => ({
      ...integration,
      status: integration.id === "HUBSPOT" ? "CONFIGURED_UNTESTED" : integration.status,
      detail:
        integration.id === "OUTREACH"
          ? "No read-only history/sequence adapter is registered. Unknown outbound, suppression and active sequence history means HOLD. Writes and enrollment are disabled."
          : integration.detail,
    }));
    expect(data.integrations.find((integration) => integration.id === "OUTREACH")?.status).toBe(
      "NOT_IMPLEMENTED",
    );
    expect(data.integrations.every((integration) => integration.sync === undefined)).toBe(true);
    const fetch = vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        url === "/api/sales-agent/dashboard"
          ? { ok: true, data }
          : { ok: false, message: "Unrelated panel unavailable" },
    }));
    vi.stubGlobal("fetch", fetch);
    render(<WorkforceDashboard />);
    await screen.findByText("Fixture Prospect");
    expect(screen.getAllByText("Needs attention").length).toBeGreaterThan(0);
    expect(screen.getByText("Advanced details").closest("details")).toHaveProperty("open", false);
    fireEvent.click(screen.getByText("Advanced details"));
    const health = within(screen.getByRole("region", { name: "Connection diagnostics" }));
    expect(health.getAllByRole("button", { name: "Check access" }).length).toBeGreaterThan(0);
    expect(health.queryByRole("button", { name: "Resume sync" })).toBeNull();
    expect(fetch.mock.calls.every(([url]) => url !== "/api/sales-agent/integrations")).toBe(true);
  });
  it("renders actionable empty states with secondary Manual Research, not an intake form", async () => {
    const data = await fixture();
    data.prospects = [];
    data.metrics = { reviewedToday: 0, eligible: 0, hold: 0, rejected: 0 };
    render(<DashboardView data={data} />);
    expect(screen.getByRole("heading", { name: "Daily prospect workspace" })).toBeTruthy();
    expect(screen.getByText("No prospects in this view.")).toBeTruthy();
    expect(screen.queryByLabelText("Company name")).toBeNull();
    fireEvent.click(screen.getByText("Advanced details"));
    expect(screen.getByRole("button", { name: "Collect today’s contacts" })).toBeTruthy();
  });
  it("searches the prospect list without exposing a technical eligibility filter", async () => {
    const data = await fixture();
    render(<DashboardView data={data} />);
    expect(screen.getByText("Fixture Prospect")).toBeTruthy();
    expect(screen.getByText("Last evidenced outreach: Unknown")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search prospects"), { target: { value: "not-found" } });
    expect(screen.queryByText("Fixture Prospect")).toBeNull();
    fireEvent.change(screen.getByLabelText("Search prospects"), { target: { value: "42" } });
    expect(screen.getByText("Fixture Prospect")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Prepare" })).toBeTruthy();
  });
  it("opens exact saved contact drafts for editing while retaining INTERNAL ONLY, HOLD and REVISE", async () => {
    const data = await fixture();
    const prospect = data.prospects[0];
    prospect.plan.decision.status = "HOLD";
    prospect.savedInternalPacket = {
      documentId: "6fd29831-5f00-4f67-8a6c-ebfb4474e72f",
      createdAt: "2026-10-21T12:39:11.920Z",
      verdict: "REVISE",
      concerns: ["Tighten the opening"],
      emails: Array.from({ length: 4 }, (_, index) => ({
        subject: `Saved subject ${index + 1}`,
        body: `Saved body ${index + 1}`,
      })),
    };
    render(<DashboardView data={data} />);
    expect(screen.getByText("4 saved drafts · REVISE · INTERNAL ONLY")).toBeTruthy();
    expect(screen.getByText("Hold · sending blocked")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "View emails" }));
    expect(
      screen.getByText(/These are the original saved drafts, not newly generated/),
    ).toBeTruthy();
    expect(screen.getByText(/Independent review verdict: REVISE/)).toBeTruthy();
    expect(
      screen
        .getAllByRole("textbox")
        .filter((element) => element.getAttribute("aria-label")?.startsWith("Email ")),
    ).toHaveLength(8);
    fireEvent.change(screen.getByLabelText("Email 1 subject"), { target: { value: "Local edit" } });
    expect(screen.getByLabelText("Email 1 subject")).toHaveProperty("value", "Local edit");
    expect(data.prospects[0].savedInternalPacket?.emails[0].subject).toBe("Saved subject 1");
    expect(screen.getByText(/Edits below stay in this browser session/)).toBeTruthy();
  });
  it("shows verification and Outreach gaps, screenshot recommendations and locked drafts separately", async () => {
    const data = await fixture();
    const p = data.prospects[0];
    data.localReadOnly = true;
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
    expect(screen.getByRole("link", { name: "Open company research" }).getAttribute("href")).toBe(
      `/sales-agent/company-research?company=${encodeURIComponent(p.contact.companyDomain ?? p.contact.companyName ?? "")}`,
    );
    expect(screen.getByText(/fictional recipient and never approve outreach/)).toBeTruthy();
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
    expect(screen.getByRole("heading", { name: "Prospect List" })).toBeTruthy();
    expect(screen.queryByText("Fixture Prospect")).toBeNull();
  });
});
