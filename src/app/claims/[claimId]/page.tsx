import { ClaimDetails } from "@/features/claims/claim-details";
import { retrieveClaimDetails } from "@/server/services/claim-details-service";

export default async function ClaimDetailsPage({
  params,
}: {
  params: Promise<{ claimId: string }>;
}) {
  const { claimId } = await params;
  const result = await retrieveClaimDetails({ claimId });

  return <ClaimDetails claimId={claimId} initialDetails={result.ok ? result.data : undefined} />;
}
