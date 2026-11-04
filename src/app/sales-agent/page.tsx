import { requireCurrentUser } from "@/lib/auth/server";
import { LegacyEvidencePanel } from "@/features/agent-workforce/dashboard/legacy-evidence-panel";
import { WorkforceDashboard } from "@/features/agent-workforce/dashboard/dashboard-client";
import Link from "next/link";
import { localDevelopmentConfig } from "@/lib/auth/local-development";
export default async function SalesAgentPage() {
  await requireCurrentUser();
  return (
    <div className="space-y-8">
      <Link
        className="block rounded-2xl border border-line bg-white p-6 shadow-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-olive"
        href="/sales-agent/recycler"
      >
        <strong className="text-xl text-ink">Open daily prospect workspace →</strong>
        <p className="text-muted mt-2 text-sm">
          Review eligibility, evidence gaps, company research and email drafts. Offline examples are
          clearly labeled; sending remains subject to separate human approval.
        </p>
      </Link>
      {!localDevelopmentConfig() && (
        <Link
          className="inline-flex min-h-11 items-center font-semibold underline"
          href="/sales-agent/signal-opportunity"
        >
          Signal Opportunity Research (offline preview)
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
