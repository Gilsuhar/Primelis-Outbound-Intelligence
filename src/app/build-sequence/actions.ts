"use server";

import { generateBuildSequence } from "@/server/services/build-sequence-service";
import { withAuthenticatedCreator } from "@/lib/auth/action-actor";

export async function generateBuildSequenceAction(input: unknown) {
  const authenticated = await withAuthenticatedCreator(input);
  return generateBuildSequence(authenticated.input);
}
