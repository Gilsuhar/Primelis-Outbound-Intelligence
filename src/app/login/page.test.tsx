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
afterEach(cleanup);
describe("visible authentication failures", () => {
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
