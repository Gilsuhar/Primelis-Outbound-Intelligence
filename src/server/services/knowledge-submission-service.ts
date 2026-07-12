import { addKnowledgeSchema } from "@/lib/validation/add-knowledge";
import {
  resolvePersistenceRepositories,
  type ServiceDependencies,
} from "@/server/services/dependencies";

import { err, ok } from "./result";

export async function createKnowledgeSubmission(
  input: unknown,
  dependencies?: ServiceDependencies,
) {
  const parsed = addKnowledgeSchema.safeParse(input);

  if (!parsed.success) {
    return err("VALIDATION_ERROR", "Knowledge submission input is malformed.");
  }

  const repositories = resolvePersistenceRepositories(dependencies);

  return ok(await repositories.submissions.createSubmission(parsed.data));
}
