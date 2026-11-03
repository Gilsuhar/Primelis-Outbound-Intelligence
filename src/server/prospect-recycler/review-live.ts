import "server-only";
import { assertPreviewOperation } from "@/lib/preview-policy.mjs";
import { createLocalRecyclerReaders } from "./connection";
import { loadRecyclerReview, type ReviewSource } from "./review";
import { IntegrationError } from "../integrations/http";
import { nextOutreach, outreachPage } from "./shared";

/** One attempt per resource. Any provider/unsafe-pagination error stops subsequent network calls. */
export function reviewFetch(fetcher: typeof fetch, maxRequests = 60) {
  let requests = 0;
  let stopped = false;
  const visited = new Set<string>();
  const guarded: typeof fetch = async (target, options) => {
    assertPreviewOperation("external-provider");
    if (stopped) throw new IntegrationError("UNAVAILABLE");
    try {
      const url = new URL(String(target));
      const hs = url.origin === "https://api.hubapi.com";
      const outreach = url.origin === "https://api.outreach.io";
      if (
        (!hs && !outreach) ||
        url.username ||
        url.password ||
        url.hash ||
        options?.redirect !== "error" ||
        (options.method !== "GET" &&
          !(hs && url.pathname === "/crm/v3/objects/contacts/search" && options.method === "POST"))
      )
        throw new IntegrationError("CONFIGURATION");
      const key = url.href + (typeof options.body === "string" ? options.body : "");
      if (visited.has(key)) throw new IntegrationError("INVALID_RESPONSE");
      if (requests >= maxRequests) throw new IntegrationError("UNAVAILABLE");
      visited.add(key);
      requests++;
      const response = await fetcher(target, options);
      if (!response.ok)
        throw new IntegrationError(
          response.status === 401
            ? "DISCONNECTED"
            : response.status === 403
              ? "PERMISSION_MISSING"
              : response.status === 429
                ? "RATE_LIMITED"
                : "UNAVAILABLE",
          response.status,
        );
      if (outreach && /^\/api\/v2\/(prospects|mailings|sequenceStates)$/.test(url.pathname)) {
        const page = outreachPage.parse(await response.clone().json());
        if (page.links?.next) {
          const next = new URL(nextOutreach(url.pathname + url.search, page.links.next), url);
          const allowed = new Set([...url.searchParams.keys(), "page[after]", "page[offset]"]);
          if (visited.has(next.href)) throw new IntegrationError("INVALID_RESPONSE");
          for (const key of next.searchParams.keys())
            if (!allowed.has(key) || next.searchParams.getAll(key).length !== 1)
              throw new IntegrationError("INVALID_RESPONSE");
          if (
            next.searchParams.get("count") !== "false" ||
            next.searchParams.get("page[size]") !== url.searchParams.get("page[size]")
          )
            throw new IntegrationError("INVALID_RESPONSE");
        }
      }
      return response;
    } catch (error) {
      stopped = true;
      throw error instanceof IntegrationError ? error : new IntegrationError("INVALID_RESPONSE");
    }
  };
  return guarded;
}
const running = new Set<string>();
export async function liveRecyclerReview(actor: string, source: ReviewSource) {
  if (running.has(actor)) throw new Error("RECYCLER_BUSY");
  running.add(actor);
  try {
    const asOf = new Date().toISOString();
    // Existing local operator/credential guards; Outreach access(false), never token rotation.
    const readers = createLocalRecyclerReaders(actor, asOf, {
      maxPages: 2,
      maxRequestsPerProvider: 60,
      fetcher: reviewFetch(fetch),
    });
    return await loadRecyclerReview({ readers, asOf, mode: "LIVE", source, limit: 5 });
  } finally {
    running.delete(actor);
  }
}
