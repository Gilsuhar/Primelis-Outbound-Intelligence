import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { continueWithGoogle } from "@/app/auth/actions";
import { getSupabaseAuthConfig } from "@/lib/auth/env";
import { createSupabaseServerClient, getRequestOrigin } from "@/lib/auth/server";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/auth/env", () => ({
  getSupabaseAuthConfig: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
  createSupabaseServerClient: vi.fn(),
  getRequestOrigin: vi.fn(),
}));

const redirectMock = vi.mocked(redirect);
const getSupabaseAuthConfigMock = vi.mocked(getSupabaseAuthConfig);
const createSupabaseServerClientMock = vi.mocked(createSupabaseServerClient);
const getRequestOriginMock = vi.mocked(getRequestOrigin);

function formData(next?: string) {
  const data = new FormData();
  if (next) data.set("next", next);
  return data;
}

function mockSupabaseOAuth(input: { error?: boolean; providerUrl?: string }) {
  const signInWithOAuth = vi.fn(async () => ({
    data: { url: input.providerUrl ?? "https://accounts.google.example/oauth" },
    error: input.error ? { message: "redacted" } : null,
  }));
  createSupabaseServerClientMock.mockImplementation(async (options) => {
    options?.onPkceVerifierPersisted?.();
    return {
      auth: { signInWithOAuth },
    } as never;
  });
  return { signInWithOAuth };
}

describe("Google OAuth login action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSupabaseAuthConfigMock.mockReturnValue({
      url: "https://project.supabase.co",
      anonKey: "anon-key",
    });
    getRequestOriginMock.mockResolvedValue("https://preview.example");
  });

  it("starts Google sign-in with the existing PKCE callback route", async () => {
    const { signInWithOAuth } = mockSupabaseOAuth({});

    await expect(continueWithGoogle(formData())).rejects.toThrow(
      "NEXT_REDIRECT:https://accounts.google.example/oauth",
    );

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "https://preview.example/auth/callback",
      },
    });
    expect(createSupabaseServerClientMock).toHaveBeenCalledWith(
      expect.objectContaining({ requireCookieWrites: true }),
    );
  });

  it("preserves only a safe internal intended destination", async () => {
    const { signInWithOAuth } = mockSupabaseOAuth({});

    await expect(continueWithGoogle(formData("/reply-to-prospect?draft=1"))).rejects.toThrow(
      "NEXT_REDIRECT:https://accounts.google.example/oauth",
    );

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "https://preview.example/auth/callback?next=%2Freply-to-prospect%3Fdraft%3D1",
      },
    });
  });

  it("rejects arbitrary external redirect destinations", async () => {
    const { signInWithOAuth } = mockSupabaseOAuth({});

    await expect(continueWithGoogle(formData("https://evil.example/capture"))).rejects.toThrow(
      "NEXT_REDIRECT:https://accounts.google.example/oauth",
    );

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "https://preview.example/auth/callback",
      },
    });
  });

  it("returns a safe login error when the OAuth provider initiation fails", async () => {
    mockSupabaseOAuth({ error: true });

    await expect(continueWithGoogle(formData())).rejects.toThrow(
      "NEXT_REDIRECT:/login?error=oauth_start_failed",
    );

    expect(redirectMock).toHaveBeenCalledWith("/login?error=oauth_start_failed");
  });

  it("stops initiation when the PKCE verifier cookie cannot be persisted", async () => {
    createSupabaseServerClientMock.mockResolvedValue({
      auth: {
        signInWithOAuth: vi.fn(async () => {
          throw new Error("Required authentication cookie could not be persisted.");
        }),
      },
    } as never);

    await expect(continueWithGoogle(formData())).rejects.toThrow(
      "NEXT_REDIRECT:/login?error=oauth_start_failed",
    );
  });
});
