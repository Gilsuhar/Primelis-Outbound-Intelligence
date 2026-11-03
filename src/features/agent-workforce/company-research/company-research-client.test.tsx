import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CompanyResearchClient } from "./company-research-client";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("loads saved history without a paid call and disables research when AI is off", async () => {
  const fetcher = vi.fn(async () => ({
    ok: true,
    json: async () => ({ ok: true, runs: [], aiReady: false }),
  }));
  vi.stubGlobal("fetch", fetcher);
  render(<CompanyResearchClient />);
  await screen.findByText("No saved company research.");
  expect(
    (screen.getByRole("button", { name: "Research company" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(screen.getByLabelText("Company name")).toBeTruthy();
  expect(screen.getByLabelText("Company domain")).toBeTruthy();
  expect(screen.queryByLabelText(/prospect|contact/i)).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("submits exactly two company fields only after explicit user action", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, runs: [], aiReady: true }) })
    .mockResolvedValueOnce({
      ok: false,
      json: async () => ({ ok: false, message: "Fictional research blocked" }),
    });
  vi.stubGlobal("fetch", fetcher);
  render(<CompanyResearchClient />);
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "Research company" }) as HTMLButtonElement).disabled,
    ).toBe(false),
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText("Company name"), { target: { value: "Fictional Acme" } });
  fireEvent.change(screen.getByLabelText("Company domain"), { target: { value: "acme.example" } });
  fireEvent.click(screen.getByRole("button", { name: "Research company" }));
  await screen.findByText("Fictional research blocked");
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
    companyName: "Fictional Acme",
    companyDomain: "acme.example",
  });
  expect(fetcher.mock.calls[1][1].headers["idempotency-key"]).toMatch(/^[a-zA-Z0-9-]{16,100}$/);
});
it("keeps audit candidates visibly separate from validated findings and performs GET only", async () => {
  const at = "2026-10-18T17:58:53.990Z";
  const run = {
    version: 1,
    id: "offline-audit-display",
    input: { companyName: "Fixture Company", companyDomain: "fixture.example" },
    createdAt: at,
    updatedAt: at,
    status: "INCOMPLETE",
    research: {
      accountDomain: "fixture.example",
      prospectId: "offline-audit-display",
      researchedAt: at,
      sources: [],
      facts: [],
      gaps: [],
      assumptions: [],
    },
    issues: ["Grounding rejected"],
    usage: [],
    approved: false,
    canSend: false,
    canEnroll: false,
    groundingAudit: {
      version: 1,
      status: "REJECTED",
      identityMatches: true,
      reasonCodes: ["REJECTED_FACTS"],
      reviewer: {
        supportedCandidateIds: [],
        rejectedCandidateIds: ["candidate-1"],
        supportedCount: 0,
        rejectedCount: 1,
        unknownSupportedCount: 0,
        unknownRejectedCount: 0,
        concernCount: 2,
        concernCodes: ["CLAIM_NOT_ENTAILED"],
        concerns: [
          {
            severity: "BLOCKING",
            code: "CLAIM_NOT_ENTAILED",
            scope: "FACT",
            candidateIds: ["candidate-1"],
            sourceIds: [],
            attributionOmitted: false,
            reason: "Fixture claim exceeds its source quote.",
          },
          {
            severity: "NONBLOCKING",
            code: "CONTEXT_LIMITATION",
            scope: "GLOBAL",
            candidateIds: [],
            sourceIds: [],
            attributionOmitted: false,
            reason: "Company description does not establish buying intent.",
          },
        ],
      },
      candidates: [
        {
          candidateId: "candidate-1",
          factId: "account:products",
          verified: false,
          deterministicChecks: "PASSED",
          reviewerDecision: "REJECTED",
          statement: "Fixture audit-only rejected statement",
          sourceIds: [],
          quotes: [],
        },
      ],
    },
  };
  const fetcher = vi.fn(async () => ({
    ok: true,
    json: async () => ({ ok: true, runs: [run], aiReady: false }),
  }));
  vi.stubGlobal("fetch", fetcher);
  render(<CompanyResearchClient />);
  await screen.findByText("No validated company facts available.");
  const candidate = screen.getByText("Unverified candidate: Fixture audit-only rejected statement");
  expect(candidate.closest("details")).not.toBeNull();
  const blocking = screen.getByText(/Reviewer note · BLOCKING · CLAIM_NOT_ENTAILED/);
  expect(blocking.closest("details")).not.toBeNull();
  expect(blocking.textContent).toContain("Fixture claim exceeds its source quote.");
  expect(blocking.textContent).toContain("candidate-1");
  expect(
    screen.getByText(/Reviewer note · NONBLOCKING · CONTEXT_LIMITATION/).closest("details"),
  ).not.toBeNull();
  expect(
    screen.getByText(
      "Audit only. Candidate claims are not validated findings or approval to send.",
    ),
  ).toBeTruthy();
  expect(screen.queryByText(/Fixture audit-only rejected statement · .*confidence/)).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledWith("/api/sales-agent/company-research", { cache: "no-store" });
});
it("still displays historical runs with no grounding audit", async () => {
  const at = "2026-10-18T17:58:53.990Z";
  const run = {
    version: 1,
    id: "offline-legacy",
    input: { companyName: "Legacy Company", companyDomain: "legacy.example" },
    createdAt: at,
    updatedAt: at,
    status: "INCOMPLETE",
    research: {
      accountDomain: "legacy.example",
      prospectId: "offline-legacy",
      researchedAt: at,
      sources: [],
      facts: [],
      gaps: [],
      assumptions: [],
    },
    issues: [],
    usage: [],
    approved: false,
    canSend: false,
    canEnroll: false,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, runs: [run], aiReady: false }),
    })),
  );
  render(<CompanyResearchClient />);
  await screen.findByText("Legacy Company · legacy.example");
  expect(screen.queryByText("Grounding audit · unverified candidates")).toBeNull();
});
