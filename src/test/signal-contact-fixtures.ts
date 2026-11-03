// Fictional provider receipts only; never a live contact approval.
import {
  collectedContact,
  collectionNow,
  verifiedObservations,
  MemoryEvidenceStore,
} from "@/test/sales-agent-collection-fixtures";
import { AuditIntegrationStore } from "@/test/audit-integration-store";
import { initialState } from "@/server/integrations/contracts";
import type { EvidenceSnapshot } from "@/server/sales-agent/evidence-store";
import type {
  VerificationResult,
  VerificationState,
} from "@/features/sales-agent/verification/contracts";
export const signalContactInput = {
  hubspotRecordId: "42",
  companyName: "Fixture Company",
  companyDomain: "example.com",
  prospectName: "Fixture Prospect",
  prospectTitle: "Head of Paid Search",
};
export async function setupSignalContactFixture() {
  const evidence = new MemoryEvidenceStore(),
    integrations = new AuditIntegrationStore(),
    at = collectionNow.toISOString();
  const identity = {
    hubspotRecordId: "42",
    fullName: collectedContact.fullName,
    email: collectedContact.email,
    companyDomain: collectedContact.companyDomain,
    emailModifiedAt: collectedContact.emailModifiedAt,
  };
  const proof = {
    providerId: "independent-fixture",
    sourceRecordId: "fixture",
    sourceUrl: "https://verification.example/fixture",
    checkedAt: at,
    evidence: ["Synthetic independent evidence"],
    independent: true,
  };
  const results: VerificationResult[] = [
    { kind: "EMAIL", identity, proof, status: "VERIFIED", businessEmail: true },
    {
      kind: "EMPLOYMENT",
      identity,
      proof,
      status: "VERIFIED",
      employerDomain: "example.com",
      current: true,
      role: signalContactInput.prospectTitle,
      seniority: "HEAD",
      searchResponsibility: "PROVEN",
      responsibilityScope: "PAID_SEARCH",
      responsibilityEvidence: ["Explicitly owns paid search campaigns in this fictional scenario."],
    },
  ];
  const verification: VerificationState = {};
  for (const result of results)
    verification[result.kind] = {
      requestKey: "fixture",
      identity,
      providerId: proof.providerId,
      state: "COMPLETED",
      startedAt: at,
      leaseUntil: at,
      nextRetryAt: at,
      attempts: 1,
      message: "fixture",
      result,
    };
  const snapshot: EvidenceSnapshot = {
    version: 1,
    contact: structuredClone(collectedContact),
    observations: structuredClone(verifiedObservations),
    provenanceAtCollection: [],
    blockers: [],
    providers: [],
    collectedAt: at,
    verification,
  };
  await evidence.save("owner", [snapshot]);
  for (const provider of ["HUBSPOT", "OUTREACH"] as const)
    integrations.rows.set(`owner:${provider}`, {
      version: 1,
      secret: null,
      state: {
        ...initialState(provider),
        status: "CONNECTED",
        checkedAt: at,
        lastSuccessfulSync: at,
        coverage: "VISIBLE_RECORDS_ONLY",
        job: {
          id: "fixture",
          requestKey: "fixture",
          mode: "INITIAL",
          status: "COMPLETED",
          since: at,
          until: at,
          pending: [],
          phase: "REFRESH",
          refreshed: [],
          imported: 1,
          updated: 0,
          unchanged: 0,
          attempts: 1,
          startedAt: at,
        },
      },
    });
  return { evidence, integrations, snapshot };
}
