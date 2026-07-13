import type { SuppressionStatus } from "./types";

export const suppressionImportModes = ["ADD_NEW_ONLY", "ADD_NEW_AND_UPDATE"] as const;

export type SuppressionImportMode = (typeof suppressionImportModes)[number];

export type SuppressionCsvRow = {
  companyName: string;
  domain?: string;
  status: SuppressionStatus;
  accountOwner?: string;
  reason?: string;
  source?: string;
  lastContactDate?: string;
  notes?: string;
};

export type SuppressionImportPreview = {
  totalRows: number;
  validRows: SuppressionCsvRow[];
  invalidRows: Array<{ rowNumber: number; reason: string }>;
  duplicates: Array<{ rowNumber: number; key: string }>;
  conflicts: Array<{ rowNumber: number; companyName: string; reason: string }>;
  proposedNewRecords: SuppressionCsvRow[];
  proposedUpdates: SuppressionCsvRow[];
  skippedRows: Array<{ rowNumber: number; reason: string }>;
  summary: {
    imported: number;
    updated: number;
    skipped: number;
    invalid: number;
    conflicts: number;
  };
};
