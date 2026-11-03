import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProspectResearchPanel } from "./prospect-research-panel";
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
  const dashboard = await getWorkforceDashboard("actor", {
    evidence,
    runs: new MemoryWorkforceStore(),
    now: () => collectionNow,
  });
  return dashboard.prospects[0];
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("operational research panel", () => {
  it("starts research using only the stable CRM ID and refreshes the existing workspace", async () => {
    const prospect = await fixture();
    const onRefresh = vi.fn();
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ ok: true, records: [{ contactId: "42", runId: "fictional-run" }] }),
    );
    vi.stubGlobal("fetch", fetcher);
    render(<ProspectResearchPanel prospect={prospect} runs={[]} onRefresh={onRefresh} />);
    expect(screen.getByText(/Research does not verify employment/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Research synced prospect" }));
    await waitFor(() => expect(onRefresh).toHaveBeenCalledOnce());
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({ contactId: "42" });
    expect(screen.queryByLabelText("Company name")).toBeNull();
  });
  it("keeps rejected contacts blocked and does not fabricate a research success", async () => {
    const prospect = await fixture();
    prospect.plan.decision.status = "REJECTED";
    render(<ProspectResearchPanel prospect={prospect} runs={[]} onRefresh={() => {}} />);
    expect(
      (screen.getByRole("button", { name: "Research synced prospect" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByText(/Not researched/)).toBeTruthy();
    expect(screen.queryByText("COMPLETE")).toBeNull();
  });
});
