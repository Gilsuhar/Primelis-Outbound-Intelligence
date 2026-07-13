"use server";

import { askSignalBrain } from "@/server/services/ask-signal-brain-service";
import { withAuthenticatedCreator } from "@/lib/auth/action-actor";

export async function askSignalBrainAction(input: unknown) {
  const authenticated = await withAuthenticatedCreator(input);
  return askSignalBrain(authenticated.input);
}
