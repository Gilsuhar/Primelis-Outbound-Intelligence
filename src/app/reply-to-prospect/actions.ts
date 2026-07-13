"use server";

import { generateReplyToProspect } from "@/server/services/reply-to-prospect-service";
import { withAuthenticatedCreator } from "@/lib/auth/action-actor";

export async function generateReplyToProspectAction(input: unknown) {
  const authenticated = await withAuthenticatedCreator(input);
  return generateReplyToProspect(authenticated.input);
}
