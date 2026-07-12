import { addKnowledgeSchema } from "@/lib/validation/add-knowledge";
import { getPersistenceAdapter } from "@/server/repositories/adapter-factory";

import { err, ok } from "./result";

export async function createKnowledgeSubmission(input: unknown) {
  const parsed = addKnowledgeSchema.safeParse(input);

  if (!parsed.success) {
    return err("VALIDATION_ERROR", "Knowledge submission input is malformed.");
  }

  const repositories = getPersistenceAdapter();

  return ok(await repositories.submissions.createSubmission(parsed.data));
}
