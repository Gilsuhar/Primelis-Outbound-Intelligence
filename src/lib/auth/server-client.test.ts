import { beforeEach, describe, expect, it, vi } from "vitest";

import { persistSupabaseCookies } from "@/lib/auth/cookie-persistence";

describe("Supabase server client cookie persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists the OAuth PKCE verifier through the Next.js cookie store", () => {
    const set = vi.fn();
    const onPkceVerifierPersisted = vi.fn();
    persistSupabaseCookies(
      { set },
      [
        {
          name: "sb-project-auth-token-code-verifier",
          value: "encoded-verifier",
          options: { httpOnly: true, path: "/", sameSite: "lax", secure: true },
        },
      ],
      { requireCookieWrites: true, onPkceVerifierPersisted },
    );

    expect(set).toHaveBeenCalledWith(
      "sb-project-auth-token-code-verifier",
      "encoded-verifier",
      expect.objectContaining({ path: "/", sameSite: "lax", secure: true }),
    );
    expect(onPkceVerifierPersisted).toHaveBeenCalledOnce();
  });

  it("fails closed when a required OAuth cookie cannot be written", () => {
    const onCookieWriteFailure = vi.fn();
    const cookieStore = {
      set: vi.fn(() => {
        throw new Error("read-only cookie store");
      }),
    };

    expect(() =>
      persistSupabaseCookies(
        cookieStore,
        [
          {
            name: "sb-project-auth-token-code-verifier",
            value: "encoded-verifier",
            options: { path: "/" },
          },
        ],
        { requireCookieWrites: true, onCookieWriteFailure },
      ),
    ).toThrow("Required authentication cookie could not be persisted.");
    expect(onCookieWriteFailure).toHaveBeenCalledOnce();
  });
});
