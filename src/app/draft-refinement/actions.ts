"use server";

import {
  getDraftRefinementState,
  refineDraftVersion,
  restoreDraftVersion,
  saveManualDraftEdit,
} from "@/server/services/draft-versioning-service";
import { withAuthenticatedCreator } from "@/lib/auth/action-actor";

export async function getDraftRefinementStateAction(input: unknown) {
  const authenticated = await withAuthenticatedCreator(input);
  return getDraftRefinementState(authenticated.input);
}

export async function refineDraftVersionAction(input: unknown) {
  const authenticated = await withAuthenticatedCreator(input);
  return refineDraftVersion(authenticated.input);
}

export async function saveManualDraftEditAction(input: unknown) {
  const authenticated = await withAuthenticatedCreator(input);
  return saveManualDraftEdit(authenticated.input);
}

export async function restoreDraftVersionAction(input: unknown) {
  const authenticated = await withAuthenticatedCreator(input);
  return restoreDraftVersion(authenticated.input);
}
