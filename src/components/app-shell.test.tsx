import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "./app-shell";

const route = vi.hoisted(() => ({ pathname: "/build-sequence" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));

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

  it("offers a direct mobile link outside the collapsed menu and separates legacy tools", () => {
    const { container } = render(
      <AppShell viewer={{ email: "navigation-test@example.invalid", role: "SALES_USER" }}>
        <div>Workspace</div>
      </AppShell>,
    );
    const direct = screen.getByRole("link", { name: "Open Agent Workforce" });
    expect(direct.getAttribute("href")).toBe("/sales-agent");
    expect(direct.closest("details")).toBeNull();
    expect(direct.className).toContain("min-h-11");
    expect(direct.className).not.toContain("lg:hidden");
    const menu = container.querySelector("details")!;
    menu.open = true;
    expect(within(menu).getByRole("link", { name: "Agent Workforce" }).getAttribute("href")).toBe(
      "/sales-agent",
    );
    expect(within(menu).getByRole("navigation", { name: "Legacy Signal tools" })).toBeTruthy();
    expect(within(menu).getByRole("link", { name: "Agent Workforce" }).textContent).toContain("New");
    expect(within(menu).getByRole("link", { name: "Build Sequence" }).getAttribute("href")).toBe(
      "/build-sequence",
    );
  });

  it("highlights Agent Workforce for an authenticated viewer on its route", () => {
    route.pathname = "/sales-agent";
    render(
      <AppShell viewer={{ email: "navigation-test@example.invalid", role: "KNOWLEDGE_ADMIN" }}>
        <div>Agent review</div>
      </AppShell>,
    );
    expect(
      screen
        .getAllByRole("link", { current: "page" })
        .every((link) => link.getAttribute("href") === "/sales-agent"),
    ).toBe(true);
    route.pathname = "/build-sequence";
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
