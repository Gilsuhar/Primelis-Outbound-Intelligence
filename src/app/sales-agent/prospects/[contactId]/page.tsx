import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/server";
import { WorkforceDashboard } from "@/features/agent-workforce/dashboard/dashboard-client";
export default async function ProspectPage({ params }: { params: Promise<{ contactId: string }> }) {
  await requireCurrentUser();
  return (
    <div className="space-y-4">
      <WorkforceDashboard contactId={(await params).contactId} />
      {process.env.NODE_ENV === "development" && !process.env.VERCEL_ENV && (
        <Link
          className="inline-flex min-h-11 items-center text-sm underline"
          href="/sales-agent/development/drafts"
        >
          Development-only synthetic research preview · never approved outreach
        </Link>
      )}
    </div>
  );
}
