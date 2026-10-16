import "server-only";
import { z } from "zod";
import { createHash } from "node:crypto";
import {
  serpObservationSchema,
  type SerpObservation,
} from "@/features/agent-workforce/prospect-research-contracts";
import type { WorkforceIntake } from "@/features/agent-workforce/gate-a-contracts";
export class ResearchProviderError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    message: string,
    readonly retryAfterMs = 0,
  ) {
    super(message);
  }
}
const responseSchema = z.object({
  search_metadata: z.object({
    status: z.literal("Success"),
    created_at: z.string(),
    google_url: z.string().url(),
  }),
  search_parameters: z.object({
    engine: z.literal("google"),
    q: z.string(),
    device: z.string(),
    gl: z.string(),
    location_requested: z.string(),
  }),
  ads: z
    .array(z.object({ title: z.string(), link: z.string().url() }))
    .max(30)
    .optional(),
});
const domain = (raw: string) => new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
/** Paid API access must be authorized by the operator. Search discovery is never substituted for ads. */
export async function observeBrandSerp(
  input: WorkforceIntake,
  now: Date,
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
): Promise<SerpObservation[]> {
  if (!env.SERPAPI_API_KEY || !env.RESEARCH_SERP_LOCATION || !env.RESEARCH_SERP_GL)
    throw new ResearchProviderError(
      "DATA_UNAVAILABLE",
      false,
      "Authorized SerpApi Google Search API access requires SERPAPI_API_KEY, RESEARCH_SERP_LOCATION and RESEARCH_SERP_GL. No SERP observations were substituted.",
    );
  const query = input.companyName;
  const url = new URL("https://serpapi.com/search.json");
  for (const [key, value] of Object.entries({
    engine: "google",
    q: query,
    device: "desktop",
    gl: env.RESEARCH_SERP_GL,
    location: env.RESEARCH_SERP_LOCATION,
    api_key: env.SERPAPI_API_KEY,
    no_cache: "true",
  }))
    url.searchParams.set(key, value);
  let response: Response;
  try {
    response = await fetcher(url, { redirect: "error", signal: AbortSignal.timeout(20000) });
  } catch {
    throw new ResearchProviderError(
      "NETWORK_ERROR",
      true,
      "SERP provider connection failed; no observation accepted",
    );
  }
  if (!response.ok)
    throw new ResearchProviderError(
      [401, 403].includes(response.status) ? "PERMISSION_MISSING" : `HTTP_${response.status}`,
      response.status === 429 || response.status >= 500,
      `SERP provider HTTP ${response.status}; provider body withheld`,
      (() => {
        const raw = response.headers.get("retry-after");
        if (!raw) return 0;
        const delay = /^\d+$/.test(raw) ? Number(raw) * 1000 : Date.parse(raw) - now.getTime();
        return Number.isFinite(delay) ? Math.max(0, Math.min(delay, 24 * 3600000)) : 0;
      })(),
    );
  let data: z.infer<typeof responseSchema>;
  try {
    data = responseSchema.parse(await response.json());
  } catch {
    throw new ResearchProviderError(
      "INVALID_RESPONSE",
      false,
      "SERP provider response incomplete or invalid",
    );
  }
  const params = data.search_parameters;
  const observedAt = new Date(
    data.search_metadata.created_at.replace(" UTC", "Z").replace(" ", "T"),
  );
  if (
    params.q !== query ||
    params.device !== "desktop" ||
    params.gl !== env.RESEARCH_SERP_GL ||
    params.location_requested !== env.RESEARCH_SERP_LOCATION ||
    !Number.isFinite(observedAt.getTime()) ||
    observedAt.getTime() > now.getTime() ||
    now.getTime() - observedAt.getTime() > 86400000 ||
    !/^https:\/\/(www\.)?google\.[a-z.]+\//.test(data.search_metadata.google_url)
  )
    throw new ResearchProviderError(
      "INVALID_RESPONSE",
      false,
      "SERP query, market, time or source does not match the request",
    );
  const ads = (data.ads ?? [])
    .map((a) => ({ title: a.title, url: a.link }))
    .filter((a) => {
      const u = new URL(a.url);
      return u.protocol === "https:" && !u.username && !u.password;
    });
  if (ads.length !== (data.ads ?? []).length)
    throw new ResearchProviderError("INVALID_RESPONSE", false, "Unsafe ad source rejected");
  const ownDomain = input.companyDomain.replace(/^www\./, "");
  const other = [
    ...new Set(
      ads.map((a) => domain(a.url)).filter((d) => d !== ownDomain && !d.endsWith("." + ownDomain)),
    ),
  ];
  return [
    serpObservationSchema.parse({
      id:
        "serp:" +
        createHash("sha256")
          .update(query + observedAt.toISOString() + JSON.stringify(ads))
          .digest("hex")
          .slice(0, 20),
      query,
      location: env.RESEARCH_SERP_LOCATION,
      country: env.RESEARCH_SERP_GL,
      device: "desktop",
      observedAt: observedAt.toISOString(),
      sourceUrl: data.search_metadata.google_url,
      provider: "SERPAPI",
      ads,
      brandAdvertising: ads.some(
        (a) => domain(a.url) === ownDomain || domain(a.url).endsWith("." + ownDomain),
      )
        ? "OBSERVED"
        : "NOT_OBSERVED",
      otherAdvertiserDomains: other,
      limitation:
        "One third-party SERP snapshot; other advertisers are not automatically competitors. Absence in this response does not prove no competition. No CPC, spend, incrementality or frequency measurement.",
      captureRecommendation: `Manually capture Google results for ${query}, ${env.RESEARCH_SERP_LOCATION}, desktop, matching this observation; record timestamp and independently verify advertiser identities. No screenshot has been created.`,
    }),
  ];
}
