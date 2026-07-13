"use server";

import {
  bulkReviewImportedSignalRecords,
  reviewImportedSignalRecord,
} from "@/server/services/imported-signal-review-service";
import { withAuthenticatedReviewActor } from "@/lib/auth/action-actor";

export async function reviewImportedSignalRecordAction(input: unknown) {
  const authenticated = await withAuthenticatedReviewActor(input);
  return reviewImportedSignalRecord(authenticated.input);
}

export async function bulkReviewImportedSignalRecordsAction(input: unknown) {
  const authenticated = await withAuthenticatedReviewActor(input);
  return bulkReviewImportedSignalRecords(authenticated.input);
}
