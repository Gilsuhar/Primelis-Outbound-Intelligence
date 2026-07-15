import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HomeClient } from "@/features/home/home-client";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

describe("Home mobile workspace", () => {
  it("uses compact mobile tabs, swaps the selected panel, and keeps admin secondary", () => {
    render(<HomeClient showAdmin={false} />);

    const workspace = screen.getByLabelText("Mobile workspace");
    const tabs = within(workspace).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Playbook",
      "Outreach",
      "Research",
      "Sequence",
      "Reply",
      "DNC",
      "Signal Brain",
    ]);

    expect(within(workspace).getByRole("heading", { name: "Learn Signal" })).toBeTruthy();
    fireEvent.click(within(workspace).getByRole("tab", { name: "Research" }));
    expect(within(workspace).getByRole("heading", { name: "Account Research" })).toBeTruthy();
    expect(within(workspace).getByRole("link", { name: /Open/i }).getAttribute("href")).toBe(
      "/account-research",
    );
    expect(screen.queryByText("Admin shortcuts")).toBeNull();
  });
});
