import { assertPreviewOperation } from "@/lib/preview-policy.mjs";
import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { REQUIRED_SCOPES } from "./contracts";
import { OutreachConnector } from "./outreach";
import { encryptToken, type IntegrationStore } from "./store";
import type { LocalOutreachConfig } from "./local-outreach-vault";
import {
  OAuthStageError,
  stageError,
  tokenHttpError,
  type OAuthStage,
} from "./outreach-oauth-diagnostics";

export const outreachCallbackUrl = "https://127.0.0.1:3000/api/outreach/oauth/callback";
export const outreachCookie = "__Host-outreach-oauth";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const equal = (a: string, b: string) =>
  timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b)));
export function validOutreachScopes(scope: unknown) {
  if (typeof scope !== "string") return false;
  const values = scope.trim().split(/\s+/);
  return (
    values.length === REQUIRED_SCOPES.OUTREACH.length &&
    new Set(values).size === values.length &&
    REQUIRED_SCOPES.OUTREACH.every((s) => values.includes(s))
  );
}
type Pending = { actor: string; browser: string; session: string; expires: number };

/** Ephemeral, one-use grants. Restart/HMR loss fails closed; no grants or codes are persisted. */
export class OutreachAuthorization {
  private pending = new Map<string, Pending>();
  constructor(private readonly now = () => Date.now()) {}
  begin(config: LocalOutreachConfig, session: string) {
    assertPreviewOperation("outreach-authorization");
    for (const [key, entry] of this.pending)
      if (entry.expires <= this.now() || entry.actor === config.actor) this.pending.delete(key);
    if (this.pending.size >= 16) throw new Error("OAUTH_BUSY");
    const state = randomBytes(32).toString("hex"),
      browser = randomBytes(32).toString("hex");
    this.pending.set(digest(state), {
      actor: config.actor,
      browser: digest(browser),
      session: digest(session),
      expires: this.now() + 300000,
    });
    const url = new URL("https://api.outreach.io/oauth/authorize");
    url.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: outreachCallbackUrl,
      response_type: "code",
      scope: REQUIRED_SCOPES.OUTREACH.join(" "),
      state,
    }).toString();
    return { url: url.toString(), browser };
  }
  check(state: string, browser: string, session: string, actor?: string) {
    if (!/^[a-f0-9]{64}$/.test(state) || !/^[a-f0-9]{64}$/.test(browser))
      throw new Error("OAUTH_STATE_INVALID");
    const entry = this.pending.get(digest(state));
    if (
      !entry ||
      entry.expires <= this.now() ||
      !equal(entry.browser, digest(browser)) ||
      !equal(entry.session, digest(session)) ||
      (actor !== undefined && actor !== entry.actor)
    )
      throw new Error("OAUTH_STATE_INVALID");
    return entry;
  }
  async finish(input: {
    actor: string;
    state: string;
    browser: string;
    session: string;
    code: string;
    config: LocalOutreachConfig;
    store: IntegrationStore;
    fetcher?: typeof fetch;
  }) {
    assertPreviewOperation("outreach-authorization");
    let stage: OAuthStage = "STATE_VALIDATION";
    try {
      this.check(input.state, input.browser, input.session, input.actor);
      this.pending.delete(digest(input.state)); // consume before any await, including failures
      if (
        !input.code ||
        input.code.length > 4096 ||
        /[\u0000-\u0020]/.test(input.code) ||
        input.config.actor !== input.actor
      )
        throw new Error("OAUTH_GRANT_INVALID");
      const fetcher = input.fetcher ?? fetch;
      stage = "TOKEN_EXCHANGE";
      const response = await fetcher("https://api.outreach.io/oauth/token", {
        method: "POST",
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: input.config.clientId,
          client_secret: input.config.clientSecret,
          redirect_uri: outreachCallbackUrl,
          code: input.code,
        }),
      }).catch(() => {
        throw new OAuthStageError("TOKEN_EXCHANGE", "TOKEN_NETWORK_ERROR");
      });
      if (!response.ok) throw await tokenHttpError(response);
      stage = "TOKEN_RESPONSE_VALIDATION";
      const token = z
        .object({
          access_token: z.string().min(1).max(16384),
          refresh_token: z.string().min(1).max(16384),
          token_type: z
            .string()
            .refine((v) => v.toLowerCase() === "bearer")
            .optional(),
          expires_in: z.number().int().positive().max(2592000),
          scope: z.string().max(500),
        })
        .parse(await response.json());
      if (!validOutreachScopes(token.scope)) throw new Error("OAUTH_SCOPE_DENIED");
      // Real read checks before CONNECTED; no sync/enrollment or provider record writes.
      stage = "RESOURCE_PERMISSION_CHECK";
      await new OutreachConnector(() => Promise.resolve(token.access_token), {
        fetcher,
        attempts: 1,
        deadline: this.now() + 20000,
      }).check();
      stage = "TOKEN_STORAGE";
      await input.store.change(input.actor, "OUTREACH", async (row) => {
        row.secret = encryptToken(
          input.actor,
          JSON.stringify({
            accessToken: token.access_token,
            refreshToken: token.refresh_token,
            expiresAt: this.now() + token.expires_in * 1000,
          }),
          input.config.encryptionKey,
        );
        row.state.status = "CONNECTED";
        row.state.checkedAt = new Date(this.now()).toISOString();
        row.state.missingScopes = [];
        row.state.detail =
          "Read-only OAuth and required resource checks passed. Full history/suppression clearance remains HOLD.";
        return { row, value: undefined };
      });
    } catch (error) {
      throw stageError(stage, error);
    }
  }
}
const globalState = globalThis as typeof globalThis & {
  localOutreachAuthorization?: OutreachAuthorization;
  localOutreachAuthorizationVersion?: number;
};
// Replace pre-diagnostic methods on hot reload; pending old grants fail closed, never replay.
if (globalState.localOutreachAuthorizationVersion !== 2) {
  globalState.localOutreachAuthorization = new OutreachAuthorization();
  globalState.localOutreachAuthorizationVersion = 2;
}
export const localOutreachAuthorization = globalState.localOutreachAuthorization!;
