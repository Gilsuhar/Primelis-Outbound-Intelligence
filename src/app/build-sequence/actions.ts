"use server";

import { generateBuildSequence } from "@/server/services/build-sequence-service";
import { pushSequenceToHubSpot } from "@/server/services/hubspot-push-service";
import { withAuthenticatedCreator } from "@/lib/auth/action-actor";

export async function generateBuildSequenceAction(input: unknown) {
  const authenticated = await withAuthenticatedCreator(input);
  return generateBuildSequence(authenticated.input);
}

export async function pushSequenceToHubSpotAction(input: unknown) {
  const authenticated = await withAuthenticatedCreator(input);
  return pushSequenceToHubSpot(authenticated.input);
}
