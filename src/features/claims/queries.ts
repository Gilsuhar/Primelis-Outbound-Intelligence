import { claimFixtures, sourceDocumentFixtures } from "@/data/fixtures/knowledge-fixtures";

export function getClaimById(claimId: string) {
  return claimFixtures.find((claim) => claim.id === claimId);
}

export function getClaimSources(claimId: string) {
  const claim = getClaimById(claimId);

  if (!claim) {
    return [];
  }

  return sourceDocumentFixtures.filter((source) => claim.sourceIds.includes(source.id));
}

export function getClaimDetailsState(claimId: string) {
  const claim = getClaimById(claimId);

  if (!claim) {
    return "NOT_FOUND" as const;
  }

  return {
    state: "FOUND" as const,
    claim,
    sources: getClaimSources(claimId),
    warnings: {
      missingSource: claim.sourceIds.length === 0,
      restricted: claim.approvalStatus === "RESTRICTED",
      notApproved: claim.approvalStatus !== "APPROVED",
    },
  };
}
