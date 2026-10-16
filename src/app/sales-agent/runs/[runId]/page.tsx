import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/server";
import { WorkforceClient } from "@/features/agent-workforce/workforce-client";
export default async function RunPage({ params }: { params: Promise<{ runId: string }> }) {
  await requireCurrentUser();
  return (
    <div className="space-y-4">
      <Link
        className="inline-flex min-h-11 items-center text-sm font-semibold text-signal underline"
        href="/sales-agent"
      >
        ← Agent Workforce dashboard
      </Link>
      <WorkforceClient initialRunId={(await params).runId} />
    </div>
  );
}
