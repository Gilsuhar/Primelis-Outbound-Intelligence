"use server";

import {
  confirmSuppressionImport,
  previewSuppressionImport,
} from "@/server/services/suppression-import-service";
import { withAuthenticatedReviewActor } from "@/lib/auth/action-actor";

export async function previewSuppressionImportAction(input: unknown) {
  const authenticated = await withAuthenticatedReviewActor(input);
  return previewSuppressionImport(authenticated.input);
}

export async function confirmSuppressionImportAction(input: unknown) {
  const authenticated = await withAuthenticatedReviewActor(input);
  return confirmSuppressionImport(authenticated.input);
}
