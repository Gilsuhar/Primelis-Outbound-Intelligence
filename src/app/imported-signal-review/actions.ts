"use server";

import {
  bulkReviewImportedSignalRecords,
  reviewImportedSignalRecord,
} from "@/server/services/imported-signal-review-service";

export async function reviewImportedSignalRecordAction(input: unknown) {
  return reviewImportedSignalRecord(input);
}

export async function bulkReviewImportedSignalRecordsAction(input: unknown) {
  return bulkReviewImportedSignalRecords(input);
}
