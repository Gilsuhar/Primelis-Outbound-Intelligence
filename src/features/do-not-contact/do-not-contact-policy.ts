import type { DoNotContactRecord, SuppressionSearchResult } from "./types";
import { hubspotSuppressionRecords } from "./hubspot-suppression-records";

export const emptySuppressionRecords: DoNotContactRecord[] = [];
export const defaultSuppressionRecords: DoNotContactRecord[] = hubspotSuppressionRecords;

const blockedStatuses = new Set([
  "EXISTING_CUSTOMER",
  "ACTIVE_OPPORTUNITY",
  "OWNED_BY_ANOTHER_REP",
  "RECENTLY_CONTACTED",
  "DO_NOT_CONTACT",
  "RESTRICTED_TERRITORY",
]);

export function isSuppressionBlocked(record: DoNotContactRecord) {
  return blockedStatuses.has(record.status);
}

export function searchDoNotContactRecords(
  records: DoNotContactRecord[],
  query: string,
): SuppressionSearchResult[] {
  const normalized = query.trim().toLowerCase();
  const matches = normalized
    ? records.filter((record) =>
        [record.companyName, record.domain]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(normalized)),
      )
    : records;

  return matches.map((record) => {
    const blocked = isSuppressionBlocked(record);
    return {
      record,
      blocked,
      label: blocked ? "Blocked" : "Allowed with review",
    };
  });
}

export function mergeDefaultSuppressionRecords(records: DoNotContactRecord[]) {
  const existingKeys = new Set(
    records.map((record) => (record.domain ?? record.companyName).trim().toLowerCase()),
  );
  const missingDefaults = defaultSuppressionRecords.filter(
    (record) => !existingKeys.has((record.domain ?? record.companyName).trim().toLowerCase()),
  );
  return [...records, ...missingDefaults];
}
