import "server-only";
import { reserveProvider, unitCost, providerAttempts } from "@/server/agent-workforce/daily/budget";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { validatePublicCompanyUrl } from "@/features/connected-research/url-safety";
import {
  sameVerificationIdentity,
  verificationIdentity,
  verificationResultSchema,
  type VerificationKind,
  type VerificationResult,
} from "@/features/sales-agent/verification/contracts";
import type { IntakeContact } from "@/features/sales-agent/evidence";
export class VerificationProviderError extends Error {
  constructor(
    public readonly code:
      "PERMISSION_MISSING" | "UNAVAILABLE" | "INVALID_RESPONSE" | "RATE_LIMITED",
    public readonly retryAfterMs = 60000,
  ) {
    super(code);
  }
}
export interface VerificationAdapter {
  id: string;
  verify(
    kind: VerificationKind,
    contact: IntakeContact,
    now: Date,
  ): Promise<VerificationResult | null>;
}
async function request(fetcher: typeof fetch, url: string, init: RequestInit): Promise<unknown> {
  for (let attempt = 0; attempt < providerAttempts(2); attempt++) {
    const cost = unitCost("VERIFICATION");
    const reservation = await reserveProvider("VERIFICATION", cost);
    let response: Response;
    try {
      response = await fetcher(url, {
        ...init,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      await reservation.finish();
      throw new VerificationProviderError("UNAVAILABLE");
    }
    await reservation.finish({ estimatedUsd: cost });
    if (response.status === 401 || response.status === 403)
      throw new VerificationProviderError("PERMISSION_MISSING");
    if (response.status === 429 || response.status >= 500) {
      const raw = response.headers.get("retry-after"),
        retry = raw
          ? /^\d+$/.test(raw)
            ? Number(raw) * 1000
            : Math.max(0, Date.parse(raw) - Date.now())
          : 500;
      if (attempt + 1 < providerAttempts(2) && Number.isFinite(retry) && retry <= 1000) {
        await new Promise((resolve) => setTimeout(resolve, retry));
        continue;
      }
      throw new VerificationProviderError(
        response.status === 429 ? "RATE_LIMITED" : "UNAVAILABLE",
        Number.isFinite(retry) ? Math.max(60000, retry) : 60000,
      );
    }
    if (!response.ok) throw new VerificationProviderError("UNAVAILABLE");
    const body = await response.text();
    if (body.length > 20000) throw new VerificationProviderError("INVALID_RESPONSE");
    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw new VerificationProviderError("INVALID_RESPONSE");
    }
  }
  throw new VerificationProviderError("UNAVAILABLE");
}
export class GatewayVerificationAdapter implements VerificationAdapter {
  constructor(
    readonly id: string,
    private readonly url: string,
    private readonly token: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  async verify(kind: VerificationKind, contact: IntakeContact): Promise<VerificationResult | null> {
    if (!this.url || !this.token || !this.id || this.id === "UNCONFIGURED") return null;
    const safe = validatePublicCompanyUrl(this.url);
    if (!safe.ok || safe.url.protocol !== "https:" || safe.url.search || safe.url.hash)
      throw new VerificationProviderError("INVALID_RESPONSE");
    const endpoint =
      safe.url.toString().replace(/\/$/, "") + (kind === "EMAIL" ? "/email" : "/employment");
    const value = await request(this.fetcher, endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ version: 1, kind, identity: verificationIdentity(contact) }),
    });
    const parsed = verificationResultSchema.safeParse(value);
    if (
      !parsed.success ||
      parsed.data.kind !== kind ||
      parsed.data.proof.providerId !== this.id ||
      !sameVerificationIdentity(parsed.data.identity, contact)
    )
      throw new VerificationProviderError("INVALID_RESPONSE");
    return parsed.data;
  }
}
/** Optional paid provider. Only deliverability/business-email evidence, never employment proof. */
export class ZeroBounceVerificationAdapter implements VerificationAdapter {
  readonly id = "ZEROBOUNCE";
  constructor(
    private readonly key: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  async verify(
    kind: VerificationKind,
    contact: IntakeContact,
    now: Date,
  ): Promise<VerificationResult | null> {
    if (kind !== "EMAIL" || !this.key || !contact.email) return null;
    const url = new URL("https://api.zerobounce.net/v2/validate");
    url.searchParams.set("api_key", this.key);
    url.searchParams.set("email", contact.email);
    url.searchParams.set("ip_address", "");
    // The provider uses query-key authentication: this URL is never logged, persisted or returned.
    const data = z
      .object({
        address: z.string().email(),
        status: z.string(),
        sub_status: z.string().optional(),
        free_email: z.boolean(),
      })
      .safeParse(await request(this.fetcher, url.toString(), { method: "GET" }));
    if (!data.success || data.data.address.toLowerCase() !== contact.email.toLowerCase())
      throw new VerificationProviderError("INVALID_RESPONSE");
    const result = data.data;
    const business =
      result.free_email === false &&
      !!contact.companyDomain &&
      contact.email.split("@")[1]?.toLowerCase() ===
        contact.companyDomain.toLowerCase().replace(/^www\./, "");
    return {
      kind: "EMAIL",
      identity: verificationIdentity(contact),
      status:
        result.status === "valid" && business && !result.sub_status
          ? "VERIFIED"
          : ["invalid", "spamtrap", "abuse", "do_not_mail"].includes(result.status)
            ? "INVALID"
            : result.status === "catch-all"
              ? "CATCH_ALL"
              : "UNKNOWN",
      businessEmail: business,
      proof: {
        providerId: this.id,
        sourceRecordId: `request-${randomUUID()}`,
        sourceUrl: "https://www.zerobounce.net/docs/email-validation-api-quickstart/",
        checkedAt: now.toISOString(),
        independent: true,
        evidence: [
          `Synchronous ZeroBounce API response: status=${result.status}; free_email=${result.free_email}; sub_status=${result.sub_status ?? "not supplied"}. Receipt ID is local, not a provider record ID.`,
        ],
      },
    };
  }
}
export function configuredVerificationAdapter(kind: VerificationKind): VerificationAdapter {
  if (kind === "EMAIL" && process.env.EMAIL_VERIFICATION_PROVIDER === "ZEROBOUNCE")
    return new ZeroBounceVerificationAdapter(process.env.ZEROBOUNCE_API_KEY ?? "");
  return new GatewayVerificationAdapter(
    process.env.VERIFICATION_GATEWAY_PROVIDER_ID ?? "UNCONFIGURED",
    process.env.VERIFICATION_GATEWAY_URL ?? "",
    process.env.VERIFICATION_GATEWAY_TOKEN ?? "",
  );
}
