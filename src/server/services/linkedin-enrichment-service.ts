import "server-only";

import { z } from "zod";

import { normalizeLinkedInUrl } from "@/features/build-sequence/prospect-memory";

import { err, ok, type ServiceResult } from "./result";

// NOTE: This intentionally does NOT scrape linkedin.com directly. Direct
// automated scraping of LinkedIn profile pages (full HTML, requires login,
// pulls experience/post history) violates LinkedIn's Terms of Service and
// risks account/legal exposure (see README "Scope" section).
//
// Two data sources are combined here instead, both meaningfully lower-risk:
//   1. GetLeads' enrichment API - structured contact/company data, org already
//      has a commercial relationship with them.
//   2. The LinkedIn profile's public Open Graph preview tags (og:title /
//      og:description) - the same metadata LinkedIn deliberately serves to any
//      crawler so link previews render in Slack/WhatsApp/iMessage. No login
//      wall applies to it because it's meant to be publicly fetched. It's
//      thinner than a full profile (name/headline/short snippet only, no
//      experience history or posts) and can occasionally fail to resolve -
//      both providers degrade gracefully rather than failing the whole flow.

const inputSchema = z.object({
  linkedinUrl: z.string().trim().min(1).max(300),
  creatorId: z.string().trim().min(1).optional(),
});

export type LinkedInEnrichmentInput = z.infer<typeof inputSchema>;

const providerRecordSchema = z.object({
  success: z.boolean().optional().default(true),
  linkedin_url: z.string().trim().optional(),
  email: z.string().trim().optional(),
  first_name: z.string().trim().optional(),
  last_name: z.string().trim().optional(),
  full_name: z.string().trim().optional(),
  job_title: z.string().trim().optional(),
  headline: z.string().trim().optional(),
  company_name: z.string().trim().optional(),
  company_domain: z.string().trim().optional(),
  company_website: z.string().trim().optional(),
  location: z.string().trim().optional(),
  industry: z.string().trim().optional(),
});

const providerResponseSchema = z.object({
  items: z.array(providerRecordSchema).optional().default([]),
  results: z.array(providerRecordSchema).optional().default([]),
});

export type LinkedInEnrichmentRecord = z.infer<typeof providerRecordSchema>;

export type PublicPreview = {
  title?: string;
  description?: string;
};

export type LinkedInEnrichmentResult = {
  linkedinUrl: string;
  record: LinkedInEnrichmentRecord | null;
  preview: PublicPreview | null;
  rawProspectContext: string;
  provider: "GETLEADS" | "PUBLIC_PREVIEW" | "GETLEADS_AND_PREVIEW" | "NONE";
};

export type LinkedInEnrichmentProvider = (
  linkedinUrl: string,
) => Promise<LinkedInEnrichmentRecord | null>;

export type PublicPreviewProvider = (linkedinUrl: string) => Promise<PublicPreview | null>;

const getleadsEndpoint = "https://app.getleads.io/api/v1/enrich/from-linkedin";

async function defaultGetLeadsProvider(
  linkedinUrl: string,
): Promise<LinkedInEnrichmentRecord | null> {
  const apiKey = process.env.GETLEADS_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(getleadsEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ items: [{ linkedin_url: linkedinUrl }], limit_per_item: 1 }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`GetLeads enrichment failed with status ${response.status}`);
    }

    const json: unknown = await response.json();
    const parsed = providerResponseSchema.safeParse(json);
    if (!parsed.success) return null;

    const record = parsed.data.items[0] ?? parsed.data.results[0] ?? null;
    if (!record || record.success === false) return null;
    return record;
  } finally {
    clearTimeout(timeout);
  }
}

function extractMetaTag(html: string, property: string) {
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`,
    "i",
  );
  const match = html.match(pattern);
  if (match?.[1]) return decodeHtmlEntities(match[1]).trim();

  const reversePattern = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`,
    "i",
  );
  const reverseMatch = html.match(reversePattern);
  return reverseMatch?.[1] ? decodeHtmlEntities(reverseMatch[1]).trim() : undefined;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function defaultPublicPreviewProvider(linkedinUrl: string): Promise<PublicPreview | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(linkedinUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; PrimelisOutboundResearch/1.0; +public-og-preview-only)",
        Accept: "text/html",
      },
    });
    if (!response.ok) return null;

    const html = await response.text();
    const title = extractMetaTag(html, "og:title");
    const description = extractMetaTag(html, "og:description");
    if (!title && !description) return null;
    return { title, description };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function buildRawProspectContext(
  linkedinUrl: string,
  record: LinkedInEnrichmentRecord | null,
  preview: PublicPreview | null,
) {
  if (!record && !preview) {
    return [
      `LinkedIn: ${linkedinUrl}`,
      "No enrichment data was returned for this URL. Add whatever you know about",
      "this prospect below (role, recent posts, company context) before generating.",
    ].join("\n");
  }

  const fullName =
    record?.full_name ||
    [record?.first_name, record?.last_name].filter(Boolean).join(" ") ||
    undefined;
  const role = record?.job_title || record?.headline;
  const company = record?.company_name;

  const lines: string[] = [`LinkedIn: ${record?.linkedin_url || linkedinUrl}`];
  if (fullName) lines.push(`Name: ${fullName}`);
  if (role && company) {
    lines.push(`Current: ${role} at ${company}.`);
  } else if (role) {
    lines.push(`Current role: ${role}.`);
  } else if (company) {
    lines.push(`Current company: ${company}.`);
  }
  if (record?.company_domain || record?.company_website) {
    lines.push(`Company site: ${record?.company_website || record?.company_domain}`);
  }
  if (record?.location) lines.push(`Location: ${record.location}`);
  if (record?.industry) lines.push(`Industry: ${record.industry}`);
  if (record?.email) lines.push(`Email: ${record.email}`);

  const previewTitle = usefulPreviewText(preview?.title);
  const previewDescription = usefulPreviewText(preview?.description);
  if (previewTitle && !fullName) {
    const headline = parsePreviewHeadline(previewTitle);
    if (headline) {
      lines.push(`Name: ${headline.name}`);
      lines.push(`Current: ${headline.role} at ${headline.company}.`);
    } else {
      lines.push(previewTitle);
    }
  }
  if (previewDescription) {
    const headline = !record && parsePreviewHeadline(previewDescription);
    if (headline) {
      lines.push(`Name: ${headline.name}`);
      lines.push(`Current: ${headline.role} at ${headline.company}.`);
    } else {
      lines.push(previewDescription);
    }
  }

  return lines.join("\n");
}

function usefulPreviewText(value?: string) {
  const text = value?.replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  if (/\b(?:login|sign in|sign up|join linkedin|keep in touch|professional community|manage your professional identity|\d+\s*million\+?\s+members)\b/i.test(text)) {
    return undefined;
  }
  return text.replace(/\s*\|\s*LinkedIn\s*$/i, "").trim();
}

function parsePreviewHeadline(value: string) {
  const clean = value.replace(/\s*\|\s*LinkedIn\s*$/i, "").trim();
  const atMatch = clean.match(/^(.+?)\s+-\s+(.+?\bat\b.+)$/i);
  if (atMatch?.[1] && atMatch[2]) {
    const current = atMatch[2].trim();
    const currentMatch = current.match(/^(.+?)\s+\bat\b\s+(.+)$/i);
    return currentMatch?.[1] && currentMatch[2]
      ? { name: atMatch[1].trim(), role: currentMatch[1].trim(), company: currentMatch[2].trim() }
      : undefined;
  }
  const dashMatch = clean.match(/^(.+?)\s+-\s+(.+?)\s+-\s+(.+)$/);
  if (!dashMatch?.[1] || !dashMatch[2] || !dashMatch[3]) return undefined;
  return {
    name: dashMatch[1].trim(),
    role: dashMatch[2].trim(),
    company: dashMatch[3].trim(),
  };
}

export async function enrichLinkedInProspect(
  input: unknown,
  getLeadsProvider: LinkedInEnrichmentProvider = defaultGetLeadsProvider,
  publicPreviewProvider: PublicPreviewProvider = defaultPublicPreviewProvider,
): Promise<ServiceResult<LinkedInEnrichmentResult>> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", "A LinkedIn profile URL is required.");
  }

  const normalized = normalizeLinkedInUrl(parsed.data.linkedinUrl);
  if (!normalized) {
    return err("INVALID_URL", "That doesn't look like a LinkedIn profile URL.");
  }
  const linkedinUrl = `https://${normalized}`;

  try {
    const [recordResult, previewResult] = await Promise.allSettled([
      getLeadsProvider(linkedinUrl),
      publicPreviewProvider(linkedinUrl),
    ]);

    const record = recordResult.status === "fulfilled" ? recordResult.value : null;
    const preview = previewResult.status === "fulfilled" ? previewResult.value : null;

    const provider: LinkedInEnrichmentResult["provider"] =
      record && preview
        ? "GETLEADS_AND_PREVIEW"
        : record
          ? "GETLEADS"
          : preview
            ? "PUBLIC_PREVIEW"
            : "NONE";

    return ok({
      linkedinUrl,
      record,
      preview,
      rawProspectContext: buildRawProspectContext(linkedinUrl, record, preview),
      provider,
    });
  } catch (caught) {
    return err(
      "PROVIDER_ERROR",
      caught instanceof Error ? caught.message : "LinkedIn enrichment lookup failed.",
    );
  }
}
