import { requireCurrentUser } from "@/lib/auth/server";
import { LegacyEvidencePanel } from "@/features/agent-workforce/dashboard/legacy-evidence-panel";
import { WorkforceDashboard } from "@/features/agent-workforce/dashboard/dashboard-client";
export default async function SalesAgentPage() {
  await requireCurrentUser();
  return (
    <div className="space-y-8">
      <WorkforceDashboard />
      <LegacyEvidencePanel />
    </div>
  );
}
