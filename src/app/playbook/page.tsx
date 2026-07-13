import { PlaybookClient } from "@/features/playbook/playbook-client";
import { getTrustedRoleContext } from "@/lib/role-context";
import { getSignalPlaybookData } from "@/server/services/signal-playbook-service";

export default async function PlaybookPage() {
  const [data, viewer] = await Promise.all([getSignalPlaybookData(), getTrustedRoleContext()]);

  return <PlaybookClient data={data} viewerRole={viewer.role} />;
}
