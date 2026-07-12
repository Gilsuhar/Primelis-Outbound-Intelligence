"use server";

import { generateReplyToProspect } from "@/server/services/reply-to-prospect-service";

export async function generateReplyToProspectAction(input: unknown) {
  return generateReplyToProspect(input);
}
