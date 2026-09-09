import { BuildSequenceClient } from "@/features/build-sequence/build-sequence-client";
import { requireCurrentUser } from "@/lib/auth/server";

export const maxDuration = 60;

export default async function BuildSequencePage() {
  await requireCurrentUser();
  return <BuildSequenceClient />;
}
