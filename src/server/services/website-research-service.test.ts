import { describe, expect, it } from "vitest";

import { validatePublicCompanyUrl } from "@/features/connected-research/url-safety";
import type { WebsiteResearchResult } from "@/features/connected-research/types";

import {
  researchCompanyWebsite,
  type WebsiteFetchResponse,
  type WebsiteResearchPersistence,
} from "./website-research-service";

function response(url: string, body: string, contentType = "text/html"): WebsiteFetchResponse {
  return {
    url,
    status: 200,
    headers: { "content-type": contentType },
    text: async () => body,
  };
}

function persistence() {
  const persisted: Array<Omit<WebsiteResearchResult, "researchId">> = [];
  const adapter: WebsiteResearchPersistence = {
    getActor: async (actorId) => ({ id: actorId, role: "SALES_USER" }),
    persistResearch: async ({ result }) => {
      persisted.push(result);
      return "research-id";
    },
  };
  return { adapter, persisted };
}

describe("website research foundation", () => {
  it("accepts valid public company URLs and rejects unsafe targets", () => {
    expect(validatePublicCompanyUrl("https://example.com").ok).toBe(true);
    expect(validatePublicCompanyUrl("ftp://example.com")).toMatchObject({
      ok: false,
      code: "UNSUPPORTED_PROTOCOL",
    });
    expect(validatePublicCompanyUrl("http://localhost")).toMatchObject({
      ok: false,
      code: "INTERNAL_HOST",
    });
    expect(validatePublicCompanyUrl("http://127.0.0.1")).toMatchObject({
      ok: false,
      code: "PRIVATE_IP",
    });
    expect(validatePublicCompanyUrl("http://192.168.1.10")).toMatchObject({
      ok: false,
      code: "PRIVATE_IP",
    });
    expect(validatePublicCompanyUrl("https://user:pass@example.com")).toMatchObject({
      ok: false,
      code: "EMBEDDED_CREDENTIALS",
    });
  });

  it("extracts sourced public facts, preserves unknowns, and enforces same-domain page limits", async () => {
    const { adapter, persisted } = persistence();
    const fetcher = async (url: string) => {
      if (url.endsWith("/")) {
        return response(
          url,
          `<title>Acme</title><a href="/about">About</a><a href="/careers">Careers</a><a href="/pricing.pdf">PDF</a>${Array.from({ length: 20 }, (_, i) => `<a href="/solutions-${i}">Solutions</a>`).join("")}Acme is a global e-commerce retail company serving the United States and Europe.`,
        );
      }
      return response(
        url,
        `<title>Acme page</title>We hire Performance Marketing and Paid Search roles for international regions. No revenue, spend, ad activity, or organic visibility is stated.`,
      );
    };

    const result = await researchCompanyWebsite(
      { companyName: "Acme", companyUrl: "https://example.com/" },
      { persistence: adapter, fetcher, now: () => new Date("2026-01-01T00:00:00Z") },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.requestedUrls.length).toBeLessThanOrEqual(9);
      expect(
        result.data.findings.some(
          (finding) => finding.field === "industry" && finding.factStatus === "VERIFIED",
        ),
      ).toBe(true);
      expect(
        result.data.findings.some(
          (finding) => finding.factStatus === "INFERRED" && finding.inferenceExplanation,
        ),
      ).toBe(true);
      expect(
        result.data.findings.some(
          (finding) => finding.field === "revenueContext" && finding.factStatus === "UNKNOWN",
        ),
      ).toBe(true);
      expect(persisted[0].findings[0]).toHaveProperty("sourceUrl");
    }
  });

  it("rejects unsafe redirects, unsupported content, oversized responses, and reports fetch failure", async () => {
    const { adapter } = persistence();
    const unsafe = await researchCompanyWebsite(
      { companyName: "Acme", companyUrl: "https://example.com" },
      { persistence: adapter, fetcher: async () => response("http://127.0.0.1/admin", "nope") },
    );
    const binary = await researchCompanyWebsite(
      { companyName: "Acme", companyUrl: "https://example.com" },
      {
        persistence: adapter,
        fetcher: async () => response("https://example.com", "bin", "application/octet-stream"),
      },
    );
    const huge = await researchCompanyWebsite(
      { companyName: "Acme", companyUrl: "https://example.com" },
      {
        persistence: adapter,
        fetcher: async () => response("https://example.com", "x".repeat(260_000)),
      },
    );
    const timeout = await researchCompanyWebsite(
      { companyName: "Acme", companyUrl: "https://example.com" },
      {
        persistence: adapter,
        fetcher: async () => {
          throw new Error("AbortError");
        },
      },
    );

    expect(unsafe).toMatchObject({ ok: false, code: "UNSAFE_REDIRECT" });
    expect(binary).toMatchObject({ ok: false, code: "UNSUPPORTED_CONTENT_TYPE" });
    expect(huge).toMatchObject({ ok: false, code: "RESPONSE_TOO_LARGE" });
    expect(timeout).toMatchObject({ ok: false, code: "FETCH_FAILED" });
  });
});
