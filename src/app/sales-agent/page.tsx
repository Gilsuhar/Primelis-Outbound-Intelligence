import { requireCurrentUser } from "@/lib/auth/server";
import { EvidenceReviewClient } from "@/features/sales-agent/evidence-review-client";

import { WorkforceClient } from "@/features/agent-workforce/workforce-client";

export default async function SalesAgentPage() {
  await requireCurrentUser();
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <WorkforceClient />
      <details>
        <summary>Existing evidence and qualification review</summary>
        <EvidenceReviewClient />
      </details>
    </div>
  );
}
