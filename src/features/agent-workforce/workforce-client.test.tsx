import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkforceClient } from "./workforce-client";
import { WorkforceOrchestrator } from "@/server/agent-workforce/orchestrator";
import {
  testKnowledge,
  testNow,
  testReader,
  workforceIntake,
  MemoryWorkforceStore,
  MockWorkforceModel,
} from "@/test/workforce-fixtures";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function completed() {
  const engine = new WorkforceOrchestrator({
    store: new MemoryWorkforceStore(),
    model: new MockWorkforceModel(),
    knowledge: async () => testKnowledge,
    reader: testReader(),
    eligibility: async () => ({
      status: "READY",
      blockDrafting: false,
      reasons: ["Verified fictional test evidence"],
    }),
    now: () => testNow,
  });
  let run = await engine.start("actor", {
    idempotencyKey: "test-ui-request-0001",
    intake: workforceIntake,
  });
  while (run.status === "RUNNING") run = await engine.advance("actor", run.id);
  return run;
}
function fill() {
  for (const [label, value] of [
    ["Company name", "Test Company"],
    ["Company domain (no https://)", "example.com"],
    ["Prospect name", "Test Person"],
    ["Prospect title", "Head of Paid Search"],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
describe("minimal real-agent intake and human review", () => {
  it("never substitutes demo research when provider/storage configuration is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ ok: false, message: "Database/provider unavailable" }),
      }),
    );
    render(<WorkforceClient />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Start research" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Database/provider unavailable",
    );
    expect(
      screen.queryByText("Test Company sells outdoor equipment through its online store."),
    ).toBeNull();
  });
  it("shows source links, strategy, all four editable drafts, eligible contact and automated review", async () => {
    const run = await completed();
    const fetcher = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => ({
      ok: true,
      json: async () => (init?.method === "POST" ? { ok: true, run } : { ok: true, runs: [] }),
    }));
    vi.stubGlobal("fetch", fetcher);
    render(<WorkforceClient initialIntake={{ ...workforceIntake, hubspotRecordId: "42" }} />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Start research" }));
    await screen.findByText("Four original drafts — pending human approval");
    for (let i = 1; i <= 4; i++) expect(screen.getByLabelText(`Body ${i}`)).toBeTruthy();
    expect(screen.getByText(/Contact eligibility:/).textContent).toContain("READY");
    expect(screen.getAllByRole("link").length).toBeGreaterThan(0);
    expect(screen.getByText("Automated quality review: PASS")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /send|enroll/i })).toBeNull();
    const sent = JSON.parse(
      fetcher.mock.calls.find(([, init]) => init?.method === "POST")![1].body,
    );
    expect(sent.intake.companyDomain).toBe("example.com");
    expect(sent.intake.hubspotRecordId).toBe("42");
    expect(sent).not.toHaveProperty("actorId");
  });
  it("saves edits as unapproved content for a fresh quality check", async () => {
    const run = await completed();
    const fetcher = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => ({
      ok: true,
      json: async () =>
        init?.method === "PATCH"
          ? { ok: true, run: { ...run, status: "GENERATION_FAILED", issues: ["Needs review"] } }
          : init?.method === "POST"
            ? { ok: true, run }
            : { ok: true, runs: [] },
    }));
    vi.stubGlobal("fetch", fetcher);
    render(<WorkforceClient />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Start research" }));
    await screen.findByLabelText("Body 1");
    fireEvent.change(screen.getByLabelText("Body 1"), {
      target: { value: "A reviewer edit requiring source checks." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save edits and recheck" }));
    await waitFor(() =>
      expect(fetcher.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true),
    );
    const body = JSON.parse(
      fetcher.mock.calls.find(([, init]) => init?.method === "PATCH")![1].body,
    );
    expect(body.action).toBe("EDIT");
    expect(body.expectedVersion).toBe(run.version);
    expect(body.messages[0].body).toBe("A reviewer edit requiring source checks.");
    expect(body).not.toHaveProperty("approved");
  });
});
