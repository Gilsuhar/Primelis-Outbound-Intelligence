import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSupabaseAuthConfig } from "@/lib/auth/env";
import { resolveApplicationUser } from "@/lib/auth/server";

import { GET } from "./route";

vi.mock("@/lib/auth/env", () => ({
  getSupabaseAuthConfig: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
  resolveApplicationUser: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(),
}));

const getSupabaseAuthConfigMock = vi.mocked(getSupabaseAuthConfig);
const resolveApplicationUserMock = vi.mocked(resolveApplicationUser);
const createServerClientMock = vi.mocked(createServerClient);

type MockCookieToSet = {
  name: string;
  value: string;
  options: { path: string; httpOnly?: boolean };
};

type MockCookieAdapterOptions = {
  cookies: {
    setAll: (cookies: MockCookieToSet[]) => void;
  };
};

function callbackRequest(path: string) {
  return new NextRequest(`https://preview.example${path}`);
}

function mockCodeExchange(input: {
  error?: boolean;
  user?: { id: string; email?: string | null } | null;
  userError?: boolean;
  cookies?: MockCookieToSet[];
}) {
  let exchangedCode: string | null = null;
  const signOut = vi.fn(async () => {
    return { error: null };
  });
  createServerClientMock.mockImplementation((_url, _key, options) => {
    const cookieAdapter = options as unknown as MockCookieAdapterOptions;
    return {
      auth: {
        exchangeCodeForSession: vi.fn(async (code: string) => {
          exchangedCode = code;
          cookieAdapter.cookies.setAll(input.cookies ?? []);
          return {
            data: { session: input.error ? null : { access_token: "created" } },
            error: input.error ? { message: "redacted" } : null,
          };
        }),
        getUser: vi.fn(async () => ({
          data: { user: input.user ?? { id: "auth-user-id", email: "User@Example.com" } },
          error: input.userError ? { message: "redacted" } : null,
        })),
        signOut,
      },
    } as never;
  });

  return {
    getExchangedCode: () => exchangedCode,
    signOut,
  };
}

describe("Supabase auth callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSupabaseAuthConfigMock.mockReturnValue({
      url: "https://project.supabase.co",
      anonKey: "anon-key",
    });
    resolveApplicationUserMock.mockResolvedValue({
      id: "application-user-id",
      email: "user@example.com",
      role: "SALES_USER",
    });
  });

  it("approves a Google callback, exchanges the code, and writes auth cookies to the redirect response", async () => {
    const exchange = mockCodeExchange({
      cookies: [
        {
          name: "sb-access-token",
          value: "access-cookie",
          options: { path: "/", httpOnly: true },
        },
        {
          name: "sb-refresh-token",
          value: "refresh-cookie",
          options: { path: "/", httpOnly: true },
        },
      ],
    });

    const response = await GET(callbackRequest("/auth/callback?code=valid-code"));

    expect(exchange.getExchangedCode()).toBe("valid-code");
    expect(resolveApplicationUserMock).toHaveBeenCalledWith({
      id: "auth-user-id",
      email: "user@example.com",
    });
    expect(response.headers.get("location")).toBe("https://preview.example/");
    expect(response.headers.get("set-cookie")).toContain("sb-access-token=access-cookie");
    expect(response.headers.get("set-cookie")).toContain("sb-refresh-token=refresh-cookie");
  });

  it("redirects to the requested app path after session creation", async () => {
    mockCodeExchange({});

    const response = await GET(callbackRequest("/auth/callback?code=valid-code&next=/playbook"));

    expect(response.headers.get("location")).toBe("https://preview.example/playbook");
  });

  it("returns a safe login error when the callback code is missing", async () => {
    const response = await GET(callbackRequest("/auth/callback"));

    expect(createServerClientMock).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://preview.example/login?error=callback_failed",
    );
  });

  it("returns a safe login error when the OAuth provider returns an error", async () => {
    const response = await GET(
      callbackRequest("/auth/callback?error=provider_error&error_description=secret"),
    );

    expect(createServerClientMock).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://preview.example/login?error=oauth_failed",
    );
    expect(response.headers.get("location")).not.toContain("provider_error");
    expect(response.headers.get("location")).not.toContain("secret");
  });

  it("returns a safe login error without exposing the provider error when exchange fails", async () => {
    mockCodeExchange({ error: true });

    const response = await GET(callbackRequest("/auth/callback?code=expired-code"));

    expect(response.headers.get("location")).toBe(
      "https://preview.example/login?error=callback_failed",
    );
    expect(response.headers.get("location")).not.toContain("redacted");
  });

  it("rejects an unauthorized Google account and signs out immediately", async () => {
    const exchange = mockCodeExchange({});
    resolveApplicationUserMock.mockResolvedValue(null);

    const response = await GET(callbackRequest("/auth/callback?code=valid-code"));

    expect(exchange.signOut).toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://preview.example/login?error=access_denied",
    );
  });

  it("rejects a Google account without an email and signs out immediately", async () => {
    const exchange = mockCodeExchange({ user: { id: "auth-user-id", email: null } });

    const response = await GET(callbackRequest("/auth/callback?code=valid-code"));

    expect(resolveApplicationUserMock).not.toHaveBeenCalled();
    expect(exchange.signOut).toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://preview.example/login?error=access_denied",
    );
  });

  it("makes callback cookies visible as cookies on the next server request", async () => {
    mockCodeExchange({
      cookies: [
        {
          name: "sb-access-token",
          value: "access-cookie",
          options: { path: "/", httpOnly: true },
        },
      ],
    });

    const response = await GET(callbackRequest("/auth/callback?code=valid-code"));
    const nextRequest = new NextRequest("https://preview.example/", {
      headers: {
        cookie: response.cookies
          .getAll()
          .map((cookie) => `${cookie.name}=${cookie.value}`)
          .join("; "),
      },
    });

    expect(nextRequest.cookies.get("sb-access-token")?.value).toBe("access-cookie");
  });
});
