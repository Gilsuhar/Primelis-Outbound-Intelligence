import type { FactStatus } from "@/features/account-research/types";

export const researchStatuses = [
  "NOT_RESEARCHED",
  "RESEARCHING",
  "RESEARCH_COMPLETE",
  "PARTIAL_RESULT",
  "NO_USABLE_PUBLIC_EVIDENCE",
  "BLOCKED_BY_WEBSITE",
  "INVALID_DOMAIN",
  "FETCH_FAILED",
  "REVIEW_REQUIRED",
] as const;

export type ResearchStatus = (typeof researchStatuses)[number];
export type ResearchFactStatus =
  Extract<FactStatus, "VERIFIED" | "USER_PROVIDED" | "UNKNOWN"> | "INFERRED";

export type WebsiteFinding = {
  field: string;
  value: string;
  factStatus: ResearchFactStatus;
  evidenceType: "DIRECT_SOURCE" | "INFERENCE" | "UNKNOWN";
  sourceTitle: string;
  sourceUrl: string;
  retrievedAt: string;
  excerpt: string;
  confidence: "High" | "Medium" | "Low";
  inferenceExplanation?: string;
  reviewStatus: "PENDING" | "ACCEPTED" | "REJECTED";
};

export type WebsiteResearchResult = {
  researchId: string;
  companyName: string;
  normalizedDomain: string;
  status: ResearchStatus;
  requestedUrls: string[];
  fetchedUrls: string[];
  failedUrls: string[];
  findings: WebsiteFinding[];
  warnings: string[];
};

export type SafeUrlResult =
  { ok: true; url: URL; normalizedDomain: string } | { ok: false; code: string; message: string };
