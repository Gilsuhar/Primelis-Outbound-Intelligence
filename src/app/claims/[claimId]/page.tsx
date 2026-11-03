import { ClaimDetails } from "@/features/claims/claim-details";
import { requireRole } from "@/lib/auth/server";
import { retrieveClaimDetails } from "@/server/services/claim-details-service";

export default async function ClaimDetailsPage({
  params,
}: {
  params: Promise<{ claimId: string }>;
}) {
  await requireRole("KNOWLEDGE_ADMIN");
  const { claimId } = await params;
  const result = await retrieveClaimDetails({ claimId });

  return <ClaimDetails claimId={claimId} initialDetails={result.ok ? result.data : undefined} />;
}
