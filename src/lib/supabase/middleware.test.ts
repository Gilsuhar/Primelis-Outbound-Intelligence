import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSupabaseAuthConfig } from "@/lib/auth/env";

import { updateSession } from "./middleware";

vi.mock("@/lib/auth/env", () => ({
  getSupabaseAuthConfig: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(),
}));

const getSupabaseAuthConfigMock = vi.mocked(getSupabaseAuthConfig);
const createServerClientMock = vi.mocked(createServerClient);

type MockCookieAdapterOptions = {
  cookies: {
    setAll: (
      cookies: Array<{
        name: string;
        value: string;
        options: { path: string; httpOnly?: boolean };
      }>,
    ) => void;
  };
};

function request(path: string, cookie?: string) {
  const url = new URL(`https://preview.example${path}`) as URL & { clone: () => URL };
  url.clone = () => {
    const cloned = new URL(url.toString()) as URL & { clone: () => URL };
    cloned.clone = url.clone;
    return cloned;
  };
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  const cookieJar = new Map<string, string>();
  if (cookie) {
    cookie.split(";").forEach((part) => {
      const [name, value] = part.trim().split("=");
      if (name && value) cookieJar.set(name, value);
    });
  }

  return {
    headers,
    nextUrl: url,
    cookies: {
      getAll() {
        return Array.from(cookieJar.entries()).map(([name, value]) => ({ name, value }));
      },
      set(name: string, value: string) {
        cookieJar.set(name, value);
      },
    },
  } as unknown as NextRequest;
}

function mockSupabaseUser(user: { id: string; email: string } | null) {
  createServerClientMock.mockImplementation((_url, _key, options) => {
    const cookieAdapter = options as unknown as MockCookieAdapterOptions;
    cookieAdapter.cookies.setAll([
      {
        name: "sb-access-token",
        value: "refreshed-cookie",
        options: { path: "/", httpOnly: true },
      },
    ]);

    return {
      auth: {
        getClaims: vi.fn(async () => ({
          data: { claims: user ? { sub: user.id, email: user.email } : null },
          error: user ? null : { message: "not authenticated" },
        })),
      },
    } as never;
  });
}

describe("Supabase middleware session refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSupabaseAuthConfigMock.mockReturnValue({
      url: "https://project.supabase.co",
      anonKey: "anon-key",
    });
  });

  it("lets an authenticated linked user continue to the app root", async () => {
    mockSupabaseUser({ id: "auth-user-id", email: "user@example.com" });

    const response = await updateSession(request("/", "sb-project-auth-token=callback-cookie"));

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("set-cookie")).toContain("sb-access-token=refreshed-cookie");
  });

  it("does not call Supabase for public login routes", async () => {
    mockSupabaseUser({ id: "auth-user-id", email: "user@example.com" });

    const response = await updateSession(
      request("/login", "sb-project-auth-token=callback-cookie"),
    );

    expect(response.headers.get("location")).toBeNull();
    expect(createServerClientMock).not.toHaveBeenCalled();
  });

  it("redirects protected requests without auth cookies before calling Supabase", async () => {
    mockSupabaseUser(null);

    const response = await updateSession(request("/reply-to-prospect"));

    expect(response.headers.get("location")).toBe(
      "https://preview.example/login?next=%2Freply-to-prospect",
    );
    expect(createServerClientMock).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated protected requests to login", async () => {
    mockSupabaseUser(null);

    const response = await updateSession(
      request("/reply-to-prospect", "sb-project-auth-token=stale-cookie"),
    );

    expect(response.headers.get("location")).toBe(
      "https://preview.example/login?next=%2Freply-to-prospect",
    );
  });

  it("redirects protected requests when the Supabase auth check times out", async () => {
    vi.useFakeTimers();
    createServerClientMock.mockReturnValue({
      auth: {
        getClaims: vi.fn(() => new Promise(() => {})),
      },
    } as never);

    const responsePromise = updateSession(
      request("/reply-to-prospect", "sb-project-auth-token=callback-cookie"),
    );

    await vi.advanceTimersByTimeAsync(1500);
    const response = await responsePromise;

    expect(response.headers.get("location")).toBe(
      "https://preview.example/login?next=%2Freply-to-prospect",
    );
    vi.useRealTimers();
  });
});

it.each(["daily", "integrations", "prospect-research"])(
  "lets only the exact %s POST worker reach its bearer authentication",
  async (kind) => {
    getSupabaseAuthConfigMock.mockReturnValue(null);
    createServerClientMock.mockClear();
    const input = request(`/api/sales-agent/${kind}/worker`);
    Object.assign(input, { method: "POST" });
    const response = await updateSession(input);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
    expect(createServerClientMock).not.toHaveBeenCalled();
  },
);
it.each([
  "/api/sales-agent/daily/worker/extra",
  "/api/sales-agent/daily/worker",
  "/api/sales-agent/daily",
])("does not grant session-free access to %s GET", async (path) => {
  getSupabaseAuthConfigMock.mockReturnValue(null);
  const response = await updateSession(request(path));
  expect(response.status).toBe(401);
  expect(response.headers.get("location")).toBeNull();
  expect(response.headers.get("cache-control")).toContain("no-store");
});
it("fails closed with JSON when Supabase verification rejects rather than redirecting an API to HTML", async () => {
  getSupabaseAuthConfigMock.mockReturnValue({
    url: "https://project.supabase.co",
    anonKey: "fictional",
  });
  createServerClientMock.mockReturnValue({
    auth: {
      getClaims: vi.fn(async () => {
        throw new Error("sensitive upstream detail");
      }),
    },
  } as never);
  const response = await updateSession(
    request("/api/sales-agent/daily", "sb-project-auth-token=fictional"),
  );
  expect(response.status).toBe(401);
  expect(await response.text()).not.toContain("sensitive");
});
