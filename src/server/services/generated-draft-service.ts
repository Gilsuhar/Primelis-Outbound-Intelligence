import { z } from "zod";

import { knowledgeTypes, userRoles } from "@/features/knowledge/types";
import { getPersistenceAdapter } from "@/server/repositories/adapter-factory";

import { err, ok } from "./result";

const generatedDraftSubmissionSchema = z.object({
  generatedDraftId: z.string().min(1),
  title: z.string().trim().min(3),
  suggestedType: z.enum(knowledgeTypes),
  submitterRole: z.enum(userRoles),
  sourceIds: z.array(z.string()).optional(),
});

export async function submitGeneratedDraftBoundary(input: unknown) {
  const parsed = generatedDraftSubmissionSchema.safeParse(input);

  if (!parsed.success) {
    return err("VALIDATION_ERROR", "Generated draft submission input is malformed.");
  }

  const repositories = getPersistenceAdapter();
  const draft = await repositories.generatedDrafts.getGeneratedDraftById(
    parsed.data.generatedDraftId,
  );

  if (!draft) {
    return err("GENERATED_DRAFT_NOT_FOUND", "The generated draft was not found.");
  }

  return ok(await repositories.generatedDrafts.submitGeneratedDraftForReview(parsed.data));
}
