import { z } from "zod";

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const domain = z
  .string()
  .max(240)
  .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/);
const keyword = z
  .string()
  .min(1)
  .max(180)
  .refine(
    (s) =>
      s === s.trim() &&
      !/[\x00-\x1f@<>]|Bearer\s|\bsk-|password|api[_ -]?key|access[_ -]?token|secret|https?:|postgres:/i.test(
        s,
      ),
  );
export const cacheScopeSchema = z
  .object({
    tenantId: id,
    applicationId: z.literal("agent-workforce"),
    recordId: id,
    domain,
    country: z.string().regex(/^[A-Z]{2}$/),
    month: z.string().regex(/^20\d{2}-(?:0[1-9]|1[0-2])$/),
    keyword,
  })
  .strict();
export type CacheScope = z.infer<typeof cacheScopeSchema>;
export const cacheObservationSchema = z
  .object({
    domain,
    country: z.string().regex(/^[a-z]{2}$/),
    dataMonth: z.string().regex(/^20\d{2}-(?:0[1-9]|1[0-2])$/),
    keyword,
    totalClicks: z.number().finite().nonnegative().nullable(),
    paidClicks: z.number().finite().nonnegative().nullable(),
  })
  .strict();
/** A minimized normalized-cache receipt, never represented as the original provider response. */
export const cacheReceiptSchema = z
  .object({
    version: z.literal(1),
    mode: z.enum(["SIMULATED", "LIVE"]),
    scope: cacheScopeSchema,
    provider: z.literal("SIMILARWEB"),
    origin: z.literal("BRAND_SCAN_HUB_NORMALIZED_CACHE"),
    cacheSchemaVersion: z.literal(3),
    observedAt: z.string().datetime({ offset: true }),
    observationTimeBasis: z.literal("CACHE_CREATED_AT_PROVIDER_RETRIEVAL_TIME_UNAVAILABLE"),
    device: z.literal("total"),
    unit: z.literal("estimated_keyword_clicks"),
    classification: z.literal("BRANDED_REQUEST_FILTER_LOCAL_HEURISTIC_UNVERIFIED"),
    sourceUrl: z
      .string()
      .url()
      .max(300)
      .refine((s) =>
        /^https:\/\/(?:prime-signal\.com|bridge\.example)\/cache-evidence\/[a-zA-Z0-9_-]+$/.test(s),
      ),
    permissionReceiptId: id,
    permissionExpiresAt: z.string().datetime({ offset: true }),
    observation: cacheObservationSchema,
    observationSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type CacheReceipt = z.infer<typeof cacheReceiptSchema>;

/** Trusted server registry only. Client assertions never establish license or tenant access. */
export const cacheGrantSchema = z
  .object({
    scope: cacheScopeSchema,
    tokenSha256: z.string().regex(/^[a-f0-9]{64}$/),
    revoked: z.boolean(),
    permission: z
      .object({
        receiptId: id,
        reviewedBy: id,
        reviewedAt: z.string().datetime({ offset: true }),
        expiresAt: z.string().datetime({ offset: true }),
        basis: z.enum(["FICTIONAL_TEST", "VERIFIED_LICENSE"]),
        licensedCacheAccess: z.literal(true),
        crossApplicationReuse: z.literal(true),
        purpose: z.literal("SIGNAL_OPPORTUNITY_RESEARCH"),
      })
      .strict(),
  })
  .strict();
export type CacheGrant = z.infer<typeof cacheGrantSchema>;
