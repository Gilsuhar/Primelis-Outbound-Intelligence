// @vitest-environment node
import { expect, it, vi } from "vitest";
import { OutreachAuthorization, outreachCallbackUrl, validOutreachScopes } from "./outreach-oauth";
import { REQUIRED_SCOPES, initialState } from "./contracts";
import { decryptToken, type IntegrationStore, type StoredIntegration } from "./store";
import { OutreachTokens } from "./outreach";
import type { LocalOutreachConfig } from "./local-outreach-vault";

const config: LocalOutreachConfig = {
  version: 1,
  actor: "local-development-agent-workforce",
  clientId: "fictional-client-id",
  clientSecret: "fictional-client-secret",
  encryptionKey: Buffer.alloc(32, 7).toString("base64"),
};
const scopes = REQUIRED_SCOPES.OUTREACH.join(" ");
function fixture() {
  let row: StoredIntegration = { state: initialState("OUTREACH"), version: 0, secret: null };
  const store: IntegrationStore = {
    get: async () => structuredClone(row),
    change: async (_actor, _provider, update) => {
      const result = await update(structuredClone(row));
      row = result.row;
      return result.value;
    },
    claim: async () => true,
    release: async () => {},
  };
  const token = {
    access_token: "fictional-access",
    refresh_token: "fictional-refresh",
    expires_in: 7200,
    scope: scopes,
  };
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).endsWith("/oauth/token")) return Response.json(token);
    expect(init?.method).toBe("GET");
    return Response.json({ data: [] });
  });
  const flow = new OutreachAuthorization(),
    session = "fictional-session";
  const pending = flow.begin(config, session);
  const state = new URL(pending.url).searchParams.get("state")!;
  const input = {
    actor: config.actor,
    state,
    browser: pending.browser,
    session,
    code: "fictional-code",
    config,
    store,
    fetcher,
  };
  return { flow, input, fetcher, store, token };
}
it("requests only the four reads and the exact HTTPS callback, with opaque unique state", () => {
  const flow = new OutreachAuthorization();
  const a = flow.begin(config, "session"),
    b = flow.begin(config, "session");
  const url = new URL(b.url);
  expect(url.origin + url.pathname).toBe("https://api.outreach.io/oauth/authorize");
  expect(url.searchParams.get("redirect_uri")).toBe(outreachCallbackUrl);
  expect(url.searchParams.get("scope")).toBe(scopes);
  expect(url.searchParams.get("response_type")).toBe("code");
  expect(url.searchParams.get("state")).toMatch(/^[a-f0-9]{64}$/);
  expect(b.browser).not.toBe(a.browser);
  expect(b.url).not.toContain(config.clientSecret);
  expect(() =>
    flow.check(new URL(a.url).searchParams.get("state")!, a.browser, "session"),
  ).toThrow();
});
it("encodes opaque client-ID punctuation without changing OAuth parameters at either endpoint", async () => {
  const f = fixture();
  const opaqueConfig = {
    ...config,
    clientId: "fictional:app.id+with/padding=&scope=prospects.write#?",
  };
  const pending = f.flow.begin(opaqueConfig, f.input.session);
  const url = new URL(pending.url);
  expect(url.origin + url.pathname).toBe("https://api.outreach.io/oauth/authorize");
  expect(url.hash).toBe("");
  expect(url.searchParams.getAll("client_id")).toEqual([opaqueConfig.clientId]);
  expect(url.searchParams.getAll("scope")).toEqual([scopes]);
  expect(url.searchParams.getAll("redirect_uri")).toEqual([outreachCallbackUrl]);
  await f.flow.finish({
    ...f.input,
    config: opaqueConfig,
    browser: pending.browser,
    state: url.searchParams.get("state")!,
  });
  const [target, init] = f.fetcher.mock.calls[0];
  expect(target).toBe("https://api.outreach.io/oauth/token");
  const body = new URLSearchParams(String(init!.body));
  expect(body.getAll("client_id")).toEqual([opaqueConfig.clientId]);
  expect(body.has("scope")).toBe(false);
  expect(body.getAll("redirect_uri")).toEqual([outreachCallbackUrl]);
  expect(body.get("client_secret")).toBe(config.clientSecret);
});
it.each(["state", "browser", "actor", "session"])(
  "rejects mismatched %s before any request or storage",
  async (key) => {
    const f = fixture();
    await expect(f.flow.finish({ ...f.input, [key]: "wrong" })).rejects.toThrow();
    expect(f.fetcher).not.toHaveBeenCalled();
    expect((await f.store.get(config.actor, "OUTREACH")).secret).toBeNull();
  },
);
it("expires state and invalidates it on session restart", () => {
  let now = Date.now();
  const flow = new OutreachAuthorization(() => now),
    pending = flow.begin(config, "session");
  const state = new URL(pending.url).searchParams.get("state")!;
  expect(() => flow.check(state, pending.browser, "restarted-session")).toThrow();
  now += 300001;
  expect(() => flow.check(state, pending.browser, "session")).toThrow();
});
it.each([
  undefined,
  "",
  "prospects.read",
  `${scopes} prospects.write`,
  `${scopes} users.read`,
  `${scopes} prospects.read`,
])("rejects missing, expanded or duplicate returned scopes: %s", async (scope) => {
  expect(validOutreachScopes(scope)).toBe(false);
  const f = fixture();
  f.fetcher.mockResolvedValue(Response.json({ ...f.token, scope }));
  await expect(f.flow.finish(f.input)).rejects.toThrow();
  expect(f.fetcher).toHaveBeenCalledTimes(1);
  expect((await f.store.get(config.actor, "OUTREACH")).secret).toBeNull();
});
it("exchanges once, verifies only read endpoints, encrypts credentials and retains unknown history", async () => {
  const f = fixture();
  await f.flow.finish(f.input);
  expect(f.fetcher).toHaveBeenCalledTimes(5);
  const [url, init] = f.fetcher.mock.calls[0];
  expect(url).toBe("https://api.outreach.io/oauth/token");
  expect(init).toMatchObject({ method: "POST", redirect: "error", cache: "no-store" });
  const body = init!.body as URLSearchParams;
  expect(body.get("grant_type")).toBe("authorization_code");
  expect(body.get("redirect_uri")).toBe(outreachCallbackUrl);
  expect(body.get("client_secret")).toBe(config.clientSecret);
  expect(f.fetcher.mock.calls.slice(1).map(([target]) => new URL(String(target)).pathname)).toEqual(
    ["/api/v2/prospects", "/api/v2/accounts", "/api/v2/mailings", "/api/v2/sequenceStates"],
  );
  const row = await f.store.get(config.actor, "OUTREACH");
  expect(JSON.stringify(row)).not.toMatch(
    /fictional-access|fictional-refresh|fictional-client-secret/,
  );
  expect(
    JSON.parse(decryptToken(config.actor, row.secret!, config.encryptionKey)).refreshToken,
  ).toBe("fictional-refresh");
  expect(row.state).toMatchObject({
    status: "CONNECTED",
    coverage: "UNKNOWN",
    job: null,
    lastSuccessfulSync: null,
  });
  await expect(f.flow.finish(f.input)).rejects.toThrow("OAUTH_STATE_INVALID");
  expect(f.fetcher).toHaveBeenCalledTimes(5);
});
it("sanitizes a failed exchange and consumes the grant without retry", async () => {
  const f = fixture();
  f.fetcher.mockRejectedValue(new Error("provider body fictional-client-secret fictional-code"));
  await expect(f.flow.finish(f.input)).rejects.toMatchObject({
    stage: "TOKEN_EXCHANGE",
    code: "TOKEN_NETWORK_ERROR",
  });
  await expect(f.flow.finish(f.input)).rejects.toThrow("OAUTH_STATE_INVALID");
  expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it("does not persist a token when required resource access is denied", async () => {
  const f = fixture();
  f.fetcher
    .mockResolvedValueOnce(Response.json(f.token))
    .mockResolvedValue(new Response("", { status: 403 }));
  await expect(f.flow.finish(f.input)).rejects.toMatchObject({
    stage: "RESOURCE_PERMISSION_CHECK",
    code: "PERMISSION_MISSING",
    httpStatus: 403,
  });
  expect((await f.store.get(config.actor, "OUTREACH")).secret).toBeNull();
  expect(f.fetcher).toHaveBeenCalledTimes(2);
});
it("preserves safe provider error identifiers and never retries the consumed grant", async () => {
  const f = fixture();
  f.fetcher.mockResolvedValue(
    Response.json(
      { error: "invalid_client", error_description: "private client-secret" },
      { status: 401 },
    ),
  );
  await expect(f.flow.finish(f.input)).rejects.toMatchObject({
    stage: "TOKEN_EXCHANGE",
    code: "invalid_client",
    httpStatus: 401,
  });
  await expect(f.flow.finish(f.input)).rejects.toThrow("OAUTH_STATE_INVALID");
  expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it("identifies malformed token responses without retaining their contents", async () => {
  const f = fixture();
  f.fetcher.mockResolvedValue(Response.json({ access_token: "private-access-token" }));
  await expect(f.flow.finish(f.input)).rejects.toMatchObject({
    stage: "TOKEN_RESPONSE_VALIDATION",
    code: "INVALID_TOKEN_RESPONSE",
  });
  expect((await f.store.get(config.actor, "OUTREACH")).secret).toBeNull();
});
it("identifies token encryption/persistence failure, including transaction commit rejection", async () => {
  const f = fixture();
  f.store.change = async (_actor, _provider, update) => {
    await update(await f.store.get(config.actor, "OUTREACH"));
    throw new Error("private SQL parameters and token in commit error");
  };
  await expect(f.flow.finish(f.input)).rejects.toMatchObject({
    stage: "TOKEN_STORAGE",
    code: "OPERATION_FAILED",
  });
  expect((await f.store.get(config.actor, "OUTREACH")).secret).toBeNull();
  expect(f.fetcher).toHaveBeenCalledTimes(5);
});
it("uses the existing adapter token cache with a DPAPI-supplied key and rotates without manual token entry", async () => {
  const f = fixture();
  f.token.expires_in = 1;
  await f.flow.finish(f.input);
  const refreshFetch = vi.fn(async () =>
    Response.json({
      ...f.token,
      access_token: "new-access",
      refresh_token: "new-refresh",
      expires_in: 7200,
    }),
  );
  const tokens = new OutreachTokens(
    config.actor,
    f.store,
    async () => ({
      ...config,
      redirectUri: outreachCallbackUrl,
      requireExactScopes: true,
    }),
    refreshFetch,
  );
  expect(await tokens.access()).toBe("new-access");
  expect(await tokens.access()).toBe("new-access");
  expect(refreshFetch).toHaveBeenCalledTimes(1);
  const row = await f.store.get(config.actor, "OUTREACH");
  expect(
    JSON.parse(decryptToken(config.actor, row.secret!, config.encryptionKey)).refreshToken,
  ).toBe("new-refresh");
});
