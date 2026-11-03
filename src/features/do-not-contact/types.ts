export const suppressionStatuses = [
  "EXISTING_CUSTOMER",
  "ACTIVE_OPPORTUNITY",
  "OWNED_BY_ANOTHER_REP",
  "RECENTLY_CONTACTED",
  "PARTNER",
  "DO_NOT_CONTACT",
  "RESTRICTED_TERRITORY",
] as const;

export type SuppressionStatus = (typeof suppressionStatuses)[number];

export type DoNotContactRecord = {
  id: string;
  companyName: string;
  domain?: string;
  status: SuppressionStatus;
  product?: string;
  country?: string;
  owner?: string;
  reason?: string;
  lastContactDate?: string;
  notes?: string;
};

export type SuppressionSearchResult = {
  record: DoNotContactRecord;
  blocked: boolean;
  label: string;
};
