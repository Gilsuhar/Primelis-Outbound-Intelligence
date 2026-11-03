import type { RecyclerInput } from "@/features/prospect-recycler/contracts";
import type { QualificationEvidence } from "@/features/prospect-recycler/qualification";
export const qualificationTime = "2026-11-03T09:00:00.000Z";
/** Fictional, test-only receipts. Never used by the review demo or a live collector. */
export function qualifiedFixture(at = qualificationTime): { input: RecyclerInput; qualification: QualificationEvidence } {
  const record = { system: "HUBSPOT" as const, id: "synthetic-hubspot" };
  const proof = { record, email: "review@example.invalid", employerDomain: "example.invalid", providerId: "synthetic-independent", independent: true, checkedAt: at, expiresAt: new Date(Date.parse(at) + 86400000).toISOString(), evidenceId: "synthetic-verification" };
  const checks = (["HUBSPOT", "OUTREACH"] as const).map(system => ({ system, status: system === "HUBSPOT" ? "COMPLETE" as const : "NOT_PRESENT" as const, recordIds: system === "HUBSPOT" ? [record.id] : [], checkedAt: at, authoritative: true, evidenceId: `synthetic-${system}` }));
  const receipt = { hubspotId: record.id, employerDomain: proof.employerDomain, evidenceId: "synthetic-qualification", source: "synthetic-receipt", authoritative: true, checkedAt: at };
  return {
    input: {
      candidateId: JSON.stringify([record.system, record.id]),
      identity: { resolution: "VERIFIED", records: [record], email: proof.email, employerDomain: proof.employerDomain },
      scope: { id: "recycler-all-outbound-email-v1", channels: ["EMAIL"] },
      history: checks.map(check => ({ ...check, scopeId: "recycler-all-outbound-email-v1", channels: ["EMAIL"], from: "2020-01-01T00:00:00Z", through: at, allUsers: true, retentionComplete: true })),
      communications: [{ id: "synthetic-send", record, at: "2024-06-30T09:00:00Z", scopeId: "recycler-all-outbound-email-v1", channel: "EMAIL", direction: "OUTBOUND", outcome: "SENT", relevance: "RELEVANT" }],
      emailVerification: { ...proof, status: "VALID", businessEmail: true },
      employmentVerification: { ...proof, status: "VERIFIED", current: true },
      suppressions: [...checks.map(({ system, ...check }) => ({ ...check, source: system, unsubscribed: false, complained: false, hardBounced: false, doNotContact: false })), { source: "LOCAL", status: "COMPLETE", recordIds: [JSON.stringify([record.system, record.id])], checkedAt: at, authoritative: true, evidenceId: "synthetic-local", unsubscribed: false, complained: false, hardBounced: false, doNotContact: false }],
      sequences: checks.map(check => ({ ...check, states: [] })),
    },
    qualification: {
      ownership: { ...receipt, ownerId: "1087915602" },
      company: { ...receipt, name: "Fictional Search Company", employees: 80, annualRevenueUsd: 30_000_000 },
      responsibility: { ...receipt, title: "Director of Paid Search", seniority: "DIRECTOR", searchResponsibility: true, paidSocialOnly: false },
      opportunities: { ...receipt, coverage: "COMPLETE", activeConflict: false },
    },
  };
}
