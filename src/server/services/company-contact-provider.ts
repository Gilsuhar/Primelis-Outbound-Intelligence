import { z } from "zod";

import type {
  CompanyEnrichmentInput,
  ContactSearchInput,
  ProviderStatusResult,
} from "@/features/company-contact-enrichment/types";

export type ProviderCompanyField = {
  field: string;
  value: string;
  fieldOrigin: string;
  confidence?: string;
  sourceUrl?: string;
};

export type ProviderContact = {
  fullName: string;
  professionalTitle: string;
  companyName: string;
  companyDomain: string;
  countryOrRegion?: string;
  department?: string;
  seniority?: string;
  professionalProfileUrl?: string;
  businessEmail?: string;
  businessEmailStatus?: string;
  personalPhone?: string;
  privateEmail?: string;
};

export type ProviderCompanyResult = {
  matchStatus: "MATCHED" | "NO_MATCH" | "MULTIPLE_MATCHES";
  fields: ProviderCompanyField[];
  warnings?: string[];
};

export type CompanyContactDataProvider = {
  providerName: string;
  getProviderStatus(): Promise<ProviderStatusResult>;
  enrichCompanyByDomain(input: CompanyEnrichmentInput): Promise<ProviderCompanyResult>;
  findRelevantContacts(input: ContactSearchInput): Promise<ProviderContact[]>;
};

const providerCompanyFieldSchema = z.object({
  field: z.string().trim().min(1).max(80),
  value: z.string().trim().min(1).max(500),
  fieldOrigin: z.string().trim().min(1).max(120),
  confidence: z.string().trim().max(80).optional(),
  sourceUrl: z.string().url().optional(),
});

export const providerCompanyResultSchema = z.object({
  matchStatus: z.enum(["MATCHED", "NO_MATCH", "MULTIPLE_MATCHES"]),
  fields: z.array(providerCompanyFieldSchema).max(40),
  warnings: z.array(z.string().trim().max(240)).optional(),
});

export const providerContactSchema = z.object({
  fullName: z.string().trim().min(1).max(160),
  professionalTitle: z.string().trim().min(1).max(180),
  companyName: z.string().trim().min(1).max(180),
  companyDomain: z.string().trim().min(1).max(240),
  countryOrRegion: z.string().trim().max(120).optional(),
  department: z.string().trim().max(120).optional(),
  seniority: z.string().trim().max(120).optional(),
  professionalProfileUrl: z.string().url().optional(),
  businessEmail: z.string().email().optional(),
  businessEmailStatus: z.string().trim().max(80).optional(),
  personalPhone: z.string().optional(),
  privateEmail: z.string().optional(),
});

export class NotConfiguredCompanyContactProvider implements CompanyContactDataProvider {
  providerName = "Company/contact provider";

  async getProviderStatus(): Promise<ProviderStatusResult> {
    return {
      status: "NOT_CONFIGURED",
      providerName: this.providerName,
      message: "Company data provider is not configured.",
    };
  }

  async enrichCompanyByDomain(): Promise<ProviderCompanyResult> {
    return { matchStatus: "NO_MATCH", fields: [], warnings: ["Provider is not configured."] };
  }

  async findRelevantContacts(): Promise<ProviderContact[]> {
    return [];
  }
}

export class DeterministicMockCompanyContactProvider implements CompanyContactDataProvider {
  providerName = "Deterministic mock provider";

  async getProviderStatus(): Promise<ProviderStatusResult> {
    return {
      status: "CONFIGURED",
      providerName: this.providerName,
      message: "Deterministic development provider is available.",
    };
  }

  async enrichCompanyByDomain(input: CompanyEnrichmentInput): Promise<ProviderCompanyResult> {
    return {
      matchStatus: "MATCHED",
      fields: [
        { field: "industry", value: "Retail and E-commerce", fieldOrigin: "mock.industry" },
        { field: "employee_range", value: "500-1,000 employees", fieldOrigin: "mock.scale" },
        { field: "revenue_range", value: "$100M-$250M", fieldOrigin: "mock.revenue" },
        { field: "headquarters_country", value: "United States", fieldOrigin: "mock.hq" },
        {
          field: "operating_markets",
          value: input.countryOrMarketHint ?? "United States, Canada, United Kingdom",
          fieldOrigin: "mock.markets",
        },
        { field: "company_type", value: "E-commerce", fieldOrigin: "mock.company_type" },
      ],
    };
  }

  async findRelevantContacts(input: ContactSearchInput): Promise<ProviderContact[]> {
    return [
      {
        fullName: "Morgan Search",
        professionalTitle: "Director of Paid Search",
        companyName: "Mock Company",
        companyDomain: input.normalizedDomain,
        department: "Performance Marketing",
        seniority: "Director",
        businessEmail: "morgan.search@example.com",
        businessEmailStatus: "provider supplied",
      },
      {
        fullName: "Jordan Growth",
        professionalTitle: "Head of Growth",
        companyName: "Mock Company",
        companyDomain: input.normalizedDomain,
        department: "Growth",
        seniority: "Head",
      },
      {
        fullName: "Casey Sponsor",
        professionalTitle: "CMO",
        companyName: "Mock Company",
        companyDomain: input.normalizedDomain,
        seniority: "Executive",
      },
    ];
  }
}

export function createCompanyContactDataProvider(): CompanyContactDataProvider {
  return new NotConfiguredCompanyContactProvider();
}

export function validateProviderCompanyResult(value: unknown) {
  return providerCompanyResultSchema.parse(value);
}

export function validateProviderContacts(value: unknown) {
  return z.array(providerContactSchema).parse(value);
}

export function mapProviderFailure(error: unknown): ProviderStatusResult {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (/rate|429/.test(message)) {
    return {
      status: "RATE_LIMITED",
      providerName: "Company/contact provider",
      message: "Provider rate limit reached. Manual research remains available.",
    };
  }
  if (/timeout|timed out|unavailable/.test(message)) {
    return {
      status: "TEMPORARILY_UNAVAILABLE",
      providerName: "Company/contact provider",
      message: "Provider enrichment is temporarily unavailable.",
    };
  }
  if (/auth|credential|401|403/.test(message)) {
    return {
      status: "AUTHENTICATION_FAILED",
      providerName: "Company/contact provider",
      message: "Provider authentication failed.",
    };
  }
  return {
    status: "PROVIDER_ERROR",
    providerName: "Company/contact provider",
    message: "Provider enrichment failed safely.",
  };
}
