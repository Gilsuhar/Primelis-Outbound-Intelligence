import { PlaybookClient } from "@/features/playbook/playbook-client";
import { requireCurrentUser } from "@/lib/auth/server";
import { getSignalPlaybookData } from "@/server/services/signal-playbook-service";

export default async function PlaybookPage() {
  const [data, viewer] = await Promise.all([getSignalPlaybookData(), requireCurrentUser()]);

  return <PlaybookClient data={data} viewerRole={viewer.role} />;
}
