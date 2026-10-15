import type { ProspectQualificationInput } from "@/features/sales-agent/qualification";

export const qualificationNow = new Date("2026-10-15T12:00:00.000Z");
export const verifiedEvidence = <T>(value: T) => ({
  value,
  source: "independent-provider",
  verifiedAt: "2026-10-15T08:00:00.000Z",
});
export const eligibleProspect: ProspectQualificationInput = {
  hubspotRecordId: "123",
  hubspotOwnerId: "1087915602",
  employeeCount: verifiedEvidence(80),
  annualRevenueUsd: verifiedEvidence(30_000_000),
  role: verifiedEvidence("Director of Paid Search"),
  currentEmploymentVerified: verifiedEvidence(true),
  employmentIndependentlyVerified: true,
  emailVerification: verifiedEvidence({
    status: "VALID",
    independentlyVerified: true,
    emailMatchesCurrentRecord: true,
    businessEmailVerified: true,
  }),
  lastOutboundAt: verifiedEvidence("2026-06-15T12:00:00.000Z"),
  outreachHistoryComplete: true,
  eligibilityEvidence: verifiedEvidence(true),
  unsubscribed: false,
  hardBounced: false,
  complained: false,
  activeSequence: false,
  conflictingActiveOpportunity: false,
};
