"use server";

import { askSignalBrain } from "@/server/services/ask-signal-brain-service";

export async function askSignalBrainAction(input: unknown) {
  return askSignalBrain(input);
}
