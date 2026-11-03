import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { DraftStudioPanel } from "./draft-studio-panel";
import { draftStudioSchema } from "../gate-a-contracts";
import { getWorkforceDashboard } from "@/server/agent-workforce/dashboard/service";
import { collectSalesAgentEvidence } from "@/server/services/sales-agent-collection-service";
import { WorkforceOrchestrator } from "@/server/agent-workforce/orchestrator";
import {
  MemoryEvidenceStore,
  collectedContact,
  collectionNow,
  fixtureProviders,
} from "@/test/sales-agent-collection-fixtures";
import {
  MemoryWorkforceStore,
  MockWorkforceModel,
  testKnowledge,
  testReader,
  testNow,
  workforceIntake,
} from "@/test/workforce-fixtures";
async function fixture() {
  const evidence = new MemoryEvidenceStore(),
    store = new MemoryWorkforceStore();
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
  const dashboard = await getWorkforceDashboard("actor", {
    evidence,
    runs: store,
    now: () => collectionNow,
  });
  const orchestrator = new WorkforceOrchestrator({
    store,
    model: new MockWorkforceModel(),
    knowledge: async () => testKnowledge,
    reader: testReader(),
    eligibility: async () => ({ status: "READY", reasons: [], blockDrafting: false }),
    now: () => testNow,
  });
  let run = await orchestrator.start("actor", {
    idempotencyKey: "studio-ui-fixture",
    intake: { ...workforceIntake, hubspotRecordId: "42" },
  });
  for (let i = 0; i < 8 && run.status === "RUNNING"; i++)
    run = await orchestrator.advance("actor", run.id);
  run.draftStudio = draftStudioSchema.parse({
    sourceRunId: "fictional-source",
    dependencyHash: "a".repeat(64),
    qualityDecision: "PASS",
    reviewStatus: "PENDING",
    approval: null,
    context: {
      serp: [],
      opportunity: null,
      missingInformation: ["No Similarweb or SERP data in this fictional fixture"],
      personalizationMode: "EVIDENCE_LED",
    },
    versions: [
      {
        number: 1,
        at: testNow.toISOString(),
        origin: "AI",
        contentHash: "b".repeat(64),
        messages: run.sequence!.messages,
        qualityDecision: "PASS",
        oiq: run.critic?.oiq,
      },
    ],
    events: [],
    regenerations: 0,
    failures: 0,
    nextRetryAt: null,
  });
  const prospect = dashboard.prospects[0];
  prospect.plan.decision.status = "READY";
  return { prospect, run };
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("persistent review-first studio controls", () => {
  it("shows four editable emails, source context, quality and version history", async () => {
    const { prospect, run } = await fixture();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => Response.json({ ok: true, run })),
    );
    render(<DraftStudioPanel prospect={prospect} runs={[]} />);
    await screen.findByLabelText("Email body 4");
    expect(screen.getAllByRole("textbox")).toHaveLength(8);
    expect(screen.getByText(/Draft version history · 1 versions/)).toBeTruthy();
    expect(screen.getByText(/No sending, enrollment or CRM changes/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Approve content for review" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /send|enroll/i })).toBeNull();
  });
  it("invalidates the local approval action until edits are saved and reviewed", async () => {
    const { prospect, run } = await fixture();
    const fetcher = vi.fn<typeof fetch>(async (_url, options) =>
      Response.json({
        ok: true,
        run:
          options?.method === "PATCH"
            ? {
                ...run,
                status: "RUNNING",
                draftStudio: { ...run.draftStudio, qualityDecision: null, reviewStatus: "PENDING" },
              }
            : run,
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    render(<DraftStudioPanel prospect={prospect} runs={[]} />);
    const body = await screen.findByLabelText("Email body 1");
    fireEvent.change(body, {
      target: { value: "Edited wording requiring another factual review." },
    });
    expect(
      (screen.getByRole("button", { name: "Approve content for review" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Save edits & review" }));
    await waitFor(() =>
      expect(fetcher.mock.calls.some(([, options]) => options?.method === "PATCH")).toBe(true),
    );
    const call = fetcher.mock.calls.find(([, options]) => options?.method === "PATCH")!;
    const sent = JSON.parse(String(call[1]?.body));
    expect(sent.mutation.action).toBe("EDIT");
    expect(sent.mutation.messages[0].body).toContain("Edited wording");
    expect(sent.mutation.requestKey).toBeTruthy();
  });
  it("copies only after a fresh server-side gate check", async () => {
    const { prospect, run } = await fixture();
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ ok: true, run }));
    vi.stubGlobal("fetch", fetcher);
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<DraftStudioPanel prospect={prospect} runs={[]} />);
    await screen.findByLabelText("Email body 1");
    fireEvent.click(screen.getByRole("button", { name: "Copy email 1" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(writeText.mock.calls[0][0]).toContain("Subject:");
  });
  it("shows review-only draft content and eligibility warnings when eligibility is HOLD", async () => {
    const { prospect, run } = await fixture();
    prospect.plan.decision.status = "HOLD";
    prospect.plan.decision.reasons = ["Unverified employment"];
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => Response.json({ ok: true, run })),
    );
    render(<DraftStudioPanel prospect={prospect} runs={[]} />);
    await screen.findByText("Unverified employment");
    await waitFor(() => expect(screen.getByText(/Quality review: PASS/)).toBeTruthy());
    expect(screen.queryByLabelText("Email body 1")).not.toBeNull();
    expect(
      (screen.getByRole("button", { name: "Approve content for review" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(screen.getByText(/Not send-eligible/)).toBeTruthy();
  });
});

it("shows the total, weighted components, traceable evidence and concrete OIQ suggestions", async () => {
  const { prospect, run } = await fixture();
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () => Response.json({ ok: true, run })),
  );
  render(<DraftStudioPanel prospect={prospect} runs={[]} />);
  await screen.findByLabelText("Email body 1");
  const assessment = within(screen.getAllByRole("region", { name: "Outreach Insight Quality" })[0]);
  expect(assessment.getByText(/93\/100/)).toBeTruthy();
  expect(assessment.getByText("Company-specific insight")).toBeTruthy();
  expect(assessment.getByText("Verified supporting evidence")).toBeTruthy();
  expect(assessment.getByText("Relevance to Search responsibilities")).toBeTruthy();
  expect(assessment.getByText("Commercially interesting angle")).toBeTruthy();
  expect(assessment.getByText("Natural writing and low-friction CTA")).toBeTruthy();
  expect(assessment.getByText(/not a prediction of replies or meetings/)).toBeTruthy();
  expect(assessment.getByText(/Ask about the current coverage/)).toBeTruthy();
  expect(
    assessment.getAllByRole("link").every((a) => a.getAttribute("href")?.startsWith("https://")),
  ).toBe(true);
});
it.each(["REVISE", "BLOCKED"] as const)(
  "keeps approval disabled for OIQ %s despite a stale PASS label",
  async (decision) => {
    const { prospect, run } = await fixture();
    run.critic!.oiq!.decision = decision;
    run.critic!.oiq!.weakPersonalization = true;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => Response.json({ ok: true, run })),
    );
    render(<DraftStudioPanel prospect={prospect} runs={[]} />);
    await screen.findByLabelText("Email body 1");
    expect(
      (screen.getByRole("button", { name: "Approve content for review" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.getAllByText(/Weak personalization/).length).toBeGreaterThan(0);
  },
);
