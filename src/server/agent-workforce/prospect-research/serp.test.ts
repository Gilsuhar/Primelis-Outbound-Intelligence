// Explicit mocked budget boundary for these isolated, mocked HTTP transport tests.
vi.mock("@/server/agent-workforce/daily/budget", () => ({
  reserveProvider: vi.fn(async () => ({ finish: vi.fn(async () => {}) })),
  unitCost: () => 0.01,
  openAiPricing: () => ({ input: 1, output: 1 }),
  webSearchCost: () => 0.01,
  providerAttempts: (limit: number) => limit,
}));
import { describe, expect, it, vi } from "vitest";
import { observeBrandSerp } from "./serp";
import { workforceIntake, testNow } from "@/test/workforce-fixtures";
const env = {
  SERPAPI_API_KEY: "fictional-test-secret",
  RESEARCH_SERP_LOCATION: "London, England, United Kingdom",
  RESEARCH_SERP_GL: "uk",
};
const payload = () => ({
  search_metadata: {
    status: "Success",
    created_at: "2026-10-15 17:59:00 UTC",
    google_url: "https://www.google.co.uk/search?q=Test+Company",
  },
  search_parameters: {
    engine: "google",
    q: "Test Company",
    device: "desktop",
    gl: "uk",
    location_requested: env.RESEARCH_SERP_LOCATION,
  },
  ads: [
    { title: "Fictional brand ad", link: "https://example.com/shop" },
    { title: "Fictional other advertiser", link: "https://other.example.org/" },
  ],
});
describe("authorized SERP read adapter with fictional HTTP responses", () => {
  it("records actual response context and advertiser domains without competitor/frequency claims", async () => {
    const fetcher = vi.fn(async () => Response.json(payload()));
    const [r] = await observeBrandSerp(workforceIntake, testNow, env, fetcher);
    expect(r.brandAdvertising).toBe("OBSERVED");
    expect(r.otherAdvertiserDomains).toEqual(["other.example.org"]);
    expect(r.observedAt).toBe("2026-10-15T17:59:00.000Z");
    expect(r.device).toBe("desktop");
    expect(r.limitation).toContain("not automatically competitors");
    expect(JSON.stringify(r)).not.toContain("fictional-test-secret");
    const [url, options] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.hostname).toBe("serpapi.com");
    expect(options.redirect).toBe("error");
    expect(options.method ?? "GET").toBe("GET");
  });
  it("reports missing authorization without network requests", async () => {
    const f = vi.fn();
    await expect(observeBrandSerp(workforceIntake, testNow, {}, f)).rejects.toMatchObject({
      code: "DATA_UNAVAILABLE",
    });
    expect(f).not.toHaveBeenCalled();
  });
  it.each([401, 403, 429, 500])(
    "handles HTTP %s without provider body/token leakage",
    async (status) => {
      await expect(
        observeBrandSerp(
          workforceIntake,
          testNow,
          env,
          async () => new Response("secret private provider details", { status }),
        ),
      ).rejects.toMatchObject({ retryable: status >= 429 });
    },
  );
  it.each(["query", "location", "time", "unsafe-ad", "missing-status"])(
    "rejects inconsistent %s",
    async (condition) => {
      const p = payload();
      if (condition === "query") p.search_parameters.q = "Different Company";
      if (condition === "location") p.search_parameters.location_requested = "New York";
      if (condition === "time") p.search_metadata.created_at = "2025-01-01 12:00:00 UTC";
      if (condition === "unsafe-ad") p.ads[0].link = "javascript:alert(1)";
      if (condition === "missing-status") p.search_metadata.status = "Error";
      await expect(
        observeBrandSerp(workforceIntake, testNow, env, async () => Response.json(p)),
      ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    },
  );
});

it("preserves provider Retry-After instead of retrying too early", async () => {
  await expect(
    observeBrandSerp(
      workforceIntake,
      testNow,
      env,
      async () => new Response(null, { status: 429, headers: { "Retry-After": "600" } }),
    ),
  ).rejects.toMatchObject({ retryable: true, retryAfterMs: 600000 });
});
