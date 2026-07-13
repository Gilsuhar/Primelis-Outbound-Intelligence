"use server";

import {
  confirmCompanyContactImport,
  previewCompanyContactImport,
} from "@/server/services/company-contact-import-service";

export async function previewCompanyContactImportAction(input: unknown) {
  return previewCompanyContactImport(input);
}

export async function confirmCompanyContactImportAction(input: unknown) {
  return confirmCompanyContactImport(input);
}
