"use server";

import { createKnowledgeSubmission } from "@/server/services/knowledge-submission-service";
import { withAuthenticatedCreator } from "@/lib/auth/action-actor";

export async function createKnowledgeSubmissionAction(input: unknown) {
  const authenticated = await withAuthenticatedCreator(input);
  return createKnowledgeSubmission(authenticated.input);
}
