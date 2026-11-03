import "server-only";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import {
  type InternalExecution,
  internalExecutionSchema,
} from "@/features/agent-workforce/company-research/internal-review";
import { allowedSourceUrl, readPublicSource, type SourceReader } from "../public-sources";

/** No provider, CRM, database, discovery service or template fallback is reachable here. */
export async function executeInternalResearch(
  company: string,
  hasImage: boolean,
  reader: SourceReader = readPublicSource,
): Promise<InternalExecution> {
  const startedAt = new Date().toISOString();
  const result: InternalExecution = {
    mode: "PUBLIC_RETRIEVAL_ONLY",
    status: "BLOCKED",
    startedAt,
    completedAt: startedAt,
    sources: [],
    stages: [],
    grounding: "NOT_RUN",
    independentQuality: "NOT_RUN",
    approved: false,
    canSend: false,
    canEnroll: false,
  };
  let url: URL | null = null;
  try {
    const candidate = new URL(company.includes("://") ? company : `https://${company}`);
    // Accept only a public website root. No guessed name-to-domain mapping, IP literals,
    // credential-bearing URLs, query strings or arbitrary GET action paths.
    if (
      allowedSourceUrl(candidate.href) &&
      !isIP(candidate.hostname) &&
      candidate.pathname === "/" &&
      !candidate.search &&
      !candidate.hash
    )
      url = candidate;
  } catch {
    /* Name-only input is accepted, but cannot be independently resolved here. */
  }
  if (!url) {
    result.stages.push({
      stage: "COMPANY_RESOLUTION",
      status: "BLOCKED",
      code: "PUBLIC_DOMAIN_REQUIRED",
      detail:
        "No permitted free company-name discovery is connected. Provide the exact public HTTPS domain; no domain was guessed.",
    });
  } else {
    result.stages.push({
      stage: "COMPANY_RESOLUTION",
      status: "COMPLETED",
      code: "USER_SUPPLIED_DOMAIN",
      detail: "Using the supplied domain. Corporate ownership has not been independently verified.",
    });
    try {
      const page = await reader(url.href);
      if (page.url !== url.href || page.text.length < 80 || page.text.length > 18000)
        throw new Error("SOURCE_CONTENT_REJECTED");
      result.sources.push({
        url: page.url,
        title: page.title.slice(0, 300),
        text: page.text,
        retrievedAt: new Date().toISOString(),
        sha256: createHash("sha256").update(page.text).digest("hex"),
      });
      result.stages.push({
        stage: "PUBLIC_RETRIEVAL",
        status: "COMPLETED",
        code: "TEXT_EXTRACTED",
        detail:
          "One public page retrieved and extracted with the existing pinned HTTPS reader. This is untrusted source text, not validated findings.",
      });
    } catch (error) {
      const raw = error instanceof Error ? error.message : "";
      const code =
        /^(SOURCE_(UNAVAILABLE|DNS_TIMEOUT|DNS_FAILED|DNS_NOT_PUBLIC|TIMEOUT|REDIRECT|HTTP_[0-9]{1,3}|CONTENT_TYPE|TOO_LARGE|CONTENT_REJECTED|TLS|NETWORK)|PUBLIC_SOURCE_PROXY_UNSUPPORTED)$/.test(
          raw,
        )
          ? raw
          : "SOURCE_UNAVAILABLE";
      result.stages.push({
        stage: "PUBLIC_RETRIEVAL",
        status: "BLOCKED",
        code,
        detail:
          "Public retrieval failed within existing security/size/time limits. No redirect, proxy bypass or retry was attempted.",
      });
    }
  }
  result.stages.push(
    {
      stage: "SCREENSHOT_ANALYSIS",
      status: hasImage ? "BLOCKED" : "NOT_RUN",
      code: hasImage ? "IMAGE_INTERPRETER_UNAVAILABLE" : "NO_IMAGE_SUPPLIED",
      detail: hasImage
        ? "Original image preserved. No permitted free image interpreter is connected; advertisers, location, device and capture time remain unverified."
        : "No screenshot supplied. No historical image was substituted.",
    },
    {
      stage: "ANGLES_AND_DRAFTS",
      status: "BLOCKED",
      code: "NO_AUTHORIZED_INFERENCE",
      detail:
        "Existing strategy and writing agents require paid model execution, which is not authorized here. No template or manual report was substituted.",
    },
    {
      stage: "INDEPENDENT_REVIEW",
      status: "NOT_RUN",
      code: "REVIEW_NOT_EXECUTED",
      detail:
        "Independent Grounding and semantic quality review require model execution. No findings, angles or drafts are approved.",
    },
  );
  result.completedAt = new Date().toISOString();
  return internalExecutionSchema.parse(result);
}
