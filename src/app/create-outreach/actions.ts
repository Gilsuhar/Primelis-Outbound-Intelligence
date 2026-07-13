"use server";

import { generateCreateOutreach } from "@/server/services/create-outreach-service";
import { withAuthenticatedCreator } from "@/lib/auth/action-actor";

export async function generateCreateOutreachAction(input: unknown) {
  const authenticated = await withAuthenticatedCreator(input);
  return generateCreateOutreach(authenticated.input);
}
