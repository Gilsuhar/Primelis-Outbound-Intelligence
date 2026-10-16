import { requireCurrentUser } from "@/lib/auth/server";
import { WorkforceDashboard } from "@/features/agent-workforce/dashboard/dashboard-client";
export default async function ProspectPage({ params }: { params: Promise<{ contactId: string }> }) {
  await requireCurrentUser();
  return <WorkforceDashboard contactId={(await params).contactId} />;
}
