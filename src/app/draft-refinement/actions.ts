"use server";

import {
  getDraftRefinementState,
  refineDraftVersion,
  restoreDraftVersion,
  saveManualDraftEdit,
} from "@/server/services/draft-versioning-service";

export async function getDraftRefinementStateAction(input: unknown) {
  return getDraftRefinementState(input);
}

export async function refineDraftVersionAction(input: unknown) {
  return refineDraftVersion(input);
}

export async function saveManualDraftEditAction(input: unknown) {
  return saveManualDraftEdit(input);
}

export async function restoreDraftVersionAction(input: unknown) {
  return restoreDraftVersion(input);
}
