import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import {
  cacheGrantSchema,
  cacheScopeSchema,
  cacheReceiptSchema,
  type CacheScope,
  type CacheReceipt,
} from "@/features/agent-workforce/similarweb-cache";

export const CACHE_RESPONSE_BYTES = 8192;
export const CACHE_TIMEOUT_MS = 3000;
export const cacheHash = (text: string) => createHash("sha256").update(text).digest("hex");
const rowSchema = z.object({
  id: z.string(),
  domain: z.string(),
  country: z.string(),
  created_at: z.string().datetime({ offset: true }),
  result: z.object({
    schemaVersion: z.literal(3),
    domain: z.string(),
    country: z.string(),
    dataMonth: z.string(),
    failed: z.literal(false).optional(),
    brandKeywords: z
      .array(
        z.object({
          keyword: z.string().max(180),
          totalClicks: z.number().finite().nonnegative().nullish(),
          paidClicks: z.number().finite().nonnegative().nullish(),
        }),
      )
      .max(5),
  }),
});
export type CacheReader = (scope: CacheScope, signal: AbortSignal) => Promise<unknown>;
export type CacheBridgeDependencies = {
  mode: "SIMULATED" | "LIVE";
  /** Must be a trusted, revocable server registry, not request/user metadata. */
  resolveGrant(digest: string): unknown;
  readCache: CacheReader;
  now(): Date;
};
const fresh = (at: string, now: Date) =>
  +now >= Date.parse(at) && +now - Date.parse(at) <= 30 * 86400000;
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });

/** Unmounted local handler. No provider, scan, Make, environment or database-client construction. */
export function createCacheOnlyBridge(deps: CacheBridgeDependencies) {
  let active = false;
  return async (request: Request): Promise<Response> => {
    // Publishing and LIVE wiring need separate approval; a runtime flag cannot enable this release.
    if (deps.mode !== "SIMULATED")
      return response({ code: "LIVE_CACHE_ACCESS_NOT_PUBLISHED" }, 503);
    if (request.method !== "POST") return response({ code: "METHOD_NOT_ALLOWED" }, 405);
    const url = new URL(request.url);
    if (
      url.pathname !== "/cache-evidence" ||
      url.search ||
      request.headers.has("origin") ||
      request.headers.get("content-type") !== "application/json" ||
      request.headers.has("content-encoding")
    )
      return response({ code: "INVALID_REQUEST" }, 400);
    const bearer = request.headers
      .get("authorization")
      ?.match(/^Bearer ([a-zA-Z0-9_-]{32,128})$/)?.[1];
    if (!bearer) return response({ code: "NOT_AUTHORIZED" }, 403);
    let grant;
    try {
      const digest = cacheHash(bearer);
      grant = cacheGrantSchema.parse(deps.resolveGrant(digest));
      if (!timingSafeEqual(Buffer.from(digest, "hex"), Buffer.from(grant.tokenSha256, "hex")))
        throw new Error();
      const now = deps.now();
      if (
        grant.revoked ||
        grant.permission.basis !== "FICTIONAL_TEST" ||
        !grant.scope.domain.endsWith(".example") ||
        Date.parse(grant.permission.reviewedAt) > +now ||
        Date.parse(grant.permission.expiresAt) <= +now ||
        Date.parse(grant.permission.reviewedAt) >= Date.parse(grant.permission.expiresAt)
      )
        throw new Error();
    } catch {
      return response({ code: "NOT_AUTHORIZED" }, 403);
    }
    if (active) return response({ code: "CACHE_READER_BUSY" }, 429);
    active = true;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let bodyReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let pendingRead: Promise<unknown> | undefined;
    const work = async () => {
      bodyReader = request.body?.getReader();
      if (!bodyReader) return response({ code: "INVALID_REQUEST" }, 400);
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      for (;;) {
        const chunk = await bodyReader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 2048) return response({ code: "REQUEST_TOO_LARGE" }, 413);
        chunks.push(chunk.value);
      }
      const parsed = cacheScopeSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      if (!parsed.success || !isDeepStrictEqual(parsed.data, grant.scope))
        return response({ code: "NOT_AUTHORIZED" }, 403);
      if (controller.signal.aborted) throw new Error();
      pendingRead = deps.readCache(parsed.data, controller.signal);
      const raw = await pendingRead;
      if (controller.signal.aborted) throw new Error();
      if (raw === null) return response({ code: "CACHE_UNAVAILABLE" }, 404);
      // Bound in-memory processing as well as the final allowlisted response.
      if (Buffer.byteLength(JSON.stringify(raw)) > 65536) throw new Error();
      const row = rowSchema.parse(raw),
        scope = parsed.data;
      if (
        row.id !== scope.recordId ||
        row.domain !== scope.domain ||
        row.country !== scope.country.toLowerCase() ||
        row.result.domain !== row.domain ||
        row.result.country !== row.country ||
        row.result.dataMonth !== scope.month ||
        !fresh(row.created_at, deps.now())
      )
        throw new Error();
      const periodEnd = Date.parse(scope.month + "-01T00:00:00Z");
      const nextMonth = new Date(periodEnd);
      nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
      if (+nextMonth > Date.parse(row.created_at) || +deps.now() - +nextMonth > 90 * 86400000)
        throw new Error();
      const rows = row.result.brandKeywords.filter((k) => k.keyword === scope.keyword);
      if (rows.length !== 1) return response({ code: "CACHE_UNAVAILABLE" }, 404);
      const keyword = rows[0];
      const observation = {
        domain: row.domain,
        country: row.country,
        dataMonth: row.result.dataMonth,
        keyword: keyword.keyword,
        totalClicks: keyword.totalClicks ?? null,
        paidClicks: keyword.paidClicks ?? null,
      };
      const receipt: CacheReceipt = cacheReceiptSchema.parse({
        version: 1,
        mode: "SIMULATED",
        scope,
        provider: "SIMILARWEB",
        origin: "BRAND_SCAN_HUB_NORMALIZED_CACHE",
        cacheSchemaVersion: 3,
        observedAt: row.created_at,
        observationTimeBasis: "CACHE_CREATED_AT_PROVIDER_RETRIEVAL_TIME_UNAVAILABLE",
        device: "total",
        unit: "estimated_keyword_clicks",
        classification: "BRANDED_REQUEST_FILTER_LOCAL_HEURISTIC_UNVERIFIED",
        sourceUrl: "https://bridge.example/cache-evidence/" + row.id,
        permissionReceiptId: grant.permission.receiptId,
        permissionExpiresAt: grant.permission.expiresAt,
        observation,
        observationSha256: cacheHash(JSON.stringify(observation)),
      });
      if (
        Date.parse(grant.permission.expiresAt) <= +deps.now() ||
        !isDeepStrictEqual(cacheGrantSchema.parse(deps.resolveGrant(cacheHash(bearer))), grant)
      )
        return response({ code: "NOT_AUTHORIZED" }, 403);
      if (Buffer.byteLength(JSON.stringify(receipt)) > CACHE_RESPONSE_BYTES) throw new Error();
      return response(receipt);
    };
    try {
      return await Promise.race([
        work(),
        new Promise<Response>((resolve) => {
          timeout = setTimeout(() => {
            controller.abort();
            resolve(response({ code: "CACHE_UNAVAILABLE" }, 503));
          }, CACHE_TIMEOUT_MS);
        }),
      ]);
    } catch {
      return response({ code: "CACHE_UNAVAILABLE" }, 503);
    } finally {
      clearTimeout(timeout);
      controller.abort();
      void bodyReader?.cancel().catch(() => {});
      // If an injected reader ignores abort, don't allow overlapping reads after timeout.
      if (pendingRead)
        void pendingRead.then(
          () => {
            active = false;
          },
          () => {
            active = false;
          },
        );
      else active = false;
    }
  };
}
