import { randomUUID } from "node:crypto";

import { z } from "zod";

import {
  suppressionImportModes,
  type SuppressionCsvRow,
  type SuppressionImportMode,
  type SuppressionImportPreview,
} from "@/features/do-not-contact/import-types";
import {
  suppressionStatuses,
  type DoNotContactRecord,
  type SuppressionStatus,
} from "@/features/do-not-contact/types";
import { normalizeDomain } from "@/features/connected-research/url-safety";
import { prisma, type MinimalPrismaClient } from "@/lib/prisma";

import { err, ok } from "./result";

type Row = Record<string, unknown>;

const previewSchema = z.object({
  csvText: z.string().min(1).max(250_000),
  filename: z.string().trim().min(1).max(180),
  mode: z.enum(suppressionImportModes),
  creatorId: z.string().trim().min(1).optional(),
});

const confirmSchema = previewSchema;

export type SuppressionImportPersistence = {
  getActor(actorId: string): Promise<{ id: string; role: string } | null>;
  getExistingRecords(): Promise<DoNotContactRecord[]>;
  confirmImport(input: {
    creatorId: string;
    filename: string;
    mode: SuppressionImportMode;
    preview: SuppressionImportPreview;
  }): Promise<{ batchId: string; imported: number; updated: number; skipped: number }>;
};

export type SuppressionImportDependencies = {
  persistence?: SuppressionImportPersistence;
  now?: () => Date;
};

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
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

function rejectFormula(value: string) {
  return /^[=+\-@]/.test(value.trim());
}

function normalizeName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function validDate(value?: string) {
  if (!value) return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value).getTime());
}

function toDoNotContact(record: Row): DoNotContactRecord {
  return {
    id: asString(record.id),
    companyName: asString(record.companyName),
    domain: asString(record.domain) || undefined,
    status: asString(record.status) as SuppressionStatus,
    owner: asString(record.accountOwner) || undefined,
    reason: asString(record.reason) || undefined,
    notes: asString(record.notes) || undefined,
    lastContactDate: asString(record.lastContactDate) || undefined,
  };
}

export class PrismaSuppressionImportPersistence implements SuppressionImportPersistence {
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

  async getExistingRecords() {
    const rows = await this.client.$queryRaw<Row[]>`
      SELECT id, "companyName", domain, status, "accountOwner", reason, notes, "lastContactDate"::text AS "lastContactDate"
      FROM "SuppressionRecord"
    `;
    return rows.map(toDoNotContact);
  }

  async confirmImport({
    creatorId,
    filename,
    mode,
    preview,
  }: {
    creatorId: string;
    filename: string;
    mode: SuppressionImportMode;
    preview: SuppressionImportPreview;
  }) {
    const batchId = randomUUID();
    const summary = { ...preview.summary };
    await this.client.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO "SuppressionImportBatch" (id, "importerId", "sourceFilename", mode, summary, "createdAt")
        VALUES (${batchId}, ${creatorId}, ${filename}, ${mode}, ${JSON.stringify(summary)}::jsonb, NOW())
      `;
      for (const row of preview.proposedNewRecords) {
        const id = randomUUID();
        await tx.$executeRaw`
          INSERT INTO "SuppressionRecord" (
            id, "companyName", "normalizedName", domain, "normalizedDomain", status, "accountOwner", reason, source, "lastContactDate", notes, "createdAt", "updatedAt"
          )
          VALUES (
            ${id}, ${row.companyName}, ${normalizeName(row.companyName)}, ${row.domain ?? null}, ${row.domain ? normalizeDomain(row.domain) : null}, ${row.status},
            ${row.accountOwner ?? null}, ${row.reason ?? null}, ${row.source ?? filename}, ${row.lastContactDate ? new Date(row.lastContactDate) : null}, ${row.notes ?? null}, NOW(), NOW()
          )
        `;
        await tx.$executeRaw`
          INSERT INTO "SuppressionAudit" (id, "suppressionRecordId", "importBatchId", "importerId", action, "newValue", "sourceFilename", "createdAt")
          VALUES (${randomUUID()}, ${id}, ${batchId}, ${creatorId}, 'IMPORTED', ${JSON.stringify(row)}::jsonb, ${filename}, NOW())
        `;
      }
      if (mode === "ADD_NEW_AND_UPDATE") {
        for (const row of preview.proposedUpdates) {
          const keyDomain = row.domain ? normalizeDomain(row.domain) : null;
          const existing = (
            await tx.$queryRaw<Row[]>`
            SELECT id, status, "companyName", domain, "accountOwner", reason, notes
            FROM "SuppressionRecord"
            WHERE (${keyDomain}::text IS NOT NULL AND "normalizedDomain" = ${keyDomain})
               OR "normalizedName" = ${normalizeName(row.companyName)}
            LIMIT 1
          `
          )[0];
          if (!existing) continue;
          await tx.$executeRaw`
            UPDATE "SuppressionRecord"
            SET status = ${row.status}, "accountOwner" = COALESCE("accountOwner", ${row.accountOwner ?? null}), reason = COALESCE(reason, ${row.reason ?? null}), notes = COALESCE(notes, ${row.notes ?? null}), source = ${row.source ?? filename}, "updatedAt" = NOW()
            WHERE id = ${asString(existing.id)}
          `;
          await tx.$executeRaw`
            INSERT INTO "SuppressionAudit" (id, "suppressionRecordId", "importBatchId", "importerId", action, "previousValue", "newValue", "sourceFilename", "createdAt")
            VALUES (${randomUUID()}, ${asString(existing.id)}, ${batchId}, ${creatorId}, 'UPDATED', ${JSON.stringify(existing)}::jsonb, ${JSON.stringify(row)}::jsonb, ${filename}, NOW())
          `;
        }
      }
    });
    return {
      batchId,
      imported: preview.proposedNewRecords.length,
      updated: mode === "ADD_NEW_AND_UPDATE" ? preview.proposedUpdates.length : 0,
      skipped: preview.skippedRows.length,
    };
  }
}

function parseRows(csvText: string) {
  const lines = csvText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (lines.length === 0) {
    return {
      headers: [],
      rows: [] as Array<{ rowNumber: number; values: Record<string, string> }>,
    };
  }
  const headers = parseCsvLine(lines[0]).map((header) => header.trim().toLowerCase());
  return {
    headers,
    rows: lines.slice(1).map((line, index) => {
      const values = parseCsvLine(line);
      return {
        rowNumber: index + 2,
        values: Object.fromEntries(
          headers.map((header, column) => [header, values[column]?.trim() ?? ""]),
        ),
      };
    }),
  };
}

export function buildSuppressionPreview(
  csvText: string,
  existing: DoNotContactRecord[],
  mode: SuppressionImportMode,
): SuppressionImportPreview {
  const { headers, rows } = parseRows(csvText);
  const invalidRows: SuppressionImportPreview["invalidRows"] = [];
  const duplicates: SuppressionImportPreview["duplicates"] = [];
  const conflicts: SuppressionImportPreview["conflicts"] = [];
  const validRows: SuppressionCsvRow[] = [];
  const proposedNewRecords: SuppressionCsvRow[] = [];
  const proposedUpdates: SuppressionCsvRow[] = [];
  const skippedRows: SuppressionImportPreview["skippedRows"] = [];
  const seen = new Set<string>();
  const required = ["company_name", "status"];
  const missing = required.filter((header) => !headers.includes(header));
  if (missing.length > 0) {
    return {
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
    const values = row.values;
    const companyName = values.company_name?.trim();
    const domain = values.domain?.trim() ? normalizeDomain(values.domain) : undefined;
    const status = values.status?.trim() as SuppressionStatus;
    const allValues = Object.values(values);
    if (allValues.some(rejectFormula)) {
      invalidRows.push({
        rowNumber: row.rowNumber,
        reason: "Spreadsheet formula values are not allowed.",
      });
      continue;
    }
    if (!companyName || !status) {
      invalidRows.push({
        rowNumber: row.rowNumber,
        reason: "company_name and status are required.",
      });
      continue;
    }
    if (!suppressionStatuses.includes(status)) {
      invalidRows.push({ rowNumber: row.rowNumber, reason: `Invalid status: ${status}` });
      continue;
    }
    if (domain && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
      invalidRows.push({ rowNumber: row.rowNumber, reason: `Invalid domain: ${domain}` });
      continue;
    }
    if (!validDate(values.last_contact_date)) {
      invalidRows.push({
        rowNumber: row.rowNumber,
        reason: "Invalid last_contact_date; use YYYY-MM-DD.",
      });
      continue;
    }
    const key = domain ?? normalizeName(companyName);
    if (seen.has(key)) {
      duplicates.push({ rowNumber: row.rowNumber, key });
      skippedRows.push({ rowNumber: row.rowNumber, reason: "Duplicate row in CSV." });
      continue;
    }
    seen.add(key);
    const parsed: SuppressionCsvRow = {
      companyName,
      domain,
      status,
      accountOwner: values.account_owner || undefined,
      reason: values.reason || undefined,
      source: values.source || undefined,
      lastContactDate: values.last_contact_date || undefined,
      notes: values.notes || undefined,
    };
    validRows.push(parsed);
    const existingRecord = existing.find((record) =>
      domain && record.domain
        ? normalizeDomain(record.domain) === domain
        : normalizeName(record.companyName) === normalizeName(companyName),
    );
    if (existingRecord) {
      if (existingRecord.status !== parsed.status) {
        conflicts.push({
          rowNumber: row.rowNumber,
          companyName,
          reason: `Existing status ${existingRecord.status}; CSV status ${parsed.status}.`,
        });
      }
      if (mode === "ADD_NEW_AND_UPDATE") {
        proposedUpdates.push(parsed);
      } else {
        skippedRows.push({
          rowNumber: row.rowNumber,
          reason: "Existing record; add-new-only mode.",
        });
      }
    } else {
      proposedNewRecords.push(parsed);
    }
  }
  return {
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

async function authorizeAdmin(rawInput: unknown, dependencies: SuppressionImportDependencies) {
  const parsed = previewSchema.safeParse(rawInput);
  if (!parsed.success)
    return {
      ok: false as const,
      result: err("VALIDATION_ERROR", "Suppression import input is malformed."),
    };
  const creatorId = parsed.data.creatorId ?? "seed-admin-user";
  const persistence = dependencies.persistence ?? new PrismaSuppressionImportPersistence();
  const actor = await persistence.getActor(creatorId);
  if (!actor || actor.role !== "KNOWLEDGE_ADMIN") {
    return {
      ok: false as const,
      result: err("FORBIDDEN", "Only knowledge admins can import suppression data."),
    };
  }
  return { ok: true as const, parsed: parsed.data, creatorId, persistence };
}

export async function previewSuppressionImport(
  rawInput: unknown,
  dependencies: SuppressionImportDependencies = {},
) {
  const authorized = await authorizeAdmin(rawInput, dependencies);
  if (!authorized.ok) return authorized.result;
  const existing = await authorized.persistence.getExistingRecords();
  return ok(buildSuppressionPreview(authorized.parsed.csvText, existing, authorized.parsed.mode));
}

export async function confirmSuppressionImport(
  rawInput: unknown,
  dependencies: SuppressionImportDependencies = {},
) {
  const parsed = confirmSchema.safeParse(rawInput);
  if (!parsed.success) return err("VALIDATION_ERROR", "Suppression import input is malformed.");
  const authorized = await authorizeAdmin(rawInput, dependencies);
  if (!authorized.ok) return authorized.result;
  const existing = await authorized.persistence.getExistingRecords();
  const preview = buildSuppressionPreview(parsed.data.csvText, existing, parsed.data.mode);
  if (preview.invalidRows.length > 0) {
    return err("IMPORT_INVALID", "CSV contains invalid rows; no records were imported.");
  }
  const result = await authorized.persistence.confirmImport({
    creatorId: authorized.creatorId,
    filename: parsed.data.filename,
    mode: parsed.data.mode,
    preview,
  });
  return ok({ ...result, preview });
}
