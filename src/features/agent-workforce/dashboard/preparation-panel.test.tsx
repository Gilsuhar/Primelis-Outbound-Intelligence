import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PreparationPanel, PreparationResults } from "./preparation-panel";
import type { PreparationPlan } from "./prospect-preparation";
import type { AutomaticCompanyResult } from "../company-research/internal-review";
const plan = {
  considered: 3,
  items: [
    {
      contactId: "contact-1",
      name: "Fictional Contact",
      company: "Fictional Co",
      domain: "fictional.example",
      priorityReason: "Offline fixture",
      eligibility: "HOLD",
      holdReasons: ["Outreach history unresolved"],
      eligibilityChecks: [],
      lastOutbound: "Unknown",
      outreach: "UNRESOLVED",
      contactDraftContext: {
        contactId: "contact-1",
        displayName: "Fictional Contact",
        companyName: "Fictional Co",
        companyDomain: "fictional.example",
        verifiedPersonalizationFacts: [],
        unresolved: ["Employment unresolved"],
        eligibility: "HOLD",
        outboundReady: false,
      },
      action: "RESEARCH" as const,
      maxCalls: 5,
      reason: "Offline fixture",
    },
  ],
  excluded: [],
  warnings: [],
  aiReady: true,
  budget: { dayRemaining: 1, monthRemaining: 5, pending: 0, uncertain: 0 },
  maxCalls: 5,
  maxEstimatedUsd: 1,
} satisfies PreparationPlan;
it("shows the actual HOLD gates and labels incomplete Outreach coverage as unknown", () => {
  const contactResult = {
    status: "REVIEW_REQUIRED",
    stage: "COMPLETE",
    run: null,
    directDrafts: {
      approach: "Synthetic offline example",
      limitations: ["Fictional fixture; no live generation"],
      emails: Array.from({ length: 4 }, (_, i) => ({
        subject: `Offline ${i + 1}`,
        body: `Hi Fictional, offline internal draft ${i + 1}.`,
      })),
    },
    directReview: {
      verdict: "PASS",
      checks: {
        factualAccuracy: true,
        sourceGrounding: true,
        prospectRelevance: true,
        nonRepetitive: true,
        naturalLanguage: true,
        commercialUsefulness: true,
        approvedClaimsOnly: true,
        originality: true,
        strategicFit: true,
      },
      checkedSteps: [1, 2, 3, 4],
      unsupportedAssertions: [],
      concerns: [],
    },
    internalContact: {
      contactId: "fictional-1",
      displayName: "Fictional Contact",
      label: "INTERNAL REVIEW ONLY",
      eligibility: "HOLD",
      outboundReady: false,
      unresolved: ["Employment unresolved", "Email validity unresolved"],
    },
    screenshot: null,
    screenshotReview: "NOT_RUN",
    issues: [],
    modelCalls: 2,
    usage: [],
    contactEligibility: "HOLD",
    mode: "INTERNAL_ONLY",
  } as unknown as AutomaticCompanyResult;
  const reviewPlan = {
    ...plan,
    items: [
      {
        contactId: "fictional-1",
        name: "Fictional Contact",
        company: "Fictional Co",
        domain: "fictional.example",
        priorityReason: "Offline CRM role signal only",
        eligibility: "HOLD",
        holdReasons: ["Outreach history incomplete"],
        eligibilityChecks: [
          {
            id: "emailVerification",
            label: "Independent business email",
            state: "UNKNOWN" as const,
            reason: "Current independent verification is missing",
          },
          {
            id: "outreachHistoryComplete",
            label: "Historical coverage",
            state: "UNKNOWN" as const,
            reason: "Coverage is unresolved",
            evidence: [
              {
                provider: "OUTREACH",
                sourceRecordId: "prospect:10987:visible-api-history-only",
                freshness: "FRESH",
                accepted: false,
                observedAt: "2026-10-21T10:00:00.000Z",
                verifiedAt: "2026-10-21T10:00:00.000Z",
                value: false,
                coverage: {
                  state: "UNRESOLVED_PROVIDER",
                  checkedAt: "2026-10-21T10:00:00.000Z",
                  through: "2026-10-21T10:00:00.000Z",
                  identityMatched: true,
                  permissionsVerified: false,
                  allUserHistory: false,
                  retentionComplete: false,
                },
              },
            ],
          },
        ],
        lastOutbound: "Unknown — Outreach history coverage is incomplete or unresolved",
        contactDraftContext: {
          contactId: "fictional-1",
          displayName: "Fictional Contact",
          companyName: "Fictional Co",
          companyDomain: "fictional.example",
          verifiedPersonalizationFacts: [],
          unresolved: ["Employment unresolved", "Email validity unresolved"],
          eligibility: "HOLD",
          outboundReady: false,
        },
        result: contactResult,
        outreach: "UNRESOLVED — history and suppression remain HOLD",
        action: "BLOCKED" as const,
        maxCalls: 0,
        reason: "Offline review fixture",
      },
    ],
  } satisfies PreparationPlan;
  render(<PreparationResults plan={reviewPlan} />);
  fireEvent.click(screen.getByText(/Eligibility checks/));
  expect(screen.getByText(/Last evidenced outbound: Unknown/)).not.toBeNull();
  expect(screen.getByText(/Independent business email: UNKNOWN/)).not.toBeNull();
  expect(screen.getByText(/Historical coverage: UNKNOWN/)).not.toBeNull();
  expect(screen.getByText(/prospect:10987:visible-api-history-only/)).not.toBeNull();
  expect(screen.getByText(/all-user history unverified/)).not.toBeNull();
  fireEvent.click(screen.getByText("Personalization evidence and unresolved contact facts"));
  expect(screen.getAllByText("Unresolved: Employment unresolved")).toHaveLength(2);
  expect(
    screen.getByText("No independently accepted fresh role or responsibility facts are available."),
  ).not.toBeNull();
  fireEvent.click(
    screen.getByText("Research, Signal opportunity, four drafts and independent verdict"),
  );
  expect(screen.getAllByText(/personalized for Fictional Contact/)).toHaveLength(2);
  expect(screen.getAllByText(/INTERNAL REVIEW ONLY/)).toHaveLength(2);
  expect(screen.getByText("Hi Fictional, offline internal draft 4.")).not.toBeNull();
});
it("shows the persisted paid-authorization, stage and sanitized failure after reload", () => {
  render(
    <PreparationResults
      plan={{
        ...plan,
        items: [
          {
            ...plan.items[0],
            contactDraftContext: {
              ...plan.items[0].contactDraftContext,
              eligibility: "HOLD" as const,
              outboundReady: false as const,
            },
            latestAttempt: {
              attemptId: "a42ec810-50e0-4c0b-a53a-7e11f9a8b830",
              companyDomain: "fictional.example",
              paidAuthorized: true,
              stage: "PREFLIGHT",
              outcome: "BLOCKED",
              submittedAt: "2026-10-21T12:00:00.000Z",
              updatedAt: "2026-10-21T12:00:01.000Z",
              failureCode: "PREPARATION_AI_NOT_READY",
              actualCalls: 0,
              actualEstimatedUsd: 0,
            },
          },
        ],
      }}
    />,
  );
  expect(screen.getByRole("status", { name: "Saved preparation attempt" }).textContent).toContain(
    "Latest saved preparation: BLOCKED",
  );
  expect(screen.getByText(/Paid AI authorized: YES · Stage: PREFLIGHT/)).not.toBeNull();
  expect(screen.getByText("Failure code: PREPARATION_AI_NOT_READY")).not.toBeNull();
  expect(screen.getByText(/Actual usage: 0 calls · \$0.0000 estimated/)).not.toBeNull();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("defaults to unpaid, makes one submission and displays saved results without automatic retry", async () => {
  const fetch = vi.fn(async (_url: string, options?: RequestInit) => ({
    ok: true,
    json: async () => ({
      ok: true,
      data:
        options?.method === "POST"
          ? {
              ...plan,
              newCalls: 0,
              newEstimatedUsd: 0,
              lastAction: {
                paidAuthorized: false,
                outcome: "NOT AUTHORIZED",
                companies: ["Fictional Contact · Fictional Co"],
                maxCalls: 15,
                maxEstimatedUsd: 1,
                actualCalls: 0,
                actualEstimatedUsd: 0,
              },
              warnings: ["No paid calls started"],
            }
          : plan,
    }),
  }));
  vi.stubGlobal("fetch", fetch);
  render(<PreparationPanel onRefresh={() => {}} />);
  const button = screen.getByRole("button", { name: "Prepare selected prospect" });
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  fireEvent.click(button);
  fireEvent.click(button);
  await screen.findByText("No paid calls started");
  const posts = fetch.mock.calls.filter((c) => c[1]?.method === "POST");
  expect(posts).toHaveLength(1);
  expect(JSON.parse(String(posts[0][1]?.body))).toEqual({
    allowPaid: false,
    contactId: "contact-1",
  });
  expect(screen.getByText(/Last action: 0 model calls/)).not.toBeNull();
  expect(screen.getByText("Outcome: NOT AUTHORIZED")).not.toBeNull();
  expect(screen.getByText(/Paid AI authorization in submitted request: NO/)).not.toBeNull();
});
it("does not substitute another contact when a card-selected prospect is absent from the plan", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, data: plan }) })),
  );
  render(<PreparationPanel onRefresh={() => {}} preferredContactId="not-in-plan" />);
  expect(
    await screen.findByText(/This selected contact is not in the current preparation plan/),
  ).not.toBeNull();
  expect(
    (screen.getByRole("button", { name: "Prepare selected prospect" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});
it("lets Gil select one queue contact and submits only that server-validated ID", async () => {
  const second = {
    ...plan.items[0],
    contactId: "contact-2",
    name: "Second Fictional Contact",
    company: "Second Fictional Co",
    domain: "second-fictional.example",
    contactDraftContext: {
      ...plan.items[0].contactDraftContext,
      contactId: "contact-2",
      displayName: "Second Fictional Contact",
      companyName: "Second Fictional Co",
      companyDomain: "second-fictional.example",
    },
  };
  const twoContactPlan = { ...plan, items: [plan.items[0], second] };
  const fetch = vi.fn(async (url: string, options?: RequestInit) => {
    expect(url).toBe("/api/sales-agent/dashboard/prepare");
    if (options?.method === "POST")
      expect(JSON.parse(String(options.body))).toEqual({
        allowPaid: false,
        contactId: "contact-2",
      });
    return {
      ok: true,
      json: async () => ({ ok: true, data: twoContactPlan }),
    };
  });
  vi.stubGlobal("fetch", fetch);
  render(<PreparationPanel onRefresh={() => {}} />);
  await screen.findByRole("option", { name: /Second Fictional Contact/ });
  const selection = screen.getByRole("combobox", {
    name: "Select one contact/company",
  }) as HTMLSelectElement;
  // Wait for the initial default-selection effect before simulating a user changing it.
  await waitFor(() => expect(selection.value).toBe("contact-1"));
  fireEvent.change(selection, {
    target: { value: "contact-2" },
  });
  expect(selection.value).toBe("contact-2");
  fireEvent.click(screen.getByRole("button", { name: "Prepare selected prospect" }));
  await waitFor(() =>
    expect(fetch.mock.calls.some((call) => call[1]?.method === "POST")).toBe(true),
  );
  const post = fetch.mock.calls.find((call) => call[1]?.method === "POST");
  expect(JSON.parse(String(post?.[1]?.body))).toEqual({
    allowPaid: false,
    contactId: "contact-2",
  });
  expect(screen.getAllByText(/Second Fictional Contact · Second Fictional Co/)).toHaveLength(2);
});
it("requires a separate paid confirmation showing companies, call ceiling and estimated cap", async () => {
  const candidatePlan = {
    ...plan,
    items: [
      {
        contactId: "1",
        name: "Fictional Contact",
        company: "Fictional Co",
        domain: "fictional.example",
        priorityReason: "Offline fixture",
        eligibility: "HOLD",
        holdReasons: [],
        eligibilityChecks: [],
        lastOutbound: "Unknown",
        outreach: "Unresolved",
        contactDraftContext: {
          contactId: "1",
          displayName: "Fictional Contact",
          companyName: "Fictional Co",
          companyDomain: "fictional.example",
          verifiedPersonalizationFacts: [],
          unresolved: [],
          eligibility: "HOLD",
          outboundReady: false,
        },
        action: "RESEARCH" as const,
        maxCalls: 5,
        reason: "Offline fixture",
      },
    ],
  } satisfies PreparationPlan;
  const fetch = vi.fn(async (_url: string, options?: RequestInit) => ({
    ok: true,
    json: async () => ({
      ok: true,
      data:
        options?.method === "POST"
          ? {
              ...candidatePlan,
              newCalls: 5,
              newEstimatedUsd: 0.4,
              lastAction: {
                paidAuthorized: true,
                outcome: "COMPLETED",
                companies: ["Fictional Contact · Fictional Co"],
                maxCalls: 5,
                maxEstimatedUsd: 1,
                actualCalls: 5,
                actualEstimatedUsd: 0.4,
              },
            }
          : candidatePlan,
    }),
  }));
  vi.stubGlobal("fetch", fetch);
  render(<PreparationPanel onRefresh={() => {}} />);
  await waitFor(() =>
    expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(false),
  );
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Prepare selected prospect" }));
  expect(fetch.mock.calls.filter((call) => call[1]?.method === "POST")).toHaveLength(0);
  await screen.findByRole("alertdialog", { name: "Confirm paid prospect preparation" });
  const confirmationItem = screen.getByRole("alertdialog").querySelector("li")?.textContent ?? "";
  expect(confirmationItem).toContain("Fictional Contact · Fictional Co");
  expect(confirmationItem).toContain("5 maximum model calls");
  expect(screen.getByText(/Maximum additional estimated usage permitted.*\$1.0000/)).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Confirm and prepare this contact" }));
  await screen.findByText("Outcome: COMPLETED");
  const posts = fetch.mock.calls.filter((call) => call[1]?.method === "POST");
  expect(posts).toHaveLength(1);
  expect(JSON.parse(String(posts[0][1]?.body))).toEqual({
    allowPaid: true,
    contactId: "1",
  });
  expect(screen.getByText(/Paid AI authorization in submitted request: YES/)).not.toBeNull();
  expect(screen.getByText(/Actual usage: 5 calls · \$0.4000 estimated/)).not.toBeNull();
});
it("shows the exact HOLD contact, two-call maximum and prior writer/reviewer estimate before paid confirmation", async () => {
  const revisedPlan: PreparationPlan = {
    ...plan,
    maxCalls: 2,
    items: [
      {
        ...plan.items[0],
        name: "Fictional Reviewer",
        company: "Choice Hotels",
        contactDraftContext: {
          ...plan.items[0].contactDraftContext,
          eligibility: "HOLD" as const,
          outboundReady: false as const,
        },
        action: "REUSE_RESEARCH",
        maxCalls: 2,
        estimatedIncrementalUsd: 0.02027475,
        requiresIncrementalEstimate: true,
        reason: "Prior packet REVISE; reuse verified research for a new version.",
      },
    ],
  };
  const fetch = vi.fn(async (url: string, options?: RequestInit) => {
    expect(url).toBe("/api/sales-agent/dashboard/prepare");
    expect(options?.method).toBeUndefined();
    return {
      ok: true,
      json: async () => ({ ok: true, data: revisedPlan }),
    };
  });
  vi.stubGlobal("fetch", fetch);
  render(<PreparationPanel onRefresh={() => {}} />);
  await waitFor(() =>
    expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(false),
  );
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Prepare selected prospect" }));
  const dialog = await screen.findByRole("alertdialog", {
    name: "Confirm paid prospect preparation",
  });
  expect(dialog.textContent).toContain("Fictional Reviewer · Choice Hotels — eligibility HOLD");
  expect(dialog.textContent).toContain("2 maximum model calls (REUSE_RESEARCH)");
  expect(dialog.textContent).toContain("estimated incremental usage $0.0203");
  expect(dialog.textContent).toContain("Maximum additional estimated usage permitted");
  expect(fetch.mock.calls.filter((call) => call[1]?.method === "POST")).toHaveLength(0);
});
it("lets the operator cancel paid confirmation without submitting", async () => {
  const fetch = vi.fn(async (url: string, options?: RequestInit) => {
    expect(url).toBe("/api/sales-agent/dashboard/prepare");
    expect(options?.method).toBeUndefined();
    return {
      ok: true,
      json: async () => ({ ok: true, data: plan }),
    };
  });
  vi.stubGlobal("fetch", fetch);
  render(<PreparationPanel onRefresh={() => {}} />);
  await waitFor(() =>
    expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(false),
  );
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Prepare selected prospect" }));
  await screen.findByRole("alertdialog", { name: "Confirm paid prospect preparation" });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(
    fetch.mock.calls.filter((call) => (call[1] as RequestInit | undefined)?.method === "POST"),
  ).toHaveLength(0);
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
});
it("does not replay a failed POST and resets paid authorization", async () => {
  const fetch = vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === "POST") throw Error("Connection interrupted; inspect saved results");
    return { ok: true, json: async () => ({ ok: true, data: plan }) };
  });
  vi.stubGlobal("fetch", fetch);
  render(<PreparationPanel onRefresh={() => {}} />);
  await waitFor(() =>
    expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(false),
  );
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Prepare selected prospect" }));
  await screen.findByRole("alertdialog", { name: "Confirm paid prospect preparation" });
  fireEvent.click(screen.getByRole("button", { name: "Confirm and prepare this contact" }));
  await screen.findByRole("alert");
  await waitFor(() =>
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false),
  );
  expect(fetch.mock.calls.filter((c) => c[1]?.method === "POST")).toHaveLength(1);
  expect(screen.getByText("Outcome: BLOCKED")).not.toBeNull();
});
it("shows an authenticated paid submission rejected before persistence separately from the prior unpaid attempt", async () => {
  const priorAttempt = {
    attemptId: "11111111-1111-4111-8111-111111111111",
    companyDomain: "choicehotels.com",
    paidAuthorized: false,
    stage: "OUTREACH_CHECK" as const,
    outcome: "NOT AUTHORIZED" as const,
    submittedAt: "2026-10-21T15:07:46.847Z",
    updatedAt: "2026-10-21T15:07:46.847Z",
    failureCode: null,
    actualCalls: 0,
    actualEstimatedUsd: 0,
  };
  const savedPlan: PreparationPlan = {
    ...plan,
    maxCalls: 2,
    items: [
      {
        ...plan.items[0],
        contactId: "900000000001",
        name: "Fictional Reviewer",
        company: "Choice Hotels",
        domain: "choicehotels.com",
        action: "REUSE_RESEARCH",
        maxCalls: 2,
        estimatedIncrementalUsd: 0.02027475,
        requiresIncrementalEstimate: true,
        latestAttempt: priorAttempt,
      },
    ],
  };
  const authFailure = { ok: false, message: "Sign in to use Agent Workforce" };
  const fetch = vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === "POST")
      return { ok: false, status: 401, json: async () => authFailure };
    if (fetch.mock.calls.filter((call) => call[1]?.method === "GET" || !call[1]?.method).length > 2)
      return { ok: false, status: 401, json: async () => authFailure };
    return { ok: true, status: 200, json: async () => ({ ok: true, data: savedPlan }) };
  });
  vi.stubGlobal("fetch", fetch);
  render(<PreparationPanel onRefresh={() => {}} preferredContactId="900000000001" />);
  await waitFor(() =>
    expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(false),
  );
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Prepare selected prospect" }));
  await screen.findByRole("alertdialog", { name: "Confirm paid prospect preparation" });
  fireEvent.click(screen.getByRole("button", { name: "Confirm and prepare this contact" }));

  expect(await screen.findByText("Sign in to use Agent Workforce")).not.toBeNull();
  expect(screen.getByText("Outcome: BLOCKED")).not.toBeNull();
  expect(screen.getByText(/Paid AI authorization in submitted request: YES/)).not.toBeNull();
  expect(screen.getByRole("status", { name: "Saved preparation attempt" }).textContent).toContain(
    "Latest saved preparation: NOT AUTHORIZED",
  );
  expect(screen.getByText(/Paid AI authorized: NO · Stage: OUTREACH_CHECK/)).not.toBeNull();
  const posts = fetch.mock.calls.filter((call) => call[1]?.method === "POST");
  expect(posts).toHaveLength(1);
  expect(JSON.parse(String(posts[0][1]?.body))).toEqual({
    allowPaid: true,
    contactId: "900000000001",
  });
});
