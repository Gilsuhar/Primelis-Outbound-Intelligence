import type { DoNotContactRecord } from "@/features/do-not-contact/types";
import type {
  EvidenceObservation,
  IntakeContact,
  ProviderId,
} from "@/features/sales-agent/evidence";
import type { EvidenceSnapshot, EvidenceStore } from "@/server/sales-agent/evidence-store";
import type { ProspectEvidenceAdapter } from "@/server/sales-agent/providers";

export const collectionNow = new Date("2026-10-15T12:00:00.000Z");
export const collectedContact: IntakeContact = {
  hubspotRecordId: "42",
  ownerId: "1087915602",
  fullName: "Fixture Prospect",
  email: "prospect@example.com",
  companyName: "Fixture Company",
  companyDomain: "example.com",
  emailModifiedAt: "2026-10-14T08:00:00.000Z",
  observedAt: collectionNow.toISOString(),
  observations: [],
  warnings: [],
};
export function observation(
  field: EvidenceObservation["field"],
  value: unknown,
  provider: ProviderId = "ZOOMINFO",
  override: Partial<EvidenceObservation> = {},
): EvidenceObservation {
  return {
    hubspotRecordId: "42",
    field,
    value,
    provider,
    sourceRecordId: `fixture:${provider}:42:${field}`,
    observedAt: collectionNow.toISOString(),
    verifiedAt: "2026-10-15T08:00:00.000Z",
    independent: true,
    supportingEvidence: ["fixture supporting provider record; not a live observation"],
    subjectEmail: "prospect@example.com",
    subjectCompanyDomain: "example.com",
    ...override,
  };
}
export const verifiedObservations: EvidenceObservation[] = [
  observation("employeeCount", 100),
  observation("annualRevenueUsd", 50_000_000),
  observation("role", "Head of Paid Search"),
  observation("currentEmploymentVerified", true),
  observation("emailVerification", {
    status: "VALID",
    independentlyVerified: true,
    emailMatchesCurrentRecord: true,
    businessEmailVerified: true,
  }),
  observation("unsubscribed", false, "OUTREACH"),
  observation("hardBounced", false, "OUTREACH"),
  observation("complained", false, "OUTREACH"),
  observation("activeSequence", false, "OUTREACH"),
  observation("outreachHistoryComplete", true, "OUTREACH"),
  observation("lastOutboundAt", null, "OUTREACH"),
  observation("conflictingActiveOpportunity", false, "HUBSPOT"),
];
export function fixtureProviders(items = verifiedObservations): ProspectEvidenceAdapter[] {
  return [...new Set(items.map((item) => item.provider))].map((provider) => ({
    provider,
    collect: async () => ({
      observations: structuredClone(items.filter((item) => item.provider === provider)),
      blockers: [],
    }),
  }));
}
export class MemoryEvidenceStore implements EvidenceStore {
  readonly actors = new Map<string, Map<string, EvidenceSnapshot>>();
  async save(actorId: string, snapshots: EvidenceSnapshot[]) {
    const records = this.actors.get(actorId) ?? new Map<string, EvidenceSnapshot>();
    snapshots.forEach((snapshot) =>
      records.set(snapshot.contact.hubspotRecordId, structuredClone(snapshot)),
    );
    this.actors.set(actorId, records);
  }
  async list(actorId: string) {
    return [...(this.actors.get(actorId)?.values() ?? [])];
  }
  async edit(
    actorId: string,
    contactId: string,
    update: (raw: unknown) => EvidenceSnapshot | null,
  ) {
    const current = this.actors.get(actorId)?.get(contactId);
    if (!current) return false;
    const next = update(structuredClone(current));
    if (!next) return false;
    await this.save(actorId, [next]);
    return true;
  }
  async suppressionRecords(): Promise<DoNotContactRecord[]> {
    return [];
  }
}
