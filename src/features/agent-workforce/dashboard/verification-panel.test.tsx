import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { VerificationPanel } from "./verification-panel";
import { reviewEvidenceSnapshot } from "@/server/services/sales-agent-collection-service";
import {
  collectedContact,
  collectionNow,
  verifiedObservations,
} from "@/test/sales-agent-collection-fixtures";
import type { DashboardProspect } from "./contracts";
import { verificationIdentity } from "@/features/sales-agent/verification/contracts";
const prospect = (): DashboardProspect => ({
  ...reviewEvidenceSnapshot(
    {
      version: 1,
      contact: collectedContact,
      observations: verifiedObservations.filter((item) => item.field !== "complained"),
      blockers: [],
      providers: [],
      collectedAt: collectionNow.toISOString(),
    },
    collectionNow,
  ),
  review: null,
  runIds: [],
  draftReady: false,
  draftRunId: null,
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("existing prospect workspace verification controls", () => {
  it("shows actual UNKNOWN/HOLD gates and traceable provider timestamps without inventing verification", () => {
    render(<VerificationPanel prospect={prospect()} />);
    expect(screen.getByRole("heading", { name: "Evidence verification · HOLD" })).toBeTruthy();
    expect(screen.getByText("Spam complaint")).toBeTruthy();
    expect(screen.getByText(/UNRESOLVED PROVIDER/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Business email: UNKNOWN" })).toBeTruthy();
  });
  it("sends only an explicit identity-scoped retry action and reports a real unavailable provider", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        ok: true,
        data: { started: true, message: "No authorized provider configured; UNKNOWN" },
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    render(<VerificationPanel prospect={prospect()} />);
    fireEvent.click(screen.getByRole("button", { name: "Retry email verification" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("UNKNOWN"));
    const args = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(args[0]).toBe("/api/sales-agent/verification");
    expect(JSON.parse(String(args[1].body))).toMatchObject({ contactId: "42", kind: "EMAIL" });
    expect(Object.keys(JSON.parse(String(args[1].body))).sort()).toEqual([
      "contactId",
      "kind",
      "requestKey",
    ]);
  });
  it("allows recovery of an expired verification lease rather than displaying success", () => {
    const p = prospect();
    p.verification.EMAIL = {
      requestKey: "expired-fixture",
      identity: verificationIdentity(collectedContact),
      providerId: "fictional",
      state: "RUNNING",
      startedAt: "2026-10-15T08:00:00Z",
      leaseUntil: "2026-10-15T08:02:00Z",
      nextRetryAt: "2026-10-15T08:01:00Z",
      attempts: 1,
      message: "Interrupted request",
    };
    render(<VerificationPanel prospect={p} />);
    expect(screen.getByRole("heading", { name: "Business email: UNKNOWN" })).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Retry email verification" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
});
