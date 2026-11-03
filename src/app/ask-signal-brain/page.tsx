import { AskSignalBrainClient } from "@/features/ask-signal-brain/ask-signal-brain-client";
import { requireCurrentUser } from "@/lib/auth/server";

export default async function AskSignalBrainPage() {
  await requireCurrentUser();
  return <AskSignalBrainClient />;
}
