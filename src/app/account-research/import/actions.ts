"use server";

import {
  confirmCompanyContactImport,
  previewCompanyContactImport,
} from "@/server/services/company-contact-import-service";
import { withAuthenticatedReviewActor } from "@/lib/auth/action-actor";

export async function previewCompanyContactImportAction(input: unknown) {
  const authenticated = await withAuthenticatedReviewActor(input);
  return previewCompanyContactImport(authenticated.input);
}

export async function confirmCompanyContactImportAction(input: unknown) {
  const authenticated = await withAuthenticatedReviewActor(input);
  return confirmCompanyContactImport(authenticated.input);
}
