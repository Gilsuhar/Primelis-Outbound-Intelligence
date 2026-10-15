import { requireCurrentUser } from "@/lib/auth/server";
import { EvidenceReviewClient } from "@/features/sales-agent/evidence-review-client";

export default async function SalesAgentPage() {
  await requireCurrentUser();
  return <EvidenceReviewClient />;
}
