export const providerStatusValues = [
  "CONFIGURED",
  "NOT_CONFIGURED",
  "TEMPORARILY_UNAVAILABLE",
  "RATE_LIMITED",
  "AUTHENTICATION_FAILED",
  "PROVIDER_ERROR",
] as const;

export const providerFieldStatuses = [
  "PROVIDER_SUPPLIED",
  "VERIFIED",
  "USER_PROVIDED",
  "INFERRED",
  "UNKNOWN",
] as const;

export const titleMatchQualities = [
  "Exact match",
  "Strong variation",
  "Possible match",
  "Not relevant",
  "Manual review required",
] as const;

export const csvImportTypes = ["COMPANY", "CONTACT"] as const;
export const csvImportModes = ["ADD_NEW_ONLY", "ADD_NEW_AND_UPDATE"] as const;

export type ProviderStatusValue = (typeof providerStatusValues)[number];
export type ProviderFieldStatus = (typeof providerFieldStatuses)[number];
export type TitleMatchQuality = (typeof titleMatchQualities)[number];
export type CompanyContactCsvType = (typeof csvImportTypes)[number];
export type CompanyContactImportMode = (typeof csvImportModes)[number];

export type ProviderStatusResult = {
  status: ProviderStatusValue;
  providerName: string;
  message: string;
};

export type CompanyEnrichmentInput = {
  companyName?: string;
  normalizedDomain: string;
  countryOrMarketHint?: string;
};

export type ContactSearchInput = {
  normalizedDomain: string;
  targetPersonaCategories: string[];
  countryOrMarketHint?: string;
  maxResults: number;
};

export type NormalizedCompanyField = {
  field: string;
  value: string;
  status: ProviderFieldStatus;
  providerName: string;
  fieldOrigin: string;
  retrievedAt: string;
  confidence?: string;
  sourceUrl?: string;
  reviewStatus: "PENDING" | "ACCEPTED" | "REJECTED";
};

export type NormalizedContact = {
  fullName: string;
  professionalTitle: string;
  companyName: string;
  companyDomain: string;
  countryOrRegion?: string;
  department?: string;
  seniority?: string;
  personaTier: "Tier 1" | "Tier 2" | "Tier 3" | "Review";
  personaCategory: string;
  titleMatchQuality: TitleMatchQuality;
  targetingPriority: number;
  rationale: string;
  professionalProfileUrl?: string;
  businessEmail?: string;
  businessEmailStatus?: string;
  provider: string;
  retrievedAt: string;
  reviewStatus: "PENDING" | "ACCEPTED" | "REJECTED";
};

export type EnrichmentConflict = {
  field: string;
  existingValue: string;
  incomingValue: string;
  existingSource: string;
  incomingSource: string;
};

export type CompanyContactEnrichmentResult = {
  enrichmentRunId?: string;
  providerStatus: ProviderStatusResult;
  companyFields: NormalizedCompanyField[];
  contacts: NormalizedContact[];
  conflicts: EnrichmentConflict[];
  warnings: string[];
  workflowLinks: Array<{ label: string; href: string; disabled?: boolean; reason?: string }>;
};

export type CompanyContactImportPreview = {
  importType: CompanyContactCsvType;
  totalRows: number;
  validRows: Array<Record<string, string>>;
  invalidRows: Array<{ rowNumber: number; reason: string }>;
  duplicates: Array<{ rowNumber: number; key: string }>;
  conflicts: Array<{ rowNumber: number; key: string; reason: string }>;
  proposedNewRecords: Array<Record<string, string>>;
  proposedUpdates: Array<Record<string, string>>;
  skippedRows: Array<{ rowNumber: number; reason: string }>;
  summary: {
    imported: number;
    updated: number;
    skipped: number;
    invalid: number;
    conflicts: number;
  };
};
