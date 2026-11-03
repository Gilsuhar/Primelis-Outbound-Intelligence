import "server-only";

import { isSuppressionBlocked } from "@/features/do-not-contact/do-not-contact-policy";
import type { DoNotContactRecord } from "@/features/do-not-contact/types";
import type { IntakeContact } from "@/features/sales-agent/evidence";
import type { ProspectEvidenceAdapter } from "./providers";

export class LocalSuppressionAdapter implements ProspectEvidenceAdapter {
  readonly provider = "LOCAL_SUPPRESSION" as const;
  constructor(private readonly records: DoNotContactRecord[]) {}
  async collect(contact: IntakeContact, now: Date) {
    const matches = this.records.filter(
      (record) =>
        isSuppressionBlocked(record) &&
        ((record.domain &&
          contact.companyDomain &&
          record.domain.toLowerCase() === contact.companyDomain.toLowerCase()) ||
          (contact.companyName &&
            record.companyName.trim().toLowerCase() === contact.companyName.trim().toLowerCase())),
    );
    return {
      observations: matches.map((record) => ({
        hubspotRecordId: contact.hubspotRecordId,
        field: "accountSuppression" as const,
        value: `${record.status}${record.reason ? `: ${record.reason}` : ""}`,
        provider: this.provider,
        sourceRecordId: record.id,
        observedAt: now.toISOString(),
        verifiedAt: null,
        independent: false,
        supportingEvidence: [],
      })),
      blockers: [],
    };
  }
}
