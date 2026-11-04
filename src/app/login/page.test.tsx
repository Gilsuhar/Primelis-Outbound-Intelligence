import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import LoginPage from "./page";
import { loginErrorMessages } from "@/lib/auth/login-errors";

vi.mock("@/lib/auth/server", () => ({
  getCurrentUser: async () => null,
  getSupabaseAuthUser: async () => null,
}));
vi.mock("@/app/auth/actions", () => ({
  signInWithPassword: vi.fn(),
  sendPasswordRecovery: vi.fn(),
  signOutAction: vi.fn(),
  continueWithGoogle: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});
describe("visible authentication failures", () => {
  it("shows only approved password login in cloud Preview", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    render(await LoginPage({}));
    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();
    expect(screen.queryByText("Forgot your password?")).toBeNull();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
  });
  it.each(Object.entries(loginErrorMessages))(
    "shows callback error %s on the actual login page",
    async (error, message) => {
      render(await LoginPage({ searchParams: Promise.resolve({ error }) }));
      expect(screen.getByRole("alert").textContent).toBe(message);
      expect(screen.getByRole("button", { name: "Continue with Google" })).toBeTruthy();
    },
  );
  it("does not reflect arbitrary query text or prototype keys", async () => {
    for (const error of ["sensitive-error-detail", "constructor", "__proto__"]) {
      const rendered = render(await LoginPage({ searchParams: Promise.resolve({ error }) }));
      expect(screen.queryByRole("alert")).toBeNull();
      expect(rendered.container.textContent).not.toContain(error);
      rendered.unmount();
    }
  });
});
