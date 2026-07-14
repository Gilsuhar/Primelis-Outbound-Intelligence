import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/ask-signal-brain/actions", () => ({
  askSignalBrainAction: vi.fn(),
}));

vi.mock("@/app/build-sequence/actions", () => ({
  generateBuildSequenceAction: vi.fn(),
}));

vi.mock("@/app/create-outreach/actions", () => ({
  generateCreateOutreachAction: vi.fn(),
}));

vi.mock("@/app/reply-to-prospect/actions", () => ({
  generateReplyToProspectAction: vi.fn(),
}));

vi.mock("@/lib/auth/action-actor", () => ({
  withAuthenticatedCreator: vi.fn(),
  withAuthenticatedReviewActor: vi.fn(),
}));

vi.mock("server-only", () => ({}));

import { AskSignalBrainClient } from "@/features/ask-signal-brain/ask-signal-brain-client";
import { BuildSequenceClient } from "@/features/build-sequence/build-sequence-client";
import { CreateOutreachClient } from "@/features/create-outreach/create-outreach-client";
import { ReplyToProspectClient } from "@/features/reply-to-prospect/reply-to-prospect-client";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

describe("Sales workflow UI", () => {
  it("keeps Create Outreach focused on a quick brief", () => {
    render(<CreateOutreachClient />);

    expect(screen.getByRole("heading", { name: "Quick brief" })).toBeTruthy();
    expect(screen.getByText("Company")).toBeTruthy();
    expect(screen.getByText("Buyer role")).toBeTruthy();
    expect(screen.getByText("Fit / ICP")).toBeTruthy();
    expect(screen.getByText("Industry")).toBeTruthy();
    expect(screen.getByText("Reason for outreach")).toBeTruthy();
    expect(screen.getByText("Tone")).toBeTruthy();
    expect(screen.getByText("Email length")).toBeTruthy();
    expect(screen.getByText("Advanced optional details").closest("details")?.open).toBe(false);
  });

  it("keeps Build Sequence focused on dropdown-first inputs", () => {
    render(<BuildSequenceClient />);

    expect(screen.getByRole("heading", { name: "Quick brief" })).toBeTruthy();
    expect(screen.getByText("Company")).toBeTruthy();
    expect(screen.getByText("Buyer role")).toBeTruthy();
    expect(screen.getByText("Fit / ICP")).toBeTruthy();
    expect(screen.getByText("Industry")).toBeTruthy();
    expect(screen.getByText("Reason for outreach")).toBeTruthy();
    expect(screen.getByText("Steps")).toBeTruthy();
    expect(screen.getByText("Tone")).toBeTruthy();
    expect(screen.getByText("Duration")).toBeTruthy();
    expect(screen.getByText("Advanced optional details").closest("details")?.open).toBe(false);
  });

  it("keeps Reply and Brain advanced context closed by default", () => {
    render(<ReplyToProspectClient />);
    expect(screen.getByRole("heading", { name: "Quick reply brief" })).toBeTruthy();
    expect(screen.getByText("Advanced optional context").closest("details")?.open).toBe(false);

    render(<AskSignalBrainClient />);
    expect(screen.getByRole("heading", { name: "Quick question" })).toBeTruthy();
    expect(screen.getByText("Advanced account context").closest("details")?.open).toBe(false);
  });
});
