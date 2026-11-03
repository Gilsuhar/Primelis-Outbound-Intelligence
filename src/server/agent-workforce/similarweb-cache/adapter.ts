import "server-only";
import { isDeepStrictEqual } from "node:util";
import {
  cacheReceiptSchema,
  type CacheScope,
  type CacheReceipt,
} from "@/features/agent-workforce/similarweb-cache";
import { sourceSchema, groundedFactSchema } from "@/features/agent-workforce/gate-a-contracts";
import { cacheHash, CACHE_RESPONSE_BYTES } from "./bridge";

/** Parse only an authenticated bridge receipt, never user-uploaded evidence or approval flags.
 * Expected scope comes from the server's tenant/job binding, not from the received receipt.
 */
export function adaptCacheReceipt(
  raw: unknown,
  expected: CacheScope,
  mode: "SIMULATED" | "LIVE",
  now: Date,
): CacheReceipt {
  if (mode !== "SIMULATED") throw new Error("LIVE_CACHE_ACCESS_NOT_PUBLISHED");
  if (Buffer.byteLength(JSON.stringify(raw)) > CACHE_RESPONSE_BYTES)
    throw new Error("CACHE_RECEIPT_INVALID");
  const r = cacheReceiptSchema.parse(raw),
    o = r.observation;
  const nextMonth = new Date(r.scope.month + "-01T00:00:00Z");
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  if (
    r.mode !== mode ||
    !isDeepStrictEqual(r.scope, expected) ||
    !expected.domain.endsWith(".example") ||
    r.sourceUrl !== "https://bridge.example/cache-evidence/" + expected.recordId ||
    o.domain !== expected.domain ||
    o.country !== expected.country.toLowerCase() ||
    o.dataMonth !== expected.month ||
    o.keyword !== expected.keyword ||
    cacheHash(JSON.stringify(o)) !== r.observationSha256 ||
    Date.parse(r.observedAt) > +now ||
    +now - Date.parse(r.observedAt) > 30 * 86400000 ||
    Date.parse(r.permissionExpiresAt) <= +now ||
    +nextMonth > Date.parse(r.observedAt) ||
    +now - +nextMonth > 90 * 86400000 ||
    (o.totalClicks !== null && o.paidClicks !== null && o.paidClicks > o.totalClicks)
  )
    throw new Error("CACHE_RECEIPT_INVALID");
  return r;
}

/** Exact structured quotation from the receipt, not a fabricated provider narrative. */
export function projectCachedKeyword(receipt: CacheReceipt) {
  const quote = JSON.stringify(receipt.observation);
  const limitations = [
    "Normalized historical cache, not the original Similarweb response; provider retrieval time unavailable. Timestamp is cache creation time.",
    "Estimated keyword clicks across Total devices, not visits, domain totals, live SERP competitors, Google Ads performance or incrementality.",
    "Branded request filter plus local heuristic; classification is unverified. Zero may mean missing/coerced data. No savings established.",
  ];
  const excerpt = [
    receipt.mode === "SIMULATED"
      ? "FICTIONAL OFFLINE CACHE RECEIPT. No real provider observations."
      : "Normalized cache receipt.",
    JSON.stringify({
      recordId: receipt.scope.recordId,
      source: receipt.sourceUrl,
      month: receipt.scope.month,
      country: receipt.scope.country,
      device: receipt.device,
      unit: receipt.unit,
      observedAt: receipt.observedAt,
      observationTimeBasis: receipt.observationTimeBasis,
      classification: receipt.classification,
    }),
    quote,
    ...limitations,
  ].join("\n");
  const source = sourceSchema.parse({
    id: "web:" + cacheHash(receipt.sourceUrl + excerpt).slice(0, 20),
    url: receipt.sourceUrl,
    title: "Fictional normalized Similarweb cache: estimated keyword clicks",
    excerpt,
    observedAt: receipt.observedAt,
    sourceType: "AUTHORIZED_PROVIDER",
  });
  const facts = (["paidClicks", "totalClicks"] as const).flatMap((field, i) => {
    const value = receipt.observation[field];
    if (value === null || value === 0) return [];
    return [
      groundedFactSchema.parse({
        id: `account:signal-cache-${i + 1}`,
        subject: "ACCOUNT",
        category: "MARKETS",
        confidence: "MEDIUM",
        statement: `The fictional Brand Scan Hub cache for ${receipt.scope.domain} reports ${value} estimated ${field === "paidClicks" ? "paid" : "total"} keyword clicks for "${receipt.scope.keyword}" in ${receipt.scope.country}, ${receipt.scope.month}, combined devices. This is a cached estimate, not verified account performance.`,
        sourceIds: [source.id],
        quotes: [{ sourceId: source.id, text: quote }],
        limitations,
      }),
    ];
  });
  return {
    source,
    facts,
    blockers: [
      "NORMALIZED_CACHE_RAW_PROVIDER_PROVENANCE_AND_BRAND_CLASSIFICATION_UNVERIFIED",
      ...(facts.length < 2 ? ["CACHE_CLICK_METRICS_UNAVAILABLE_OR_ZERO_AMBIGUOUS"] : []),
    ],
  };
}
