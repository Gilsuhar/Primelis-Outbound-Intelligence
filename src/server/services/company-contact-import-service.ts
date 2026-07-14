import { randomUUID } from "node:crypto";

import { z } from "zod";

import { classifyProfessionalTitle } from "@/features/company-contact-enrichment/persona-classifier";
import {
  csvImportModes,
  csvImportTypes,
  type CompanyContactImportMode,
  type CompanyContactImportPreview,
} from "@/features/company-contact-enrichment/types";
import { normalizeDomain } from "@/features/connected-research/url-safety";
import { prisma, type MinimalPrismaClient } from "@/lib/prisma";

import { err, ok } from "./result";

type Row = Record<string, unknown>;

const importInputSchema = z.object({
  csvText: z.string().min(1).max(250_000),
  filename: z.string().trim().min(1).max(180),
  importType: z.enum(csvImportTypes),
  mode: z.enum(csvImportModes),
  creatorId: z.string().trim().min(1).optional(),
});

export type CompanyContactImportPersistence = {
  getActor(actorId: string): Promise<{ id: string; role: string } | null>;
  getExistingCompanyDomains(): Promise<Set<string>>;
  getExistingContactKeys(): Promise<Set<string>>;
  confirmImport(input: {
    creatorId: string;
    filename: string;
    importType: "COMPANY" | "CONTACT";
    mode: CompanyContactImportMode;
    preview: CompanyContactImportPreview;
  }): Promise<{ batchId: string; imported: number; updated: number; skipped: number }>;
};

export type CompanyContactImportDependencies = {
  persistence?: CompanyContactImportPersistence;
};

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function contactKey(row: Record<string, string>) {
  return `${normalizeDomain(row.domain)}|${normalizeName(row.full_name)}|${normalizeName(row.title)}`;
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function parseRows(csvText: string) {
  const lines = csvText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim());
  const headers = lines.length ? parseCsvLine(lines[0]).map((header) => header.toLowerCase()) : [];
  return {
    headers,
    rows: lines.slice(1).map((line, index) => ({
      rowNumber: index + 2,
      values: Object.fromEntries(
        headers.map((header, column) => [header, parseCsvLine(line)[column]?.trim() ?? ""]),
      ),
    })),
  };
}

function hasFormula(values: Record<string, string>) {
  return Object.values(values).some((value) => /^[=+\-@]/.test(value.trim()));
}

function validDomain(value: string) {
  const domain = normalizeDomain(value);
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain) && !domain.includes("..");
}

function validUrl(value: string) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validEmail(value: string) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function includesAny(text: string, values: string[]) {
  return values.some((value) => text.includes(value));
}

function classifyCompanyRow(row: Record<string, string>): Record<string, string> {
  const name = normalizeName(row.company_name ?? "");
  const domain = normalizeDomain(row.domain ?? "");
  const text = `${name} ${domain} ${normalizeName(row.industry ?? "")}`;
  const employeeRange = row.employee_range ?? row.employees ?? "";
  const revenueRange = row.revenue_range ?? row.revenue ?? "";
  const sizeText = `${employeeRange} ${revenueRange}`.toLowerCase();

  let industry = row.industry?.trim() || "";
  let persona = "Head or Director of Paid Search";
  let angle = "Brand-search efficiency";
  let fit = "Possible fit - validate brand demand first";
  const notes: string[] = [];

  if (
    includesAny(text, [
      "nike",
      "adidas",
      "dior",
      "chloe",
      "polene",
      "sandro",
      "tagheuer",
      "luxury",
      "fashion",
      "apparel",
    ])
  ) {
    industry = industry || "Fashion and Luxury";
    angle = "Brand-spend efficiency";
    notes.push("Fashion/luxury brands often have meaningful brand demand and market variation.");
  } else if (
    includesAny(text, [
      "shop",
      "retail",
      "ecommerce",
      "e-commerce",
      "marketplace",
      "zalando",
      "asos",
      "farfetch",
      "amazon",
    ])
  ) {
    industry = industry || "Retail and E-commerce";
    angle = "Paid and organic measurement";
    notes.push("Retail and e-commerce accounts often need clearer paid + organic decisions.");
  } else if (
    includesAny(text, [
      "saas",
      "software",
      "cloud",
      "dynatrace",
      "datadog",
      "newrelic",
      "hubspot",
      "salesforce",
      "zoominfo",
    ])
  ) {
    industry = industry || "B2B SaaS and Technology";
    persona = "Head of Growth or Acquisition";
    angle = "Qualified demand and demo economics";
    notes.push("B2B SaaS accounts can care about cost per qualified demand and brand efficiency.");
  } else if (includesAny(text, ["bank", "fintech", "finance", "insurance", "pay", "stripe"])) {
    industry = industry || "Fintech and Financial Services";
    persona = "VP Performance Marketing";
    angle = "Measurement quality";
    notes.push("Financial services may need careful measurement and governance language.");
  } else if (includesAny(text, ["air", "travel", "hotel", "hospitality", "booking"])) {
    industry = industry || "Travel and Airlines";
    angle = "Market control and visibility";
    notes.push("Travel and hospitality can vary heavily by market and season.");
  } else {
    industry = industry || "General B2B";
    notes.push("Industry was inferred conservatively; review before outreach.");
  }

  if (/\$?50m|\$?100m|\$?250m|\$?500m|enterprise|1000|5000|10,000|200\+/.test(sizeText)) {
    fit = "Strong fit - brand demand and paid-search owner";
    notes.push("Size/spend context suggests the account may justify a brand-search check.");
  } else if (/\$?20m|100-200|100\+|mid-market/.test(sizeText)) {
    fit = "Possible fit - validate brand demand first";
    notes.push("Mid-market signal found; validate branded-search activity first.");
  }

  return {
    ...row,
    industry: industry || "General B2B",
    signal_industry: industry || "General B2B",
    signal_icp_fit: row.signal_icp_fit || fit,
    recommended_persona: row.recommended_persona || persona,
    recommended_outreach_angle: row.recommended_outreach_angle || angle,
    classification_notes: row.classification_notes || notes.join(" "),
  };
}

export class PrismaCompanyContactImportPersistence implements CompanyContactImportPersistence {
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

  async getExistingCompanyDomains() {
    const rows = await this.client.$queryRaw<Row[]>`
      SELECT DISTINCT "normalizedDomain"
      FROM "CompanyEnrichmentRun"
    `;
    return new Set(rows.map((row) => asString(row.normalizedDomain)).filter(Boolean));
  }

  async getExistingContactKeys() {
    const rows = await this.client.$queryRaw<Row[]>`
      SELECT "companyDomain", "fullName", "professionalTitle"
      FROM "ContactEnrichmentResult"
    `;
    return new Set(
      rows.map(
        (row) =>
          `${normalizeDomain(asString(row.companyDomain))}|${normalizeName(asString(row.fullName))}|${normalizeName(asString(row.professionalTitle))}`,
      ),
    );
  }

  async confirmImport({
    creatorId,
    filename,
    importType,
    mode,
    preview,
  }: {
    creatorId: string;
    filename: string;
    importType: "COMPANY" | "CONTACT";
    mode: CompanyContactImportMode;
    preview: CompanyContactImportPreview;
  }) {
    const batchId = randomUUID();
    await this.client.$transaction(async (tx) => {
      for (const row of [...preview.proposedNewRecords, ...preview.proposedUpdates]) {
        const runId = randomUUID();
        const domain = normalizeDomain(row.domain);
        await tx.$executeRaw`
          INSERT INTO "CompanyEnrichmentRun" (
            id, "userId", "companyName", "normalizedDomain", provider, status, "requestedAt", "completedAt", "createdAt", "updatedAt"
          )
          VALUES (${runId}, ${creatorId}, ${row.company_name}, ${domain}, 'csv-import', 'CONFIGURED', NOW(), NOW(), NOW(), NOW())
        `;
        if (importType === "COMPANY") {
          for (const [field, value] of Object.entries(row)) {
            if (!value || ["company_name", "domain"].includes(field)) continue;
            await tx.$executeRaw`
              INSERT INTO "CompanyEnrichmentFinding" (
                id, "enrichmentRunId", "normalizedField", value, status, provider, "fieldOrigin", "retrievedAt", "reviewStatus", "createdAt"
              )
              VALUES (${randomUUID()}, ${runId}, ${field}, ${value}, 'PROVIDER_SUPPLIED', 'csv-import', ${filename}, NOW(), 'PENDING', NOW())
            `;
          }
        } else {
          const classification = classifyProfessionalTitle(row.title);
          await tx.$executeRaw`
            INSERT INTO "ContactEnrichmentResult" (
              id, "enrichmentRunId", "fullName", "professionalTitle", "companyName", "companyDomain", "countryOrRegion", department, seniority,
              "personaTier", "personaCategory", "professionalProfileUrl", "businessEmail", "businessEmailStatus", provider, "retrievedAt", "relevanceState", "reviewStatus", "createdAt"
            )
            VALUES (
              ${randomUUID()}, ${runId}, ${row.full_name}, ${row.title}, ${row.company_name}, ${domain}, ${row.country || row.region || null},
              ${row.department || null}, ${row.seniority || null}, ${classification.personaTier}, ${classification.personaCategory},
              ${row.professional_profile_url || null}, ${row.business_email || null}, ${row.business_email ? row.business_email_status || "csv supplied" : null},
              'csv-import', NOW(), ${classification.titleMatchQuality === "Not relevant" ? "EXCLUDED" : "RELEVANT"}, 'PENDING', NOW()
            )
          `;
        }
      }
      await tx.$executeRaw`
        INSERT INTO "ProviderSyncAudit" (id, "enrichmentRunId", "providerOperation", "recordCount", status, "userId", "createdAt")
        VALUES (${batchId}, NULL, ${`CSV_${importType}_${mode}`}, ${preview.proposedNewRecords.length + preview.proposedUpdates.length}, 'CONFIGURED', ${creatorId}, NOW())
      `;
    });
    return {
      batchId,
      imported: preview.proposedNewRecords.length,
      updated: mode === "ADD_NEW_AND_UPDATE" ? preview.proposedUpdates.length : 0,
      skipped: preview.skippedRows.length,
    };
  }
}

export function buildCompanyContactImportPreview(
  csvText: string,
  importType: "COMPANY" | "CONTACT",
  mode: CompanyContactImportMode,
  existingCompanyDomains: Set<string>,
  existingContactKeys: Set<string>,
): CompanyContactImportPreview {
  const { headers, rows } = parseRows(csvText);
  const required =
    importType === "COMPANY"
      ? ["company_name", "domain"]
      : ["full_name", "title", "company_name", "domain"];
  const missing = required.filter((header) => !headers.includes(header));
  const invalidRows: CompanyContactImportPreview["invalidRows"] = [];
  const duplicates: CompanyContactImportPreview["duplicates"] = [];
  const conflicts: CompanyContactImportPreview["conflicts"] = [];
  const proposedNewRecords: Array<Record<string, string>> = [];
  const proposedUpdates: Array<Record<string, string>> = [];
  const skippedRows: CompanyContactImportPreview["skippedRows"] = [];
  const validRows: Array<Record<string, string>> = [];
  const seen = new Set<string>();

  if (missing.length > 0) {
    return {
      importType,
      totalRows: rows.length,
      validRows: [],
      invalidRows: [{ rowNumber: 1, reason: `Missing required header: ${missing.join(", ")}` }],
      duplicates: [],
      conflicts: [],
      proposedNewRecords: [],
      proposedUpdates: [],
      skippedRows: rows.map((row) => ({
        rowNumber: row.rowNumber,
        reason: "Header validation failed.",
      })),
      summary: { imported: 0, updated: 0, skipped: rows.length, invalid: 1, conflicts: 0 },
    };
  }

  for (const row of rows) {
    const values = importType === "COMPANY" ? classifyCompanyRow(row.values) : row.values;
    const key =
      importType === "COMPANY" ? normalizeDomain(values.domain ?? "") : contactKey(values);
    if (hasFormula(values)) {
      invalidRows.push({
        rowNumber: row.rowNumber,
        reason: "Spreadsheet formula values are not allowed.",
      });
      continue;
    }
    if (required.some((header) => !values[header]?.trim())) {
      invalidRows.push({ rowNumber: row.rowNumber, reason: "Required fields are missing." });
      continue;
    }
    if (!validDomain(values.domain ?? "")) {
      invalidRows.push({ rowNumber: row.rowNumber, reason: "Invalid domain." });
      continue;
    }
    if (values.professional_profile_url && !validUrl(values.professional_profile_url)) {
      invalidRows.push({ rowNumber: row.rowNumber, reason: "Invalid professional profile URL." });
      continue;
    }
    if (values.business_email && !validEmail(values.business_email)) {
      invalidRows.push({ rowNumber: row.rowNumber, reason: "Invalid business email." });
      continue;
    }
    if (seen.has(key)) {
      duplicates.push({ rowNumber: row.rowNumber, key });
      skippedRows.push({ rowNumber: row.rowNumber, reason: "Duplicate row in CSV." });
      continue;
    }
    seen.add(key);
    validRows.push(values);
    const exists =
      importType === "COMPANY" ? existingCompanyDomains.has(key) : existingContactKeys.has(key);
    if (exists) {
      conflicts.push({
        rowNumber: row.rowNumber,
        key,
        reason: "Matching enrichment record already exists.",
      });
      if (mode === "ADD_NEW_AND_UPDATE") {
        proposedUpdates.push(values);
      } else {
        skippedRows.push({
          rowNumber: row.rowNumber,
          reason: "Existing record; add-new-only mode.",
        });
      }
    } else {
      proposedNewRecords.push(values);
    }
  }
  return {
    importType,
    totalRows: rows.length,
    validRows,
    invalidRows,
    duplicates,
    conflicts,
    proposedNewRecords,
    proposedUpdates,
    skippedRows,
    summary: {
      imported: proposedNewRecords.length,
      updated: proposedUpdates.length,
      skipped: skippedRows.length,
      invalid: invalidRows.length,
      conflicts: conflicts.length,
    },
  };
}

async function authorizeAdmin(rawInput: unknown, dependencies: CompanyContactImportDependencies) {
  const parsed = importInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false as const,
      result: err("VALIDATION_ERROR", "Company/contact import input is malformed."),
    };
  }
  const creatorId = parsed.data.creatorId ?? "seed-admin-user";
  const persistence = dependencies.persistence ?? new PrismaCompanyContactImportPersistence();
  const actor = await persistence.getActor(creatorId);
  if (!actor || actor.role !== "KNOWLEDGE_ADMIN") {
    return {
      ok: false as const,
      result: err("FORBIDDEN", "Only knowledge admins can import company/contact data."),
    };
  }
  return { ok: true as const, parsed: parsed.data, creatorId, persistence };
}

export async function previewCompanyContactImport(
  rawInput: unknown,
  dependencies: CompanyContactImportDependencies = {},
) {
  const authorized = await authorizeAdmin(rawInput, dependencies);
  if (!authorized.ok) return authorized.result;
  const preview = buildCompanyContactImportPreview(
    authorized.parsed.csvText,
    authorized.parsed.importType,
    authorized.parsed.mode,
    await authorized.persistence.getExistingCompanyDomains(),
    await authorized.persistence.getExistingContactKeys(),
  );
  return ok(preview);
}

export async function confirmCompanyContactImport(
  rawInput: unknown,
  dependencies: CompanyContactImportDependencies = {},
) {
  const authorized = await authorizeAdmin(rawInput, dependencies);
  if (!authorized.ok) return authorized.result;
  const preview = buildCompanyContactImportPreview(
    authorized.parsed.csvText,
    authorized.parsed.importType,
    authorized.parsed.mode,
    await authorized.persistence.getExistingCompanyDomains(),
    await authorized.persistence.getExistingContactKeys(),
  );
  if (preview.invalidRows.length > 0) {
    return err("IMPORT_INVALID", "CSV contains invalid rows; no records were imported.");
  }
  return ok(
    await authorized.persistence.confirmImport({
      creatorId: authorized.creatorId,
      filename: authorized.parsed.filename,
      importType: authorized.parsed.importType,
      mode: authorized.parsed.mode,
      preview,
    }),
  );
}
