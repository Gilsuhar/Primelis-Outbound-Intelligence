"use server";

import {
  confirmSuppressionImport,
  previewSuppressionImport,
} from "@/server/services/suppression-import-service";

export async function previewSuppressionImportAction(input: unknown) {
  return previewSuppressionImport(input);
}

export async function confirmSuppressionImportAction(input: unknown) {
  return confirmSuppressionImport(input);
}
