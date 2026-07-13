import { randomUUID } from "node:crypto";

import { z } from "zod";

import { classifyProfessionalTitle } from "@/features/company-contact-enrichment/persona-classifier";
import type {
  CompanyContactEnrichmentResult,
  EnrichmentConflict,
  NormalizedCompanyField,
  NormalizedContact,
  ProviderStatusResult,
} from "@/features/company-contact-enrichment/types";
import {
  normalizeDomain,
  validatePublicCompanyUrl,
} from "@/features/connected-research/url-safety";
import type { DoNotContactRecord } from "@/features/do-not-contact/types";
import { searchDoNotContactRecords } from "@/features/do-not-contact/do-not-contact-policy";
import { prisma, type MinimalPrismaClient } from "@/lib/prisma";

import {
  createCompanyContactDataProvider,
  mapProviderFailure,
  validateProviderCompanyResult,
  validateProviderContacts,
  type CompanyContactDataProvider,
  type ProviderCompanyField,
} from "./company-contact-provider";
import { err, ok } from "./result";

type Row = Record<string, unknown>;

const enrichInputSchema = z.object({
  companyName: z.string().trim().max(180).optional(),
  companyDomain: z.string().trim().min(1).max(240),
  countryOrMarketHint: z.string().trim().max(160).optional(),
  existingFields: z.record(z.string()).optional(),
  creatorId: z.string().trim().min(1).optional(),
});

export type CompanyContactPersistence = {
  getActor(actorId: string): Promise<{ id: string; role: string } | null>;
  getSuppressionRecords(): Promise<DoNotContactRecord[]>;
  persistEnrichment(input: {
    creatorId: string;
    companyName?: string;
    normalizedDomain: string;
    providerStatus: ProviderStatusResult;
    companyFields: NormalizedCompanyField[];
    contacts: NormalizedContact[];
    operation: string;
  }): Promise<string>;
};

export type CompanyContactEnrichmentDependencies = {
  persistence?: CompanyContactPersistence;
  provider?: CompanyContactDataProvider;
  now?: () => Date;
};

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

export class PrismaCompanyContactPersistence implements CompanyContactPersistence {
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

  async getSuppressionRecords() {
    const rows = await this.client.$queryRaw<Row[]>`
      SELECT id, "companyName", domain, status, "accountOwner", reason, notes, "lastContactDate"::text AS "lastContactDate"
      FROM "SuppressionRecord"
    `;
    return rows.map((row) => ({
      id: asString(row.id),
      companyName: asString(row.companyName),
      domain: asString(row.domain) || undefined,
      status: asString(row.status) as DoNotContactRecord["status"],
      owner: asString(row.accountOwner) || undefined,
      reason: asString(row.reason) || undefined,
      notes: asString(row.notes) || undefined,
      lastContactDate: asString(row.lastContactDate) || undefined,
    }));
  }

  async persistEnrichment({
    creatorId,
    companyName,
    normalizedDomain,
    providerStatus,
    companyFields,
    contacts,
    operation,
  }: {
    creatorId: string;
    companyName?: string;
    normalizedDomain: string;
    providerStatus: ProviderStatusResult;
    companyFields: NormalizedCompanyField[];
    contacts: NormalizedContact[];
    operation: string;
  }) {
    const runId = randomUUID();
    await this.client.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO "CompanyEnrichmentRun" (
          id, "userId", "companyName", "normalizedDomain", provider, status, "requestedAt", "completedAt", "failureCategory", "createdAt", "updatedAt"
        )
        VALUES (
          ${runId}, ${creatorId}, ${companyName ?? null}, ${normalizedDomain}, ${providerStatus.providerName}, ${providerStatus.status}, NOW(), NOW(),
          ${providerStatus.status === "CONFIGURED" ? null : providerStatus.status}, NOW(), NOW()
        )
      `;
      for (const field of companyFields) {
        await tx.$executeRaw`
          INSERT INTO "CompanyEnrichmentFinding" (
            id, "enrichmentRunId", "normalizedField", value, status, provider, "fieldOrigin", "retrievedAt", confidence, "sourceUrl", "reviewStatus", "createdAt"
          )
          VALUES (
            ${randomUUID()}, ${runId}, ${field.field}, ${field.value}, ${field.status}, ${field.providerName}, ${field.fieldOrigin},
            ${new Date(field.retrievedAt)}, ${field.confidence ?? null}, ${field.sourceUrl ?? null}, ${field.reviewStatus}, NOW()
          )
        `;
      }
      for (const contact of contacts) {
        await tx.$executeRaw`
          INSERT INTO "ContactEnrichmentResult" (
            id, "enrichmentRunId", "fullName", "professionalTitle", "companyName", "companyDomain", "countryOrRegion", department, seniority,
            "personaTier", "personaCategory", "professionalProfileUrl", "businessEmail", "businessEmailStatus", provider, "retrievedAt", "relevanceState", "reviewStatus", "createdAt"
          )
          VALUES (
            ${randomUUID()}, ${runId}, ${contact.fullName}, ${contact.professionalTitle}, ${contact.companyName}, ${contact.companyDomain},
            ${contact.countryOrRegion ?? null}, ${contact.department ?? null}, ${contact.seniority ?? null}, ${contact.personaTier}, ${contact.personaCategory},
            ${contact.professionalProfileUrl ?? null}, ${contact.businessEmail ?? null}, ${contact.businessEmailStatus ?? null}, ${contact.provider},
            ${new Date(contact.retrievedAt)}, ${contact.titleMatchQuality === "Not relevant" ? "EXCLUDED" : "RELEVANT"}, ${contact.reviewStatus}, NOW()
          )
        `;
      }
      await tx.$executeRaw`
        INSERT INTO "ProviderSyncAudit" (id, "enrichmentRunId", "providerOperation", "recordCount", status, "userId", "createdAt")
        VALUES (${randomUUID()}, ${runId}, ${operation}, ${companyFields.length + contacts.length}, ${providerStatus.status}, ${creatorId}, NOW())
      `;
    });
    return runId;
  }
}

function normalizeCompanyField(
  field: ProviderCompanyField,
  providerName: string,
  retrievedAt: string,
): NormalizedCompanyField {
  return {
    field: field.field,
    value: field.value,
    status: "PROVIDER_SUPPLIED",
    providerName,
    fieldOrigin: field.fieldOrigin,
    retrievedAt,
    confidence: field.confidence,
    sourceUrl: field.sourceUrl,
    reviewStatus: "PENDING",
  };
}

function buildConflicts(
  existingFields: Record<string, string> | undefined,
  incoming: NormalizedCompanyField[],
) {
  const conflicts: EnrichmentConflict[] = [];
  if (!existingFields) return conflicts;
  for (const field of incoming) {
    const existingValue = existingFields[field.field];
    if (existingValue && existingValue.toLowerCase() !== field.value.toLowerCase()) {
      conflicts.push({
        field: field.field,
        existingValue,
        incomingValue: field.value,
        existingSource: "Manual or website research",
        incomingSource: `${field.providerName} (${field.status})`,
      });
    }
  }
  return conflicts;
}

function workflowLinks(blocked: boolean) {
  const reason = blocked ? "Blocked by suppression. Internal review remains available." : undefined;
  return [
    { label: "Create Outreach", href: "/create-outreach", disabled: blocked, reason },
    { label: "Build Sequence", href: "/build-sequence", disabled: blocked, reason },
    { label: "Ask Signal Brain", href: "/ask-signal-brain" },
    { label: "Reply to Prospect", href: "/reply-to-prospect" },
  ];
}

function suppressionBlocked(
  records: DoNotContactRecord[],
  companyName: string | undefined,
  domain: string,
) {
  const matches = [
    ...(companyName ? searchDoNotContactRecords(records, companyName) : []),
    ...searchDoNotContactRecords(records, domain),
  ];
  return matches.some((match) => match.blocked);
}

function sanitizeContacts(
  contacts: unknown,
  providerName: string,
  retrievedAt: string,
): NormalizedContact[] {
  return validateProviderContacts(contacts)
    .map((contact) => {
      const classification = classifyProfessionalTitle(contact.professionalTitle);
      return {
        fullName: contact.fullName,
        professionalTitle: contact.professionalTitle,
        companyName: contact.companyName,
        companyDomain: normalizeDomain(contact.companyDomain),
        countryOrRegion: contact.countryOrRegion,
        department: contact.department,
        seniority: contact.seniority,
        ...classification,
        professionalProfileUrl: contact.professionalProfileUrl,
        businessEmail: contact.businessEmail,
        businessEmailStatus: contact.businessEmail
          ? (contact.businessEmailStatus ?? "provider supplied")
          : undefined,
        provider: providerName,
        retrievedAt,
        reviewStatus: "PENDING" as const,
      };
    })
    .filter((contact) => contact.titleMatchQuality !== "Not relevant")
    .sort((a, b) => b.targetingPriority - a.targetingPriority);
}

export async function enrichCompanyAndContacts(
  rawInput: unknown,
  dependencies: CompanyContactEnrichmentDependencies = {},
) {
  const parsed = enrichInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", "Company enrichment input is malformed.");
  }
  const safeUrl = validatePublicCompanyUrl(parsed.data.companyDomain);
  if (!safeUrl.ok) return err(safeUrl.code, safeUrl.message);

  const creatorId = parsed.data.creatorId ?? "seed-sales-user";
  const persistence = dependencies.persistence ?? new PrismaCompanyContactPersistence();
  const actor = await persistence.getActor(creatorId);
  if (!actor || !["SALES_USER", "KNOWLEDGE_ADMIN"].includes(actor.role)) {
    return err("FORBIDDEN", "Only authorized sales or knowledge users can enrich accounts.");
  }

  const provider = dependencies.provider ?? createCompanyContactDataProvider();
  const retrievedAt = (dependencies.now ?? (() => new Date()))().toISOString();
  const suppressionRecords = await persistence.getSuppressionRecords();
  const blocked = suppressionBlocked(
    suppressionRecords,
    parsed.data.companyName,
    safeUrl.normalizedDomain,
  );

  let providerStatus = await provider.getProviderStatus();
  const warnings: string[] = [];
  let companyFields: NormalizedCompanyField[] = [];
  let contacts: NormalizedContact[] = [];

  try {
    if (providerStatus.status === "CONFIGURED") {
      const companyResult = validateProviderCompanyResult(
        await provider.enrichCompanyByDomain({
          companyName: parsed.data.companyName,
          normalizedDomain: safeUrl.normalizedDomain,
          countryOrMarketHint: parsed.data.countryOrMarketHint,
        }),
      );
      warnings.push(...(companyResult.warnings ?? []));
      if (companyResult.matchStatus !== "MATCHED") {
        warnings.push(
          companyResult.matchStatus === "MULTIPLE_MATCHES"
            ? "Multiple company matches require manual review."
            : "No company match was returned; no facts were invented.",
        );
      }
      companyFields = companyResult.fields.map((field) =>
        normalizeCompanyField(field, provider.providerName, retrievedAt),
      );
      contacts = sanitizeContacts(
        await provider.findRelevantContacts({
          normalizedDomain: safeUrl.normalizedDomain,
          targetPersonaCategories: ["Direct Paid Search", "Performance and Growth"],
          countryOrMarketHint: parsed.data.countryOrMarketHint,
          maxResults: 20,
        }),
        provider.providerName,
        retrievedAt,
      );
    } else {
      warnings.push(providerStatus.message);
    }
  } catch (error) {
    providerStatus = mapProviderFailure(error);
    warnings.push(providerStatus.message);
    companyFields = [];
    contacts = [];
  }

  const enrichmentRunId = await persistence.persistEnrichment({
    creatorId,
    companyName: parsed.data.companyName,
    normalizedDomain: safeUrl.normalizedDomain,
    providerStatus,
    companyFields,
    contacts,
    operation: "COMPANY_CONTACT_ENRICHMENT",
  });

  const result: CompanyContactEnrichmentResult = {
    enrichmentRunId,
    providerStatus,
    companyFields,
    contacts,
    conflicts: buildConflicts(parsed.data.existingFields, companyFields),
    warnings,
    workflowLinks: workflowLinks(blocked),
  };
  return ok(result);
}
