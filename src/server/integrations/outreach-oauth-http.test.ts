// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { localDevelopmentUser } from "@/lib/auth/local-development";
import { outreachChromeFixture } from "@/test/outreach-oauth-chrome";
import {
  connectionPage,
  startConnection,
  callbackPage,
  finishConnection,
} from "./outreach-oauth-http";
import { localOutreachAuthorization, outreachCookie } from "./outreach-oauth";
import {
  OAuthStageError,
  recordOAuthFailure,
  readOAuthFailure,
} from "./outreach-oauth-diagnostics";
vi.mock("./outreach-oauth-diagnostics", async (original) => {
  const actual = await original<typeof import("./outreach-oauth-diagnostics")>();
  return {
    ...actual,
    recordOAuthFailure: vi.fn(actual.oauthDiagnostic),
    readOAuthFailure: vi.fn(() => null),
  };
});
const mocks = vi.hoisted(() => ({ user: vi.fn(), vault: vi.fn(), get: vi.fn(), change: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ getCurrentUser: mocks.user }));
vi.mock("./local-outreach-vault", async (original) => ({
  ...(await original<typeof import("./local-outreach-vault")>()),
  localOutreachVault: mocks.vault,
}));
vi.mock("./store", async (original) => ({
  ...(await original<typeof import("./store")>()),
  PrismaIntegrationStore: class {
    get = mocks.get;
    change = mocks.change;
  },
}));
const session = "fictional-session-for-oauth-http-test-only";
const config = {
  version: 1 as const,
  actor: localDevelopmentUser.id,
  clientId: "fictional-client",
  clientSecret: "fictional-secret",
  encryptionKey: Buffer.alloc(32, 4).toString("base64"),
};
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("LOCAL_DEV_LOGIN", "true");
  vi.stubEnv("LOCAL_DEV_HTTPS", "true");
  vi.stubEnv("LOCAL_OUTREACH_OAUTH_ENABLED", "true");
  vi.stubEnv("LOCAL_DEV_SESSION_TOKEN", session);
  vi.stubEnv("DATABASE_URL", "postgresql://local@localhost:5432/agent_workforce_test");
  vi.stubEnv("INTEGRATION_OPERATOR_USER_ID", config.actor);
  for (const name of [
    "VERCEL",
    "VERCEL_ENV",
    "NEXT_PUBLIC_VERCEL_ENV",
    "COMPANY_PILOT_ENABLED",
    "NODE_TLS_REJECT_UNAUTHORIZED",
  ])
    vi.stubEnv(name, "");
  mocks.user.mockResolvedValue(localDevelopmentUser);
  mocks.vault.mockResolvedValue(config);
  mocks.get.mockResolvedValue({ state: { status: "NOT_CONNECTED" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("NO_LIVE_NETWORK");
    }),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
function request(path = "", body?: string, headers: Record<string, string> = {}) {
  return new NextRequest(`https://127.0.0.1:3000/api/outreach/oauth${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      host: "127.0.0.1:3000",
      origin: "https://127.0.0.1:3000",
      "content-type": "application/x-www-form-urlencoded",
      ...headers,
    },
    body,
  });
}
it("renders a masked one-time secret field, never existing stored secrets", async () => {
  mocks.vault.mockResolvedValueOnce(null);
  expect(await (await connectionPage(request())).text()).toContain('type="password"');
  const response = await connectionPage(request());
  const body = await response.text();
  expect(body).not.toContain(config.clientSecret);
  expect(body).not.toContain(config.encryptionKey);
  expect(body).toContain("HOLD");
  expect(body).toContain('form method="post" action="/api/outreach/oauth"');
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("referrer-policy")).toBe("strict-origin");
});
it("uses strict-origin on the new-configuration form as well as the saved-configuration form", async () => {
  mocks.vault.mockResolvedValueOnce(null);
  const response = await connectionPage(request());
  expect(response.headers.get("referrer-policy")).toBe("strict-origin");
  expect(response.headers.get("content-security-policy")).toContain("form-action 'self'");
});
it.each([
  undefined,
  "null",
  "",
  "http://127.0.0.1:3000",
  "https://localhost:3000",
  "https://127.0.0.1:4000",
  "https://foreign.example",
])("rejects missing, opaque or mismatched origins on both POST endpoints: %s", async (origin) => {
  for (const [path, handler] of [
    ["", startConnection],
    ["/callback", finishConnection],
  ] as const) {
    const req = request(path, "confirm=yes&code=fictional-code&state=fictional-state");
    if (origin === undefined) req.headers.delete("origin");
    else req.headers.set("origin", origin);
    const response = await handler(req);
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("ORIGIN_DENIED");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  }
  expect(mocks.vault).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(mocks.change).not.toHaveBeenCalled();
});
it("keeps the successful completion redirect at no-referrer", async () => {
  vi.spyOn(localOutreachAuthorization, "finish").mockResolvedValueOnce(undefined);
  const response = await finishConnection(
    request("/callback", "code=fictional-code&state=fictional-state"),
  );
  expect(response.status).toBe(303);
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("location")).toBe("https://127.0.0.1:3000/api/outreach/oauth");
});
it("displays callback diagnostics only after local authentication, without reading credentials", async () => {
  vi.mocked(readOAuthFailure).mockReturnValueOnce({
    stage: "STATE_VALIDATION",
    code: "OAUTH_STATE_INVALID",
  });
  const response = await connectionPage(request("?connection=failed"));
  expect(await response.text()).toContain("OAUTH_STATE_INVALID");
  expect(mocks.vault).not.toHaveBeenCalled();
});
it("identifies invalid credential registration without exposing submitted values", async () => {
  mocks.vault.mockResolvedValueOnce(null);
  const body = await (
    await startConnection(
      request("", "confirm=yes&clientId=bad%20id&clientSecret=private-secret-value"),
    )
  ).text();
  expect(body).toContain("CREDENTIAL_VALIDATION");
  expect(body).toContain("INVALID_CLIENT_ID_FORMAT");
  expect(body).not.toContain("private-secret-value");
  expect(mocks.vault).toHaveBeenCalledTimes(1);
  expect(fetch).not.toHaveBeenCalled();
});
it.each([
  [undefined, "fictional-secret", "INVALID_CLIENT_ID_FORMAT"],
  [" bad-id-with-space ", "fictional-secret", "INVALID_CLIENT_ID_FORMAT"],
  ["fictional-client", undefined, "INVALID_CLIENT_SECRET_FORMAT"],
  ["fictional-client", "short", "INVALID_CLIENT_SECRET_FORMAT"],
  ["fictional-client", "x".repeat(2049), "INVALID_CLIENT_SECRET_FORMAT"],
  ["bad id", "short", "INVALID_CLIENT_ID_AND_SECRET_FORMAT"],
] as const)(
  "reports only the failing credential field(s): %s / masked",
  async (clientId, clientSecret, code) => {
    mocks.vault.mockResolvedValueOnce(null);
    const begin = vi.spyOn(localOutreachAuthorization, "begin");
    const form = new URLSearchParams({ confirm: "yes" });
    if (clientId !== undefined) form.set("clientId", clientId);
    if (clientSecret !== undefined) form.set("clientSecret", clientSecret);
    const response = await startConnection(request("", form.toString()));
    const body = await response.text();
    expect(response.status).toBe(400);
    expect(body).toContain(code);
    if (code.includes("CLIENT_ID"))
      expect(body).toContain(
        "1–256 printable ASCII characters, with no spaces or control characters",
      );
    if (code.includes("SECRET"))
      expect(body).toContain("matching Development OAuth client secret: 8–2048 characters");
    if (clientId) expect(body).not.toContain(clientId);
    if (clientSecret) expect(body).not.toContain(clientSecret);
    expect(body).not.toContain('value="');
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(mocks.vault).toHaveBeenCalledTimes(1); // Read only; no invalid configuration is stored.
    expect(begin).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  },
);
it("separates encrypted app-config storage failure from authorization redirect failure", async () => {
  mocks.vault
    .mockResolvedValueOnce(null)
    .mockRejectedValueOnce(new Error("LOCAL_VAULT_UNAVAILABLE"));
  const response = await startConnection(
    request("", "confirm=yes&clientId=fictional-client&clientSecret=fictional-secret"),
  );
  expect(await response.text()).toContain("CREDENTIAL_STORAGE");
  expect(fetch).not.toHaveBeenCalled();
  mocks.vault.mockResolvedValue(config);
  vi.spyOn(localOutreachAuthorization, "begin").mockImplementationOnce(() => {
    throw new Error("OAUTH_BUSY");
  });
  const second = await startConnection(request("", "confirm=yes"));
  expect(await second.text()).toContain("AUTHORIZATION_REDIRECT");
});
it.each(["TOKEN_EXCHANGE", "TOKEN_STORAGE"] as const)(
  "shows safe %s failures from completion",
  async (stage) => {
    vi.spyOn(localOutreachAuthorization, "finish").mockRejectedValueOnce(
      new OAuthStageError(stage, "OPERATION_FAILED"),
    );
    const response = await finishConnection(
      request("/callback", "code=private-code&state=private-state"),
    );
    const body = await response.text();
    expect(body).toContain(stage);
    expect(body).not.toMatch(/private-code|private-state/);
    expect(recordOAuthFailure).toHaveBeenCalled();
  },
);
it("requires authenticated local operator before reading the vault", async () => {
  mocks.user.mockResolvedValue(null);
  expect((await connectionPage(request())).status).toBe(400);
  expect(mocks.vault).not.toHaveBeenCalled();
});
it.each<Record<string, string>>([
  { origin: "https://foreign.example" },
  { host: "localhost:3000" },
  { "x-forwarded-proto": "http" },
  { "x-forwarded-port": "4000" },
  { forwarded: "host=127.0.0.1:3000" },
])("refuses bad host/origin/forwarding before credential use: %j", async (headers) => {
  expect((await startConnection(request("", "confirm=yes", headers))).status).toBe(400);
  expect(mocks.vault).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
it.each(["", "confirm=no", "confirm=yes&confirm=yes"])(
  "requires explicit single confirmation: %s",
  async (body) => {
    expect((await startConnection(request("", body))).status).toBe(400);
    expect(mocks.vault).not.toHaveBeenCalled();
  },
);
it("finishes the same-origin POST before navigating to the exact provider URL, with secure state cookie", async () => {
  const response = await startConnection(request("", "confirm=yes"));
  expect(response.status).toBe(200);
  expect(response.headers.has("location")).toBe(false);
  const body = await response.text();
  const target = new URL(
    body.match(/id="outreach-authorize" href="([^"]+)"/)![1].replaceAll("&amp;", "&"),
  );
  expect(target.origin + target.pathname).toBe("https://api.outreach.io/oauth/authorize");
  expect(target.searchParams.get("redirect_uri")).toBe(
    "https://127.0.0.1:3000/api/outreach/oauth/callback",
  );
  expect(target.searchParams.get("scope")).toBe(
    "prospects.read accounts.read mailings.read sequenceStates.read",
  );
  expect(body).toContain("location.replace(document.getElementById('outreach-authorize').href)");
  expect(body).toContain('rel="noreferrer"');
  expect(body).not.toContain(config.clientSecret);
  expect(body).not.toContain(config.encryptionKey);
  expect(body).not.toContain("<form");
  expect(response.headers.get("content-security-policy")).toContain("form-action 'self'");
  expect(response.headers.get("content-security-policy")).not.toContain("api.outreach.io");
  expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  expect(response.headers.get("set-cookie")).toContain("Secure");
  expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
  expect(response.headers.get("set-cookie")).toContain("Max-Age=300");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(fetch).not.toHaveBeenCalled();
});
it("callback GET bridges the Strict session through a same-origin POST, never exchanges credentials", async () => {
  const grant = localOutreachAuthorization.begin(config, session);
  const state = new URL(grant.url).searchParams.get("state")!;
  mocks.user.mockResolvedValue(null); // Strict application cookie is absent on cross-site GET.
  const response = await callbackPage(
    request(`/callback?code=fictional-code&state=${state}`, undefined, {
      cookie: `${outreachCookie}=${grant.browser}`,
    }),
  );
  expect(response.status).toBe(200);
  const body = await response.text();
  expect(body).toContain("history.replaceState");
  expect(body).toContain("mode: 'cors'");
  expect(body).toContain("credentials: 'same-origin'");
  expect(body).toContain("redirect: 'manual'");
  expect(body).toContain("referrerPolicy: 'no-referrer'");
  expect(body).toContain("form.remove()");
  expect(body).not.toMatch(/\.submit\(|localStorage|sessionStorage|console\./);
  expect(response.headers.get("content-security-policy")).toContain("connect-src 'self'");
  expect(response.headers.get("content-security-policy")).toContain("script-src 'nonce-");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(fetch).not.toHaveBeenCalled();
  expect(mocks.vault).not.toHaveBeenCalled();
  expect(mocks.change).not.toHaveBeenCalled();
  expect(
    (
      await finishConnection(
        request("/callback", `code=fictional-code&state=${state}`, {
          cookie: `${outreachCookie}=${grant.browser}`,
        }),
      )
    ).status,
  ).toBe(400);
});
it("removes invalid callback parameters without echoing codes or provider error text", async () => {
  const response = await callbackPage(request("/callback?error=private-error&code=private-code"));
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(
    "https://127.0.0.1:3000/api/outreach/oauth?connection=failed",
  );
  expect(await response.text()).not.toMatch(/private-(error|code)/);
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
});
it("records allowlisted provider denial codes while stripping the entire callback query", async () => {
  const response = await callbackPage(
    request("/callback?error=access_denied&error_description=private-value&code=private-code"),
  );
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(
    "https://127.0.0.1:3000/api/outreach/oauth?connection=failed",
  );
  expect(recordOAuthFailure).toHaveBeenCalledWith(
    "CALLBACK_VALIDATION",
    expect.objectContaining({ code: "access_denied" }),
  );
  expect(fetch).not.toHaveBeenCalled();
});
it.each(["production", "hosted", "disabled", "insecure"])(
  "fails closed in %s configuration",
  async (mode) => {
    if (mode === "production") vi.stubEnv("NODE_ENV", "production");
    if (mode === "hosted") vi.stubEnv("VERCEL", "1");
    if (mode === "disabled") vi.stubEnv("LOCAL_OUTREACH_OAUTH_ENABLED", "false");
    if (mode === "insecure") vi.stubEnv("NODE_TLS_REJECT_UNAUTHORIZED", "0");
    expect((await connectionPage(request())).status).toBe(mode === "hosted" ? 403 : 400);
    expect(mocks.vault).not.toHaveBeenCalled();
  },
);

// Opt-in Chrome regression, using the actual HTML/handlers with fictional vault/store/provider mocks.
it.skipIf(!process.env.OUTREACH_TEST_CHROME)(
  "Chrome reproduces legacy form-action blocking a same-origin POST redirected cross-origin",
  async () => {
    let posts = 0;
    let providerGets = 0;
    const dom = await outreachChromeFixture(async (incoming, origin, providerOrigin) => {
      if (incoming.path === "/fixture-start") {
        const page = await connectionPage(request());
        const headers = new Headers(page.headers);
        headers.set(
          "content-security-policy",
          headers
            .get("content-security-policy")!
            .replace("script-src 'none'", "script-src 'nonce-fixture'"),
        );
        return new Response(
          (await page.text()).replace(
            "</body>",
            `<script nonce="fixture">document.addEventListener('securitypolicyviolation',e=>document.body.dataset.violation=e.effectiveDirective);document.querySelector('[name=confirm]').checked=true;document.querySelector('form').requestSubmit();</script></body>`,
          ),
          { headers },
        );
      }
      if (incoming.method === "POST") {
        posts++;
        expect(incoming.headers.origin).toBe(origin);
        return new Response(null, {
          status: 303,
          headers: {
            location: `${providerOrigin}/fixture-provider`,
            "referrer-policy": "no-referrer",
          },
        });
      }
      if (incoming.path === "/fixture-provider") providerGets++;
      return new Response("Unexpected fixture navigation");
    });
    expect(posts).toBe(1);
    expect(providerGets).toBe(0);
    expect(dom).toContain('data-violation="form-action"');
  },
  30000,
);
// The ephemeral HTTP fixture translates ONLY its own origin to the canonical HTTPS test identity.
// Real HTTPS/host/proxy rejection is covered above; this fixture does not bypass TLS in the application.
it
  .skipIf(!process.env.OUTREACH_TEST_CHROME)
  .each([
    "success",
    "token-error",
    "unauthenticated",
    "network-error",
    "http-error",
    "fetch-unavailable",
    "missing-origin",
    "null-origin",
    "mismatched-origin",
  ] as const)(
  "isolated Chrome form-to-callback flow: %s",
  async (scenario) => {
    let state = "";
    let startPosts = 0;
    let callbackPosts = 0;
    let providerGets = 0;
    const finish = vi.spyOn(localOutreachAuthorization, "finish").mockImplementation(async () => {
      if (scenario === "token-error")
        throw new OAuthStageError("TOKEN_EXCHANGE", "invalid_grant", 400);
      mocks.get.mockResolvedValue({ state: { status: "CONNECTED" } });
    });
    vi.mocked(readOAuthFailure).mockImplementation(
      () => vi.mocked(recordOAuthFailure).mock.results.at(-1)?.value ?? null,
    );
    const dom = await outreachChromeFixture(async (incoming, origin, providerOrigin) => {
      const path = new URL(incoming.path, origin).pathname;
      const adapt = (relative: string) => {
        const headers: Record<string, string> = {};
        if (incoming.headers.cookie) headers.cookie = incoming.headers.cookie;
        const req = request(
          relative,
          incoming.method === "POST" ? incoming.body : undefined,
          headers,
        );
        if (incoming.headers.origin === origin) req.headers.set("origin", "https://127.0.0.1:3000");
        else if (incoming.headers.origin) req.headers.set("origin", incoming.headers.origin);
        else req.headers.delete("origin");
        return req;
      };
      if (path === "/fixture-start") {
        const page = await connectionPage(request());
        const headers = new Headers(page.headers);
        headers.set(
          "content-security-policy",
          headers
            .get("content-security-policy")!
            .replace("script-src 'none'", "script-src 'nonce-fixture'"),
        );
        headers.set("set-cookie", "fixture-session=fictional; HttpOnly; SameSite=Strict; Path=/");
        return new Response(
          (await page.text()).replace(
            "</body>",
            '<script nonce="fixture">document.querySelector("[name=confirm]").checked=true;document.querySelector("form").requestSubmit();</script></body>',
          ),
          { headers },
        );
      }
      if (path === "/api/outreach/oauth" && incoming.method === "POST") {
        startPosts++;
        expect(incoming.headers.origin).toBe(origin);
        expect(incoming.headers.referer).toBe(`${origin}/`);
        const response = await startConnection(adapt(""));
        expect(response.status).toBe(200);
        expect(response.headers.get("referrer-policy")).toBe("no-referrer");
        expect(response.headers.get("content-security-policy")).toContain("form-action 'self'");
        const body = await response.text();
        const encodedTarget = body.match(/id="outreach-authorize" href="([^"]+)"/)![1];
        state = new URL(encodedTarget.replaceAll("&amp;", "&")).searchParams.get("state")!;
        // Cross-origin loopback fixture catches CSP redirect-chain failures; no real provider access.
        return new Response(body.replace(encodedTarget, `${providerOrigin}/fixture-provider`), {
          status: response.status,
          headers: response.headers,
        });
      }
      if (path === "/fixture-provider") {
        providerGets++;
        expect(incoming.method).toBe("GET");
        expect(incoming.body).toBe("");
        expect(incoming.headers.referer).toBeUndefined();
        return new Response(null, {
          status: 303,
          headers: {
            location: `${origin}/api/outreach/oauth/callback?code=fictional-browser-code&state=${state}`,
            "referrer-policy": "no-referrer",
          },
        });
      }
      if (path === "/api/outreach/oauth/callback" && incoming.method === "GET") {
        const response = await callbackPage(
          adapt(incoming.path.replace("/api/outreach/oauth", "")),
        );
        expect(response.status).toBe(200);
        expect(response.headers.get("referrer-policy")).toBe("no-referrer");
        if (scenario === "fetch-unavailable" || scenario === "network-error") {
          const instrumentation =
            scenario === "fetch-unavailable"
              ? "window.fetch = undefined;"
              : "const originalFetch = window.fetch; window.fetch = (...args) => { document.body.dataset.fixtureFetchCalls = String(Number(document.body.dataset.fixtureFetchCalls || 0) + 1); return originalFetch(...args); };";
          return new Response(
            (await response.text()).replace(
              "history.replaceState",
              `${instrumentation}\nhistory.replaceState`,
            ),
            { headers: response.headers },
          );
        }
        return response;
      }
      if (path === "/api/outreach/oauth/callback" && incoming.method === "POST") {
        callbackPosts++;
        expect(incoming.headers.origin).toBe(origin);
        expect(incoming.headers.referer).toBeUndefined();
        expect(incoming.headers.cookie).toContain("fixture-session=fictional");
        expect(new URLSearchParams(incoming.body).get("code")).toBe("fictional-browser-code");
        if (scenario === "network-error") return null;
        if (scenario === "http-error") return new Response("Unauthorized", { status: 401 });
        const req = adapt("/callback");
        // Fault injection at the server boundary: browsers forbid manually overriding Origin.
        if (scenario === "missing-origin") req.headers.delete("origin");
        if (scenario === "null-origin") req.headers.set("origin", "null");
        if (scenario === "mismatched-origin") req.headers.set("origin", "https://foreign.example");
        if (scenario === "unauthenticated") mocks.user.mockResolvedValue(null);
        const response = await finishConnection(req);
        if (scenario === "unauthenticated") mocks.user.mockResolvedValue(localDevelopmentUser);
        expect(response.headers.get("referrer-policy")).toBe("no-referrer");
        if (response.status === 303)
          response.headers.set("location", `${origin}/api/outreach/oauth`);
        return response;
      }
      if (path === "/api/outreach/oauth") {
        expect(incoming.headers.referer).toBeUndefined();
        return connectionPage(adapt(incoming.path.replace("/api/outreach/oauth", "")));
      }
      return new Response("Fixture route unavailable", { status: 404 });
    });
    expect(startPosts).toBe(1);
    expect(providerGets).toBe(1);
    if (scenario === "network-error") {
      // Chrome may replay transport-level requests when the socket closes before headers.
      // Assert one JavaScript fetch, not a guarantee about Chromium's transport layer.
      expect(callbackPosts).toBeGreaterThanOrEqual(1);
      expect(dom).toContain('data-fixture-fetch-calls="1"');
    } else expect(callbackPosts).toBe(scenario === "fetch-unavailable" ? 0 : 1);
    expect(dom).not.toMatch(/fictional-browser-code|name="state"|name="code"/);
    if (scenario === "success") expect(dom).toContain("Status: CONNECTED");
    else if (scenario === "token-error")
      expect(dom).toMatch(/TOKEN_EXCHANGE[\s\S]*invalid_grant[\s\S]*HTTP: 400/);
    else if (scenario === "network-error" || scenario === "fetch-unavailable")
      expect(dom).toContain("Connection status could not be confirmed. No automatic retry.");
    else if (scenario === "http-error")
      expect(dom).toContain(
        "Connection status could not be confirmed (HTTP 401). No automatic retry.",
      );
    else if (scenario === "unauthenticated") expect(dom).toContain("LOCAL_OPERATOR_REQUIRED");
    else expect(dom).toContain("ORIGIN_DENIED");
    expect(finish).toHaveBeenCalledTimes(
      scenario === "success" || scenario === "token-error" ? 1 : 0,
    );
    expect(fetch).not.toHaveBeenCalled(); // The server never calls a real provider.
    expect(mocks.change).not.toHaveBeenCalled();
  },
  30000,
);
