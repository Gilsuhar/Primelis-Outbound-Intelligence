import { ClaimDetails } from "@/features/claims/claim-details";

export default async function ClaimDetailsPage({
  params,
}: {
  params: Promise<{ claimId: string }>;
}) {
  const { claimId } = await params;

  return <ClaimDetails claimId={claimId} />;
}
