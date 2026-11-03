import { requireCurrentUser } from "@/lib/auth/server";
import { LegacyEvidencePanel } from "@/features/agent-workforce/dashboard/legacy-evidence-panel";
import { WorkforceDashboard } from "@/features/agent-workforce/dashboard/dashboard-client";
import Link from "next/link";
import { localDevelopmentConfig } from "@/lib/auth/local-development";
export default async function SalesAgentPage() {
  await requireCurrentUser();
  return (
    <div className="space-y-8">
      {!localDevelopmentConfig() && (
        <Link
          className="inline-flex min-h-11 items-center font-semibold underline"
          href="/sales-agent/signal-opportunity"
        >
          Signal Opportunity Research — primary workflow (offline preview)
        </Link>
      )}
      {localDevelopmentConfig() && (
        <Link
          className="inline-flex min-h-11 items-center font-semibold underline"
          href="/sales-agent/company-research"
        >
          Research a company · internal email drafts
        </Link>
      )}
      <WorkforceDashboard />
      <LegacyEvidencePanel />
    </div>
  );
}
