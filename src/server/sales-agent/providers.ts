import "server-only";

import type {
  EvidenceObservation,
  IntakeContact,
  ProviderId,
} from "@/features/sales-agent/evidence";

export type ProviderStatus = {
  provider: ProviderId;
  status: "CONNECTED" | "NOT_CONFIGURED" | "ERROR";
  message: string;
};
export type IntakeBatch = {
  contacts: IntakeContact[];
  complete: boolean;
  warnings: string[];
  nextCursor?: string;
};
export interface ContactIntakeAdapter {
  listOwnedContacts(after?: string): Promise<IntakeBatch>;
}
/** Server-registered adapters only. No browser-supplied verification or provider selection. */
export interface ProspectEvidenceAdapter {
  provider: ProviderId;
  collect(
    contact: IntakeContact,
    now: Date,
  ): Promise<{ observations: EvidenceObservation[]; blockers: string[] }>;
}
export const disconnectedProviders: ProviderStatus[] = [
  { provider: "SIMILARWEB", status: "NOT_CONFIGURED", message: "No Similarweb connector enabled" },
  {
    provider: "ZOOMINFO",
    status: "NOT_CONFIGURED",
    message: "No ZoomInfo validation connector enabled",
  },
  {
    provider: "OUTREACH",
    status: "NOT_CONFIGURED",
    message: "Connect read-only Outreach history, suppression and sequence checks",
  },
  {
    provider: "INDEPENDENT_VERIFICATION",
    status: "NOT_CONFIGURED",
    message: "Independent employment and business-email verification required",
  },
];
