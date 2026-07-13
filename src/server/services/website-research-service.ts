import { randomUUID } from "node:crypto";

import { z } from "zod";

import { extractWebsiteFindings } from "@/features/connected-research/website-extractor";
import {
  isSameNormalizedDomain,
  validatePublicCompanyUrl,
} from "@/features/connected-research/url-safety";
import type { WebsiteFinding, WebsiteResearchResult } from "@/features/connected-research/types";
import { prisma, type MinimalPrismaClient } from "@/lib/prisma";

import { err, ok } from "./result";

const researchInputSchema = z.object({
  companyName: z.string().trim().min(1).max(180),
  companyUrl: z.string().trim().min(3).max(240),
  creatorId: z.string().trim().min(1).optional(),
});

type Row = Record<string, unknown>;

export type WebsiteFetchResponse = {
  url: string;
  status: number;
  headers: Record<string, string>;
  text(): Promise<string>;
};

export type WebsiteFetcher = (
  url: string,
  options: { timeoutMs: number; maxRedirects: number; userAgent: string },
) => Promise<WebsiteFetchResponse>;

export type WebsiteResearchPersistence = {
  getActor(actorId: string): Promise<{ id: string; role: string } | null>;
  persistResearch(input: {
    creatorId: string;
    companyName: string;
    normalizedDomain: string;
    result: Omit<WebsiteResearchResult, "researchId">;
  }): Promise<string>;
};

export type WebsiteResearchDependencies = {
  fetcher?: WebsiteFetcher;
  persistence?: WebsiteResearchPersistence;
  now?: () => Date;
};

const maxPages = 9;
const maxBytesPerPage = 250_000;
const timeoutMs = 7000;
const maxRedirects = 3;
const userAgent = "Primelis-Outbound-Research/1.0 (+public-company-research)";

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function header(headers: Record<string, string>, name: string) {
  const match = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return match?.[1] ?? "";
}

function relevantSameDomainLinks(html: string, baseUrl: string, normalizedDomain: string) {
  const candidates = Array.from(html.matchAll(/href=["']([^"']+)["']/gi))
    .map((match) => match[1])
    .filter((href) =>
      /about|company|product|solution|industr|location|contact|career|investor|region|country/i.test(
        href,
      ),
    )
    .map((href) => {
      try {
        return new URL(href, baseUrl).toString();
      } catch {
        return "";
      }
    })
    .filter(Boolean)
    .filter((url) => isSameNormalizedDomain(url, normalizedDomain));
  return Array.from(new Set(candidates)).slice(0, maxPages - 1);
}

async function defaultFetcher(
  url: string,
  options: { timeoutMs: number; maxRedirects: number; userAgent: string },
): Promise<WebsiteFetchResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "user-agent": options.userAgent,
        accept: "text/html,text/plain;q=0.9",
      },
    });
    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      if (options.maxRedirects <= 0) {
        throw new Error("REDIRECT_LIMIT");
      }
      const next = new URL(response.headers.get("location") ?? "", url).toString();
      const checked = validatePublicCompanyUrl(next);
      if (!checked.ok) {
        throw new Error("UNSAFE_REDIRECT");
      }
      return defaultFetcher(next, { ...options, maxRedirects: options.maxRedirects - 1 });
    }
    return {
      url: response.url,
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      text: () => response.text(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export class PrismaWebsiteResearchPersistence implements WebsiteResearchPersistence {
  constructor(private readonly client: MinimalPrismaClient = prisma) {}

  async getActor(actorId: string) {
    const rows = await this.client.$queryRaw<Row[]>`
      SELECT id, role
      FROM "User"
      WHERE id = ${actorId}
      LIMIT 1
    `;
    const row = rows[0];
    return row ? { id: asString(row.id), role: asString(row.role) } : null;
  }

  async persistResearch({
    creatorId,
    companyName,
    normalizedDomain,
    result,
  }: {
    creatorId: string;
    companyName: string;
    normalizedDomain: string;
    result: Omit<WebsiteResearchResult, "researchId">;
  }) {
    const id = randomUUID();
    await this.client.$executeRaw`
      INSERT INTO "WebsiteResearchRun" (
        id,
        "userId",
        "companyName",
        "normalizedDomain",
        "researchStatus",
        "requestedUrls",
        "fetchedUrls",
        "failedUrls",
        findings,
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${id},
        ${creatorId},
        ${companyName},
        ${normalizedDomain},
        ${result.status},
        ${result.requestedUrls}::text[],
        ${result.fetchedUrls}::text[],
        ${result.failedUrls}::text[],
        ${JSON.stringify(result.findings)}::jsonb,
        NOW(),
        NOW()
      )
    `;
    return id;
  }
}

async function fetchPage(
  url: string,
  normalizedDomain: string,
  fetcher: WebsiteFetcher,
  retrievedAt: string,
) {
  const response = await fetcher(url, { timeoutMs, maxRedirects, userAgent });
  if (!isSameNormalizedDomain(response.url, normalizedDomain)) {
    throw new Error("UNSAFE_REDIRECT");
  }
  const contentType = header(response.headers, "content-type").toLowerCase();
  if (!/text\/html|text\/plain/.test(contentType)) {
    throw new Error("UNSUPPORTED_CONTENT_TYPE");
  }
  const body = await response.text();
  if (Buffer.byteLength(body, "utf8") > maxBytesPerPage) {
    throw new Error("RESPONSE_TOO_LARGE");
  }
  return {
    url: response.url,
    body,
    contentType,
    retrievedAt,
  };
}

export async function researchCompanyWebsite(
  rawInput: unknown,
  dependencies: WebsiteResearchDependencies = {},
) {
  const parsed = researchInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", "Website research input is malformed.");
  }

  const checked = validatePublicCompanyUrl(parsed.data.companyUrl);
  if (!checked.ok) {
    return err(checked.code, checked.message);
  }

  const creatorId = parsed.data.creatorId ?? "seed-sales-user";
  const persistence = dependencies.persistence ?? new PrismaWebsiteResearchPersistence();
  const actor = await persistence.getActor(creatorId);
  if (!actor || !["SALES_USER", "KNOWLEDGE_ADMIN"].includes(actor.role)) {
    return err("FORBIDDEN", "Only authorized sales or knowledge users can research websites.");
  }

  const fetcher = dependencies.fetcher ?? defaultFetcher;
  const now = dependencies.now ?? (() => new Date());
  const requestedUrls = [checked.url.toString()];
  const fetchedUrls: string[] = [];
  const failedUrls: string[] = [];
  const findings: WebsiteFinding[] = [];
  const warnings: string[] = [];

  try {
    const homepage = await fetchPage(
      checked.url.toString(),
      checked.normalizedDomain,
      fetcher,
      now().toISOString(),
    );
    fetchedUrls.push(homepage.url);
    findings.push(...extractWebsiteFindings(homepage));
    const links = homepage.contentType.includes("html")
      ? relevantSameDomainLinks(homepage.body, homepage.url, checked.normalizedDomain)
      : [];
    requestedUrls.push(...links);
    for (const link of links.slice(0, maxPages - 1)) {
      try {
        const page = await fetchPage(link, checked.normalizedDomain, fetcher, now().toISOString());
        fetchedUrls.push(page.url);
        findings.push(...extractWebsiteFindings(page));
      } catch {
        failedUrls.push(link);
      }
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "FETCH_FAILED";
    if (code === "RESPONSE_TOO_LARGE") {
      return err("RESPONSE_TOO_LARGE", "Website response exceeded the allowed size.");
    }
    if (code === "UNSAFE_REDIRECT") {
      return err("UNSAFE_REDIRECT", "Website redirected to an unsafe or different-domain target.");
    }
    if (code === "UNSUPPORTED_CONTENT_TYPE") {
      return err(
        "UNSUPPORTED_CONTENT_TYPE",
        "Only public HTML or plain text content can be researched.",
      );
    }
    return err("FETCH_FAILED", "Website research failed without changing manual assessment flow.");
  }

  if (findings.length === 0) {
    warnings.push("No usable public evidence was found.");
  }

  const resultWithoutId: Omit<WebsiteResearchResult, "researchId"> = {
    companyName: parsed.data.companyName,
    normalizedDomain: checked.normalizedDomain,
    status:
      findings.length > 0 && failedUrls.length > 0
        ? "PARTIAL_RESULT"
        : findings.length > 0
          ? "REVIEW_REQUIRED"
          : "NO_USABLE_PUBLIC_EVIDENCE",
    requestedUrls: requestedUrls.slice(0, maxPages),
    fetchedUrls,
    failedUrls,
    findings,
    warnings,
  };
  const researchId = await persistence.persistResearch({
    creatorId,
    companyName: parsed.data.companyName,
    normalizedDomain: checked.normalizedDomain,
    result: resultWithoutId,
  });

  return ok<WebsiteResearchResult>({
    researchId,
    ...resultWithoutId,
  });
}
