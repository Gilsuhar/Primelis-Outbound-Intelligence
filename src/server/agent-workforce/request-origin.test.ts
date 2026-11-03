// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { workforceSameOrigin } from "./request-origin";
function localEnv() {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("LOCAL_DEV_LOGIN", "true");
  vi.stubEnv("LOCAL_DEV_SESSION_TOKEN", "fictional-local-origin-session-test-only");
  vi.stubEnv("DATABASE_URL", "postgresql://local@localhost:5432/agent_workforce_test");
  for (const n of ["VERCEL", "VERCEL_ENV", "NEXT_PUBLIC_VERCEL_ENV"]) vi.stubEnv(n, "");
}
function req(overrides: Record<string, string | null | undefined> = {}, host = "127.0.0.1:3000") {
  const headers = new Headers({
    host,
    origin: `http://${host}`,
    "x-forwarded-host": host,
    "x-forwarded-proto": "http",
    "x-forwarded-port": "3000",
  });
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null || value === undefined) headers.delete(key);
    else headers.set(key, value);
  }
  return new NextRequest(`http://${host}/api/sales-agent/prospect-research`, {
    method: "POST",
    headers,
  });
}
beforeEach(localEnv);
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe("Next loopback origin normalization", () => {
  it("requires HTTPS, matching browser origin and forwarding in opt-in TLS mode", () => {
    vi.stubEnv("LOCAL_DEV_HTTPS", "true");
    const make = (origin = "https://127.0.0.1:3000", proto = "https") =>
      new NextRequest("https://127.0.0.1:3000/api/outreach/oauth", {
        method: "POST",
        headers: {
          host: "127.0.0.1:3000",
          origin,
          "x-forwarded-proto": proto,
          "x-forwarded-port": "3000",
        },
      });
    expect(workforceSameOrigin(make())).toBe(true);
    expect(workforceSameOrigin(make("https://localhost:3000"))).toBe(false);
    expect(workforceSameOrigin(make("https://127.0.0.1:3000", "http"))).toBe(false);
    expect(workforceSameOrigin(req())).toBe(false);
  });
  it("reproduces Next's actual normalized URL and accepts matching browser Host/Origin", () => {
    const request = req();
    expect(request.url).toContain("http://localhost:3000/");
    expect(request.headers.get("origin")).toBe("http://127.0.0.1:3000");
    expect(workforceSameOrigin(request)).toBe(true);
    expect(workforceSameOrigin(req({}, "localhost:3000"))).toBe(true);
    expect(
      workforceSameOrigin(
        req({ "x-forwarded-host": null, "x-forwarded-proto": null, "x-forwarded-port": null }),
      ),
    ).toBe(true);
  });
  it.each([
    { origin: null },
    { origin: "null" },
    { origin: "http://localhost:3000" },
    { origin: "https://foreign.example" },
    { origin: "http://127.0.0.1:4000" },
    { origin: "https://127.0.0.1:3000" },
    { host: null },
    { host: "foreign.example:3000" },
    { "x-forwarded-host": "foreign.example" },
    { "x-forwarded-host": "localhost:3000" },
    { "x-forwarded-host": "127.0.0.1:3000, foreign.example" },
    { "x-forwarded-proto": "https" },
    { "x-forwarded-port": "4000" },
    { forwarded: "host=127.0.0.1:3000" },
  ])("rejects missing, cross-origin or spoofed local headers %j", (headers) => {
    expect(workforceSameOrigin(req(headers))).toBe(false);
  });
  it("cannot use local headers to authorize a remote internal URL", () => {
    const request = new Request("http://remote.example/api", {
      headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" },
    });
    expect(workforceSameOrigin(request)).toBe(false);
  });
  it.each(["VERCEL_ENV", "NEXT_PUBLIC_VERCEL_ENV", "VERCEL"])(
    "does not relax hosted deployment guard with %s set",
    (key) => {
      vi.stubEnv(key, "preview");
      expect(workforceSameOrigin(req())).toBe(false);
    },
  );
  it("does not relax production, disabled local auth, or a non-test database", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(workforceSameOrigin(req())).toBe(false);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("LOCAL_DEV_LOGIN", "false");
    expect(workforceSameOrigin(req())).toBe(false);
    vi.stubEnv("LOCAL_DEV_LOGIN", "true");
    vi.stubEnv("DATABASE_URL", "postgresql://local@localhost:5432/postgres");
    expect(workforceSameOrigin(req())).toBe(false);
  });
  it("preserves hosted same-origin behavior without trusting forwarded hosts", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(
      workforceSameOrigin(
        new Request("https://preview.example/api", {
          headers: { origin: "https://preview.example" },
        }),
      ),
    ).toBe(true);
    expect(
      workforceSameOrigin(
        new Request("https://preview.example/api", {
          headers: {
            origin: "https://foreign.example",
            host: "foreign.example",
            "x-forwarded-host": "foreign.example",
          },
        }),
      ),
    ).toBe(false);
    expect(workforceSameOrigin(new Request("https://preview.example/api"))).toBe(false);
  });
  it("diagnostics omit credentials, bodies, URL paths, query strings and arbitrary header values", () => {
    vi.stubEnv("LOCAL_DEV_ORIGIN_DIAGNOSTICS", "true");
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const request = new Request("http://localhost:3000/private-path?secret=query-sentinel", {
      method: "POST",
      headers: {
        host: "127.0.0.1:3000",
        origin: "https://origin-sentinel.example",
        "x-forwarded-host": "forwarded-sentinel",
        cookie: "cookie-sentinel",
        authorization: "Bearer auth-sentinel",
      },
      body: "body-sentinel",
    });
    expect(workforceSameOrigin(request)).toBe(false);
    const output = JSON.stringify(log.mock.calls);
    for (const value of [
      "private-path",
      "query-sentinel",
      "origin-sentinel",
      "forwarded-sentinel",
      "cookie-sentinel",
      "auth-sentinel",
      "body-sentinel",
    ])
      expect(output).not.toContain(value);
    expect(log).toHaveBeenCalledOnce();
    log.mockClear();
    vi.stubEnv("VERCEL_ENV", "preview");
    workforceSameOrigin(request);
    expect(log).not.toHaveBeenCalled();
  });
});
