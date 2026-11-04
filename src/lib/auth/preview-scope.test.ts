// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ client: vi.fn(), signOut: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({
  createSupabaseServerClient: mocks.client,
  getRequestOrigin: vi.fn(),
}));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.create }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
import { authCookieOptions } from "./cookie-persistence";
import { updateSession } from "@/lib/supabase/middleware";
import { POST } from "@/app/auth/signout/route";
import { continueWithGoogle, updateRecoveredPassword } from "@/app/auth/actions";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VERCEL_ENV", "preview");
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.client.mockResolvedValue({ auth: { signOut: mocks.signOut } });
});
afterEach(() => vi.unstubAllEnvs());
it("forces HTTPS host-only server cookies while preserving expiry/removal", () => {
  expect(
    authCookieOptions({
      secure: false,
      httpOnly: false,
      sameSite: "none",
      domain: ".example.invalid",
      maxAge: 0,
    }),
  ).toEqual({
    secure: true,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    domain: undefined,
    maxAge: 0,
  });
});
it("leaves Production cookie behavior unchanged", () => {
  vi.stubEnv("VERCEL_ENV", "production");
  const options = { secure: false, maxAge: 10 };
  expect(authCookieOptions(options)).toBe(options);
});
it.each([
  "/account-research",
  "/sales-agent/company-research",
  "/knowledge-library",
  "/auth/reset-password",
  "/local-login",
  "/sales-agent/recycler/extra",
])("rejects unrelated Preview page %s before auth or DB access", async (path) => {
  expect((await updateSession(new NextRequest(`https://preview.example${path}`))).status).toBe(403);
  expect(mocks.client).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});
it.each(["/", "/sales-agent"])("routes %s to protected synthetic review", async (path) => {
  const result = await updateSession(new NextRequest(`https://preview.example${path}`));
  expect(result.headers.get("location")).toBe("https://preview.example/sales-agent/recycler");
});
it("does not allow an unauthenticated Recycler request", async () => {
  const result = await updateSession(
    new NextRequest("https://preview.example/sales-agent/recycler"),
  );
  expect(result.headers.get("location")).toContain("/login?");
});
it.each(["/sales-agent/recycler", "/auth/callback", "/api/sales-agent/recycler"])(
  "keeps business POSTs blocked at %s",
  async (path) => {
    expect(
      (await updateSession(new NextRequest(`https://preview.example${path}`, { method: "POST" })))
        .status,
    ).toBe(403);
  },
);
it.each([null, "https://attacker.invalid"])(
  "rejects logout without same-origin evidence %s",
  async (origin) => {
    const result = await POST(
      new NextRequest("https://preview.example/auth/signout", {
        method: "POST",
        headers: origin ? { origin } : {},
      }),
    );
    expect(result.status).toBe(403);
    expect(mocks.client).not.toHaveBeenCalled();
  },
);
it("allows only same-origin HTTPS Preview logout and clears this session", async () => {
  const result = await POST(
    new NextRequest("https://preview.example/auth/signout", {
      method: "POST",
      headers: { origin: "https://preview.example" },
    }),
  );
  expect(result.status).toBe(303);
  expect(result.headers.get("location")).toBe("https://preview.example/login");
  expect(mocks.client).toHaveBeenCalledWith({ requireCookieWrites: true });
  expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
});
it.each(["production", "http"])("does not expose this logout path to %s", async (mode) => {
  if (mode === "production") vi.stubEnv("VERCEL_ENV", "production");
  const origin = mode === "http" ? "http://preview.example" : "https://preview.example";
  expect(
    (await POST(new NextRequest(`${origin}/auth/signout`, { method: "POST", headers: { origin } })))
      .status,
  ).toBe(403);
  expect(mocks.client).not.toHaveBeenCalled();
});
it("does not claim logout succeeded on Auth failure", async () => {
  mocks.signOut.mockResolvedValue({ error: { message: "private" } });
  const result = await POST(
    new NextRequest("https://preview.example/auth/signout", {
      method: "POST",
      headers: { origin: "https://preview.example" },
    }),
  );
  expect(result.status).toBe(503);
  expect(await result.text()).not.toContain("private");
});
it("sanitizes thrown logout transport errors", async () => {
  mocks.signOut.mockRejectedValue(new Error("private upstream detail"));
  const result = await POST(
    new NextRequest("https://preview.example/auth/signout", {
      method: "POST",
      headers: { origin: "https://preview.example" },
    }),
  );
  expect(result.status).toBe(503);
  expect(await result.text()).toBe("");
});
it("blocks Google initiation before network and keeps password changes operator-controlled", async () => {
  const network = vi.fn();
  vi.stubGlobal("fetch", network);
  try {
    await expect(continueWithGoogle(new FormData())).rejects.toThrow(
      "REDIRECT:/login?error=access_denied",
    );
    expect((await updateRecoveredPassword({ ok: false, message: "" }, new FormData())).ok).toBe(
      false,
    );
    expect(mocks.client).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});
