"use server";

import { createKnowledgeSubmission } from "@/server/services/knowledge-submission-service";

export async function createKnowledgeSubmissionAction(input: unknown) {
  return createKnowledgeSubmission(input);
}
