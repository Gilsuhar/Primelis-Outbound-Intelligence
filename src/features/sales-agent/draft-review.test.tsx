import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DraftReview } from "./draft-review";
import { createDemoFixtures, DEMO_TIME } from "./demo-fixtures";
import { reviewEvidenceSnapshot } from "@/server/services/sales-agent-collection-service";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const row = () => reviewEvidenceSnapshot(createDemoFixtures()[0].snapshot, new Date(DEMO_TIME));
describe("draft review controls", () => {
  it("shows all four drafts and copies one with an explicit fictional and unapproved label", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<DraftReview row={row()} demo onSaved={async () => {}} />);
    for (let step = 1; step <= 4; step++)
      expect(screen.getByRole("button", { name: `Copy email ${step} for review` })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy email 2 for review" }));
    await screen.findByText("Email 2 copied for review.");
    expect(writeText.mock.calls[0][0]).toContain("FICTIONAL TEST DATA");
    expect(writeText.mock.calls[0][0]).toContain("NOT APPROVED");
    expect(writeText.mock.calls[0][0]).toContain("Subject: Re:");
    expect(screen.queryByText("Save local research")).toBeNull();
  });
  it("disables copying incomplete research placeholders and offers a clipboard fallback", async () => {
    const snapshot = createDemoFixtures()[0].snapshot;
    snapshot.research = [];
    render(
      <DraftReview
        row={reviewEvidenceSnapshot(snapshot, new Date(DEMO_TIME))}
        demo
        onSaved={async () => {}}
      />,
    );
    expect(
      (screen.getByRole("button", { name: "Copy email 2 for review" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Copy email 4 for review" }));
    await screen.findByText(/Clipboard unavailable/);
  });
  it("submits only manual research and never clearance or approval of a sequence", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetcher);
    const onSaved = vi.fn().mockResolvedValue(undefined);
    const view = render(<DraftReview row={row()} demo={false} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("HTTPS source URL"), {
      target: { value: "https://example.com/fact" },
    });
    fireEvent.change(screen.getByLabelText("Verified email-ready wording"), {
      target: { value: "A source-backed fictional business fact for testing." },
    });
    fireEvent.change(screen.getByLabelText("Observation time (ISO 8601 with timezone)"), {
      target: { value: DEMO_TIME },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.submit(view.container.querySelector("form")!);
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(fetcher.mock.calls[0][0]).toBe("/api/sales-agent/research");
    const payload = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(payload).toMatchObject({
      kind: "COMPANY_FACT",
      manuallyVerified: true,
      approvedForOutbound: false,
    });
    expect(payload).not.toHaveProperty("unsubscribed");
    expect(payload).not.toHaveProperty("canSend");
  });
});
