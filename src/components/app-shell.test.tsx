import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "./app-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/build-sequence",
}));

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string; priority?: boolean }) => <span aria-label={alt} role="img" />,
}));

vi.mock("@/app/auth/actions", () => ({
  signOutAction: vi.fn(),
}));

(globalThis as typeof globalThis & { React: typeof React }).React = React;

describe("AppShell responsive navigation", () => {
  it("keeps user context and sign out available in the mobile menu", () => {
    render(
      <AppShell viewer={{ email: "gil@primelis.com", role: "SALES_USER" }}>
        <div>Workspace</div>
      </AppShell>,
    );

    expect(screen.getByText("Menu")).toBeTruthy();
    expect(screen.getAllByText("gil@primelis.com").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByLabelText("Sign out").length).toBeGreaterThanOrEqual(1);
  });

  it("marks the current route for assistive technology", () => {
    render(
      <AppShell viewer={{ email: "gil@primelis.com", role: "KNOWLEDGE_ADMIN" }}>
        <div>Workspace</div>
      </AppShell>,
    );

    const activeLinks = screen.getAllByRole("link", { current: "page" });
    expect(activeLinks.some((link) => link.getAttribute("href") === "/build-sequence")).toBe(true);
  });
});
