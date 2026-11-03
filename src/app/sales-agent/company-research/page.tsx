import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/server";
import { requireLocalCompanyAccess } from "@/server/agent-workforce/company-research/config";
import { CompanyResearchClient } from "@/features/agent-workforce/company-research/company-research-client";
import { InternalCompanyReview } from "@/features/agent-workforce/company-research/internal-review-client";
export default async function CompanyResearchPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string | string[] }>;
}) {
  const actor = await requireCurrentUser();
  const query = await searchParams;
  const initialCompany = typeof query.company === "string" ? query.company.slice(0, 200) : "";
  try {
    requireLocalCompanyAccess(actor.id);
  } catch {
    notFound();
  }
  return (
    <div className="space-y-6">
      <Link className="inline-flex min-h-11 items-center underline" href="/sales-agent">
        ← Agent Workforce dashboard
      </Link>
      <h1 className="text-2xl font-semibold">Signal Sales Agent</h1>
      <InternalCompanyReview key={initialCompany} initialCompany={initialCompany} />
      <details>
        <summary>Earlier Company Research V1 and saved findings</summary>
        <CompanyResearchClient />
      </details>
    </div>
  );
}
