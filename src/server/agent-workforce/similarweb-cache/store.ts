import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CacheReader } from "./bridge";

/** Deployment handoff only: reuse Brand Scan Hub's server client; never construct/copy credentials.
 * Call ONLY after bridge authorization. scans has no verified tenant column: the trusted grant
 * binds a tenant/application to an explicitly approved record; never authorize by domain alone.
 * No scan handler imports, writes, RPCs, provider fallback, Make or broad scan listings.
 */
export function existingScansReader(client: Pick<SupabaseClient, "from">): CacheReader {
  return async (scope, signal) => {
    const { data, error } = await client
      .from("scans")
      .select("id,domain,country,created_at,result")
      .eq("id", scope.recordId)
      .eq("domain", scope.domain)
      .eq("country", scope.country.toLowerCase())
      .eq("result->>dataMonth", scope.month)
      .abortSignal(signal)
      .maybeSingle();
    if (error) throw new Error("CACHE_UNAVAILABLE");
    return data;
  };
}
