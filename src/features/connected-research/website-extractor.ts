import type { WebsiteFinding } from "./types";

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pageTitle(html: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return title?.replace(/\s+/g, " ").trim() || "Company website";
}

function excerptAround(text: string, pattern: RegExp) {
  const match = pattern.exec(text);
  if (!match) return "";
  const start = Math.max(match.index - 80, 0);
  return text.slice(start, start + 220).trim();
}

function finding(input: {
  field: string;
  value: string;
  factStatus: WebsiteFinding["factStatus"];
  sourceTitle: string;
  sourceUrl: string;
  retrievedAt: string;
  excerpt: string;
  confidence: WebsiteFinding["confidence"];
  inferenceExplanation?: string;
}): WebsiteFinding {
  return {
    ...input,
    evidenceType: input.factStatus === "INFERRED" ? "INFERENCE" : "DIRECT_SOURCE",
    reviewStatus: "PENDING",
  };
}

export function extractWebsiteFindings(page: {
  url: string;
  body: string;
  contentType: string;
  retrievedAt: string;
}) {
  const text = page.contentType.includes("html")
    ? stripHtml(page.body)
    : page.body.replace(/\s+/g, " ").trim();
  const title = page.contentType.includes("html") ? pageTitle(page.body) : "Company website";
  const findings: WebsiteFinding[] = [];
  const lower = text.toLowerCase();

  if (/\be-?commerce\b|online store|shop online|direct to consumer|d2c/i.test(text)) {
    findings.push(
      finding({
        field: "companyType",
        value: "E_COMMERCE",
        factStatus: "INFERRED",
        sourceTitle: title,
        sourceUrl: page.url,
        retrievedAt: page.retrievedAt,
        excerpt: excerptAround(
          text,
          /\be-?commerce\b|online store|shop online|direct to consumer|d2c/i,
        ),
        confidence: "Medium",
        inferenceExplanation: "The public website uses e-commerce or direct-to-consumer language.",
      }),
    );
  }
  if (/b2b|enterprise|businesses|companies|teams/i.test(text)) {
    findings.push(
      finding({
        field: "companyType",
        value: "B2B",
        factStatus: "INFERRED",
        sourceTitle: title,
        sourceUrl: page.url,
        retrievedAt: page.retrievedAt,
        excerpt: excerptAround(text, /b2b|enterprise|businesses|companies|teams/i),
        confidence: "Low",
        inferenceExplanation: "The public website appears to address business customers.",
      }),
    );
  }
  if (
    /fashion|luxury|retail|saas|software|fintech|travel|marketplace|subscription|insurance/i.test(
      text,
    )
  ) {
    findings.push(
      finding({
        field: "industry",
        value:
          text.match(
            /fashion|luxury|retail|saas|software|fintech|travel|marketplace|subscription|insurance/i,
          )?.[0] ?? "Unknown",
        factStatus: "VERIFIED",
        sourceTitle: title,
        sourceUrl: page.url,
        retrievedAt: page.retrievedAt,
        excerpt: excerptAround(
          text,
          /fashion|luxury|retail|saas|software|fintech|travel|marketplace|subscription|insurance/i,
        ),
        confidence: "Medium",
      }),
    );
  }
  if (
    /global|international|countries|regions|north america|europe|asia|emea|apac|united states|uk|france|germany/i.test(
      text,
    )
  ) {
    findings.push(
      finding({
        field: "marketsOrCountries",
        value: "International or multi-market footprint",
        factStatus: "INFERRED",
        sourceTitle: title,
        sourceUrl: page.url,
        retrievedAt: page.retrievedAt,
        excerpt: excerptAround(
          text,
          /global|international|countries|regions|north america|europe|asia|emea|apac|united states|uk|france|germany/i,
        ),
        confidence: "Medium",
        inferenceExplanation:
          "The website references countries, regions, or international presence.",
      }),
    );
    findings.push(
      finding({
        field: "multiMarketOrBrandComplexity",
        value: "YES",
        factStatus: "INFERRED",
        sourceTitle: title,
        sourceUrl: page.url,
        retrievedAt: page.retrievedAt,
        excerpt: excerptAround(
          text,
          /global|international|countries|regions|north america|europe|asia|emea|apac/i,
        ),
        confidence: "Low",
        inferenceExplanation:
          "Multi-market complexity is inferred from public regional language and requires review.",
      }),
    );
  }
  if (
    /paid search|sem|ppc|performance marketing|growth marketing|acquisition|digital marketing|e-?commerce manager/i.test(
      text,
    )
  ) {
    findings.push(
      finding({
        field: "knownPaidSearchOwner",
        value:
          "Public role signal for Paid Search, Performance, Growth, Acquisition, Digital Marketing, or E-commerce",
        factStatus: "VERIFIED",
        sourceTitle: title,
        sourceUrl: page.url,
        retrievedAt: page.retrievedAt,
        excerpt: excerptAround(
          text,
          /paid search|sem|ppc|performance marketing|growth marketing|acquisition|digital marketing|e-?commerce manager/i,
        ),
        confidence: "Medium",
      }),
    );
  }

  if (!lower.includes("revenue") && !lower.includes("employees")) {
    findings.push(
      finding({
        field: "revenueContext",
        value: "Unknown",
        factStatus: "UNKNOWN",
        sourceTitle: title,
        sourceUrl: page.url,
        retrievedAt: page.retrievedAt,
        excerpt: "No supported public revenue evidence found on this page.",
        confidence: "Low",
      }),
    );
  }

  return findings;
}
