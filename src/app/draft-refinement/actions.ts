"use server";

import {
  refineDraftVersion,
  restoreDraftVersion,
  saveManualDraftEdit,
} from "@/server/services/draft-versioning-service";

export async function refineDraftVersionAction(input: unknown) {
  return refineDraftVersion(input);
}

export async function saveManualDraftEditAction(input: unknown) {
  return saveManualDraftEdit(input);
}

export async function restoreDraftVersionAction(input: unknown) {
  return restoreDraftVersion(input);
}
