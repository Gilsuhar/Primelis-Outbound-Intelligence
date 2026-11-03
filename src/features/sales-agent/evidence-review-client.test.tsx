import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EvidenceReviewClient } from "./evidence-review-client";

const row = (id: string, status: "READY" | "HOLD" | "REJECTED") => ({
  contact: { hubspotRecordId: id, fullName: `${status} Prospect`, companyName: "Fixture Company" },
  plan: {
    decision: {
      status,
      reasons: [`${status} explanation`],
      missingVerificationRequirements: status === "HOLD" ? ["Outreach history incomplete"] : [],
    },
    tasks: [{ action: "Verify complete Outreach history", requiresHumanApproval: false }],
  },
  collectedAt: "2026-10-15T12:00:00Z",
  provenance: [],
});
const result = {
  ok: true,
  data: {
    evaluatedAt: "2026-10-15T12:00:00Z",
    rows: [row("1", "READY"), row("2", "HOLD"), row("3", "REJECTED")],
    counts: { READY: 1, HOLD: 1, REJECTED: 1 },
    warnings: [],
    providers: [
      { provider: "OUTREACH", status: "NOT_CONFIGURED", message: "Read-only connection required" },
    ],
  },
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("daily evidence review", () => {
  it("shows all three decisions, reasons, missing requirements and filters", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => result }));
    render(<EvidenceReviewClient />);
    await screen.findByText("HOLD Prospect — HOLD");
    expect(screen.getByText("Outreach history incomplete")).toBeTruthy();
    expect(screen.getByText("READY explanation")).toBeTruthy();
    expect(screen.getByText("REJECTED explanation")).toBeTruthy();
    expect(
      screen.getAllByText(
        "Human approval: required, not granted. Sending and enrollment: disabled.",
      ),
    ).toHaveLength(3);
    fireEvent.change(screen.getByLabelText("Decision"), { target: { value: "HOLD" } });
    expect(screen.queryByText("READY Prospect — READY")).toBeNull();
    expect(screen.getByText("HOLD Prospect — HOLD")).toBeTruthy();
  });
  it("collects read-only evidence and refreshes the saved review", async () => {
    const fetcher = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => ({
      ok: true,
      json: async () =>
        init?.method === "POST"
          ? { ok: true, data: { collected: 3, complete: false, nextCursor: "100", warnings: [] } }
          : result,
    }));
    vi.stubGlobal("fetch", fetcher);
    render(<EvidenceReviewClient />);
    await screen.findByText("HOLD Prospect — HOLD");
    fireEvent.click(screen.getByRole("button", { name: "Read HubSpot evidence" }));
    await screen.findByRole("button", { name: "Collect next page" });
    fireEvent.click(screen.getByRole("button", { name: "Collect next page" }));
    await waitFor(() =>
      expect(
        fetcher.mock.calls.some(
          ([, init]) => init?.method === "POST" && init.body === '{"after":"100"}',
        ),
      ).toBe(true),
    );
  });
  it("reports configuration failure without demo data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ ok: false, message: "Configure the database" }),
      }),
    );
    render(<EvidenceReviewClient />);
    expect((await screen.findByRole("alert")).textContent).toContain("Configure the database");
    expect(screen.queryByText("READY Prospect — READY")).toBeNull();
  });
  it("explicitly switches to fictional data, disables collection and ignores a late live response", async () => {
    let resolveLive!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      resolveLive = resolve;
    });
    const demoResult = { ...result, data: { ...result.data, rows: [row("fixture", "READY")] } };
    const fetcher = vi
      .fn()
      .mockImplementation((url: string) =>
        url.endsWith("/demo")
          ? Promise.resolve({ ok: true, json: async () => demoResult })
          : pending,
      );
    vi.stubGlobal("fetch", fetcher);
    render(<EvidenceReviewClient />);
    fireEvent.click(screen.getByRole("button", { name: "Explore five fictional test prospects" }));
    await screen.findByText("READY Prospect — READY");
    expect(screen.getByText(/FICTIONAL TEST DATA — simulated/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Read HubSpot evidence" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    resolveLive({ ok: true, json: async () => result });
    await waitFor(() => expect(screen.queryByText("HOLD Prospect — HOLD")).toBeNull());
    expect(fetcher.mock.calls.every(([, init]) => !init?.method)).toBe(true);
  });
});
