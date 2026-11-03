import { previewApiDenied } from "@/lib/preview-policy.mjs";
import "server-only";
import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { localDevelopmentConfig, localDevelopmentUser } from "@/lib/auth/local-development";
import { workforceSameOrigin } from "@/server/agent-workforce/request-origin";
import {
  assertLocalOutreach,
  localOutreachVault,
  outreachLocalConfigSchema,
} from "./local-outreach-vault";
import { localOutreachAuthorization, outreachCallbackUrl, outreachCookie } from "./outreach-oauth";
import { PrismaIntegrationStore } from "./store";
import {
  OAuthStageError,
  providerOAuthCode,
  readOAuthFailure,
  recordOAuthFailure,
  type OAuthStage,
  type OAuthDiagnostic,
} from "./outreach-oauth-diagnostics";

const base = "https://127.0.0.1:3000";
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
function html(
  body: string,
  nonce?: string,
  status = 200,
  referrerPolicy: "no-referrer" | "strict-origin" = "no-referrer",
) {
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Outreach read-only connection</title></head><body>${body}</body></html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
        "Referrer-Policy": referrerPolicy,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": `default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; connect-src ${nonce ? "'self'" : "'none'"}; script-src ${nonce ? `'nonce-${nonce}'` : "'none'"}`,
      },
    },
  );
}
function guard(request: NextRequest) {
  assertLocalOutreach();
  const url = new URL(request.url);
  // Next normalizes 127.0.0.1 in Request URLs; never trust forwarded headers for identity.
  if (
    request.headers.get("host") !== "127.0.0.1:3000" ||
    url.protocol !== "https:" ||
    !["127.0.0.1:3000", "localhost:3000"].includes(url.host) ||
    request.headers.has("forwarded") ||
    (request.headers.has("x-forwarded-port") &&
      request.headers.get("x-forwarded-port") !== "3000") ||
    (request.headers.has("x-forwarded-host") &&
      request.headers.get("x-forwarded-host") !== "127.0.0.1:3000") ||
    (request.headers.has("x-forwarded-proto") &&
      request.headers.get("x-forwarded-proto") !== "https")
  )
    throw new Error("LOCAL_OUTREACH_DISABLED");
  return localDevelopmentConfig()!.token;
}
async function actor() {
  const user = await getCurrentUser();
  if (user?.id !== localDevelopmentUser.id) throw new Error("LOCAL_OPERATOR_REQUIRED");
  assertLocalOutreach(user.id);
  return user.id;
}
async function fields(request: NextRequest) {
  if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded"))
    throw new Error("INVALID_FORM");
  const body = await request.text();
  if (body.length > 12000) throw new Error("INVALID_FORM");
  const params = new URLSearchParams(body);
  for (const key of params.keys())
    if (params.getAll(key).length !== 1) throw new Error("INVALID_FORM");
  return params;
}
function diagnosticPage(diagnostic: OAuthDiagnostic | null) {
  const idInvalid =
    diagnostic?.stage === "CREDENTIAL_VALIDATION" &&
    ["INVALID_CLIENT_ID_FORMAT", "INVALID_CLIENT_ID_AND_SECRET_FORMAT"].includes(diagnostic.code);
  const secretInvalid =
    diagnostic?.stage === "CREDENTIAL_VALIDATION" &&
    ["INVALID_CLIENT_SECRET_FORMAT", "INVALID_CLIENT_ID_AND_SECRET_FORMAT"].includes(
      diagnostic.code,
    );
  const credentialHelp =
    (idInvalid
      ? "<p>Client ID is missing or has an invalid format. Enter the Development OAuth client ID: 1–256 printable ASCII characters, with no spaces or control characters. Provider-issued punctuation is allowed; paste the ID unchanged.</p>"
      : "") +
    (secretInvalid
      ? "<p>Client Secret is missing or has an invalid format. Enter the matching Development OAuth client secret: 8–2048 characters.</p>"
      : "");
  return html(
    `<h1>Connection not completed</h1>${diagnostic ? `<p>Last recorded failure — Stage: <strong>${diagnostic.stage}</strong><br>Error: <strong>${diagnostic.code}</strong>${diagnostic.httpStatus ? `<br>HTTP: ${diagnostic.httpStatus}` : ""}</p>` : "<p>Safe diagnostic unavailable. Do not retry automatically.</p>"}${credentialHelp}<p>No automatic retry. Credentials and provider descriptions are withheld.</p><a href='/api/outreach/oauth'>Return to connection</a>`,
    undefined,
    400,
  );
}
function failure(stage: OAuthStage, error: unknown) {
  return diagnosticPage(recordOAuthFailure(stage, error));
}
export async function connectionPage(request: NextRequest) {
  const denied = previewApiDenied();
  if (denied) return denied;
  let stage: OAuthStage = "PRECONDITION";
  try {
    guard(request);
    const owner = await actor();
    if (request.nextUrl.searchParams.get("connection") === "failed")
      return diagnosticPage(readOAuthFailure());
    stage = "CREDENTIAL_READ";
    const saved = await localOutreachVault();
    stage = "CONNECTION_STATUS_READ";
    const state = (await new PrismaIntegrationStore().get(owner, "OUTREACH")).state;
    return html(
      `<h1>Outreach — read-only</h1><p>Status: ${escape(state.status)}. History/suppression clearance remains HOLD. Jobs, sending and enrollment stay disabled.</p><p>Callback: ${outreachCallbackUrl}</p><p>Scopes: prospects.read accounts.read mailings.read sequenceStates.read</p><form method="post" action="/api/outreach/oauth">${saved ? "<p>Windows-encrypted app configuration is available.</p>" : '<p>One-time setup: stored encrypted with Windows DPAPI under this Windows account, outside the repository.</p><label>Development client ID <input name="clientId" required maxlength="256" autocomplete="off"></label><br><label>Development client secret <input name="clientSecret" type="password" required maxlength="2048" autocomplete="off"></label><br>'}<label><input name="confirm" type="checkbox" value="yes" required>Authorize only these read permissions for this local account.</label><br><button type="submit">Connect Outreach</button></form><p>Authorization opens Outreach. No prospects are imported automatically.</p><a href="/sales-agent/company-research">Return to application</a>`,
      undefined,
      200,
      // Native same-origin form POSTs need a non-opaque Origin. No code is present here.
      "strict-origin",
    );
  } catch (error) {
    return failure(stage, error);
  }
}
export async function startConnection(request: NextRequest) {
  const denied = previewApiDenied();
  if (denied) return denied;
  let stage: OAuthStage = "PRECONDITION";
  try {
    const session = guard(request),
      owner = await actor();
    if (!workforceSameOrigin(request)) throw new Error("ORIGIN_DENIED");
    stage = "CREDENTIAL_VALIDATION";
    const form = await fields(request);
    if (form.get("confirm") !== "yes") throw new Error("CONFIRMATION_REQUIRED");
    stage = "CREDENTIAL_READ";
    let config = await localOutreachVault();
    if (!config) {
      stage = "CREDENTIAL_VALIDATION";
      config = outreachLocalConfigSchema.parse({
        version: 1,
        actor: owner,
        clientId: form.get("clientId"),
        clientSecret: form.get("clientSecret"),
        encryptionKey: randomBytes(32).toString("base64"),
      });
      stage = "CREDENTIAL_STORAGE";
      config = await localOutreachVault(config);
    } else if (form.has("clientId") || form.has("clientSecret"))
      throw new Error("EXISTING_CONFIG_PRESERVED");
    if (!config) throw new Error("SETUP_REQUIRED");
    stage = "AUTHORIZATION_REDIRECT";
    const pending = localOutreachAuthorization.begin(config, session);
    // Chrome applies form-action to a form POST's redirect chain. Finish the POST
    // locally, then navigate by GET; never broaden form-action or forward form data.
    const nonce = randomBytes(24).toString("base64");
    const response = html(
      `<h1>Opening Outreach authorization</h1><p>Continue with the four read-only permissions. No prospects are imported automatically.</p><a id="outreach-authorize" href="${escape(pending.url)}" rel="noreferrer">Continue to Outreach</a><script nonce="${nonce}">location.replace(document.getElementById('outreach-authorize').href);</script>`,
      nonce,
    );
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.cookies.set(outreachCookie, pending.browser, {
      secure: true,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 300,
    });
    return response;
  } catch (error) {
    return failure(stage, error);
  }
}
export async function callbackPage(request: NextRequest) {
  const denied = previewApiDenied();
  if (denied) return denied;
  let stage: OAuthStage = "PRECONDITION";
  try {
    const session = guard(request),
      params = request.nextUrl.searchParams;
    stage = "CALLBACK_VALIDATION";
    if (params.has("error"))
      throw new OAuthStageError(stage, providerOAuthCode(params.get("error")) ?? "GRANT_DENIED");
    if (params.getAll("code").length !== 1 || params.getAll("state").length !== 1)
      throw new Error("GRANT_DENIED");
    const code = params.get("code")!,
      state = params.get("state")!;
    if (!code || code.length > 4096 || /[\u0000-\u0020]/.test(code))
      throw new Error("GRANT_DENIED");
    stage = "STATE_VALIDATION";
    localOutreachAuthorization.check(
      state,
      request.cookies.get(outreachCookie)?.value ?? "",
      session,
    );
    const nonce = randomBytes(24).toString("base64");
    // CORS-mode fetch preserves Origin under no-referrer; native form POST would send null.
    // Keep the Strict login cookie and send the grant once, only to this same-origin endpoint.
    return html(
      `<h1>Finishing read-only connection</h1><p id="completion-status" role="status">Completing the connection once. Do not refresh.</p><noscript>JavaScript is required to finish securely. No connection was completed.</noscript><form id="finish" method="post" action="/api/outreach/oauth/callback"><input type="hidden" name="code" value="${escape(code)}"><input type="hidden" name="state" value="${escape(state)}"></form><script nonce="${nonce}">
history.replaceState(null,'','/api/outreach/oauth/callback');
const form = document.getElementById('finish');
const payload = new URLSearchParams(new FormData(form));
form.remove();
(async () => {
  try {
    const response = await fetch('/api/outreach/oauth/callback', {
      method: 'POST', mode: 'cors', credentials: 'same-origin', redirect: 'manual',
      referrerPolicy: 'no-referrer', cache: 'no-store', body: payload
    });
    if (response.type === 'opaqueredirect') {
      location.replace('/api/outreach/oauth');
    } else if (response.status === 400) {
      location.replace('/api/outreach/oauth?connection=failed');
    } else {
      document.getElementById('completion-status').textContent = 'Connection status could not be confirmed (HTTP ' + response.status + '). No automatic retry. Return to the connection page to check status.';
    }
  } catch {
    document.getElementById('completion-status').textContent = 'Connection status could not be confirmed. No automatic retry. Return to the connection page to check status.';
  } finally {
    payload.delete('code'); payload.delete('state');
  }
})();
</script><a href="/api/outreach/oauth">Return to connection</a>`,
      nonce,
    );
  } catch (error) {
    recordOAuthFailure(stage, error);
    // Preserve unconditional removal of grant parameters, including with JavaScript disabled.
    const response = NextResponse.redirect(`${base}/api/outreach/oauth?connection=failed`, 303);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }
}
export async function finishConnection(request: NextRequest) {
  const denied = previewApiDenied();
  if (denied) return denied;
  let stage: OAuthStage = "PRECONDITION";
  try {
    const session = guard(request),
      owner = await actor();
    if (!workforceSameOrigin(request)) throw new Error("ORIGIN_DENIED");
    stage = "CALLBACK_VALIDATION";
    const form = await fields(request);
    stage = "CREDENTIAL_READ";
    const config = await localOutreachVault();
    if (!config) throw new Error("SETUP_REQUIRED");
    stage = "STATE_VALIDATION";
    await localOutreachAuthorization.finish({
      actor: owner,
      session,
      browser: request.cookies.get(outreachCookie)?.value ?? "",
      state: form.get("state") ?? "",
      code: form.get("code") ?? "",
      config,
      store: new PrismaIntegrationStore(),
    });
    stage = "COMPLETION_REDIRECT";
    const response = NextResponse.redirect(`${base}/api/outreach/oauth`, 303);
    response.cookies.set(outreachCookie, "", {
      secure: true,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch (error) {
    return failure(stage, error);
  }
}
