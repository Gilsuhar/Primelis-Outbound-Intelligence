import { addKnowledgeSchema, createLocalSubmission } from "@/lib/validation/add-knowledge";

import { err, ok } from "./result";

export function createKnowledgeSubmission(input: unknown) {
  const parsed = addKnowledgeSchema.safeParse(input);

  if (!parsed.success) {
    return err("VALIDATION_ERROR", "Knowledge submission input is malformed.");
  }

  return ok(createLocalSubmission(parsed.data));
}
