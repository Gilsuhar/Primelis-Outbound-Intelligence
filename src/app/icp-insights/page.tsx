import { IcpInsightsClient } from "@/features/icp-insights/icp-insights-client";
import { requireCurrentUser } from "@/lib/auth/server";

export default async function IcpInsightsPage() {
  await requireCurrentUser();

  return <IcpInsightsClient />;
}
