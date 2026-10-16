import "server-only";
export class IntegrationError extends Error {
  constructor(
    public readonly code:
      | "DISCONNECTED"
      | "PERMISSION_MISSING"
      | "RATE_LIMITED"
      | "UNAVAILABLE"
      | "INVALID_RESPONSE"
      | "CONFIGURATION",
    public readonly status?: number,
    public readonly retryAfterMs = 0,
  ) {
    super(`${code}${status ? ` (HTTP ${status})` : ""}`);
  }
}
export type TransportOptions = {
  fetcher?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  attempts?: number;
  deadline?: number;
};
/** Only read operations (plus OAuth token exchange) are reachable. Never accepts arbitrary hosts. */
export class ReadTransport {
  constructor(
    readonly host: "https://api.hubapi.com" | "https://api.outreach.io",
    private readonly token: () => Promise<string>,
    private readonly options: TransportOptions = {},
  ) {}
  async read(path: string, body?: unknown): Promise<unknown> {
    const url = new URL(path, this.host);
    const search =
      this.host === "https://api.hubapi.com" && url.pathname === "/crm/v3/objects/contacts/search";
    if (
      url.origin !== this.host ||
      url.username ||
      url.password ||
      url.hash ||
      !path.startsWith("/") ||
      (body !== undefined && !search)
    )
      throw new IntegrationError("CONFIGURATION");
    const allowed =
      this.host === "https://api.hubapi.com"
        ? /^\/crm\/(?:v3\/(?:objects\/(?:contacts|companies|deals|emails)(?:\/[A-Za-z0-9_-]+)?|pipelines\/deals)|v4\/objects\/(?:contacts|companies)\/[A-Za-z0-9_-]+\/associations\/(?:companies|deals|emails))$/
        : /^\/api\/v2\/(?:prospects|accounts|mailings|sequenceStates)(?:\/[A-Za-z0-9_-]+)?$/;
    if (!allowed.test(url.pathname)) throw new IntegrationError("CONFIGURATION");
    for (let attempt = 0; attempt < (this.options.attempts ?? 3); attempt++) {
      if (this.options.deadline && Date.now() >= this.options.deadline)
        throw new IntegrationError("UNAVAILABLE");
      let response: Response;
      try {
        response = await (this.options.fetcher ?? fetch)(url, {
          method: search && body !== undefined ? "POST" : "GET",
          headers: {
            Authorization: `Bearer ${await this.token()}`,
            "Content-Type": "application/json",
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          signal: AbortSignal.timeout(
            Math.max(
              1,
              Math.min(10000, (this.options.deadline ?? Date.now() + 10000) - Date.now()),
            ),
          ),
          redirect: "error",
          cache: "no-store",
        });
      } catch (error) {
        if (error instanceof IntegrationError) throw error;
        if (attempt + 1 >= (this.options.attempts ?? 3)) throw new IntegrationError("UNAVAILABLE");
        await this.delay(300 * 2 ** attempt);
        continue;
      }
      if (response.ok) {
        try {
          return await response.json();
        } catch {
          throw new IntegrationError("INVALID_RESPONSE");
        }
      }
      if (response.status === 401) throw new IntegrationError("DISCONNECTED", 401);
      if (response.status === 403) throw new IntegrationError("PERMISSION_MISSING", 403);
      const retry = response.headers.get("retry-after");
      const retryMs = retry
        ? /^\d+(\.\d+)?$/.test(retry)
          ? Number(retry) * 1000
          : Math.max(0, Date.parse(retry) - Date.now())
        : 300 * 2 ** attempt;
      if (
        (response.status === 429 || response.status >= 500) &&
        attempt + 1 < (this.options.attempts ?? 3) &&
        retryMs <= 2000
      ) {
        await this.delay(retryMs);
        continue;
      }
      throw new IntegrationError(
        response.status === 429 ? "RATE_LIMITED" : "UNAVAILABLE",
        response.status,
        Number.isFinite(retryMs) ? Math.max(1000, retryMs) : 60000,
      );
    }
    throw new IntegrationError("UNAVAILABLE");
  }
  private delay(ms: number) {
    return (
      this.options.sleep ?? ((delay) => new Promise<void>((resolve) => setTimeout(resolve, delay)))
    )(ms);
  }
}
/** Reject pagination which changes resource, identity filters, host or moves backwards. */
export function nextReadPage(current: string, next: string, host: string): string {
  const previous = new URL(current, host),
    url = new URL(next, previous);
  if (
    url.origin !== host ||
    url.pathname !== previous.pathname ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new IntegrationError("INVALID_RESPONSE");
  for (const [key, value] of previous.searchParams) {
    if (key.startsWith("filter[") && url.searchParams.get(key) !== value)
      throw new IntegrationError("INVALID_RESPONSE");
  }
  const offset = Number(url.searchParams.get("page[offset]"));
  if (
    url.searchParams.has("page[offset]") &&
    (!Number.isSafeInteger(offset) ||
      offset <= Number(previous.searchParams.get("page[offset]") ?? 0))
  )
    throw new IntegrationError("INVALID_RESPONSE");
  return url.pathname + url.search;
}
