import { BuildSequenceClient } from "@/features/build-sequence/build-sequence-client";
import { requireCurrentUser } from "@/lib/auth/server";

export default async function BuildSequencePage() {
  await requireCurrentUser();
  return <BuildSequenceClient />;
}
