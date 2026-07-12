import { z } from "zod";

import { generatedDraftFixtures } from "@/data/fixtures/knowledge-fixtures";
import { knowledgeTypes, userRoles } from "@/features/knowledge/types";
import { submitGeneratedDraftForReview } from "@/features/generated-drafts/generated-draft-service";

import { err, ok } from "./result";

const generatedDraftSubmissionSchema = z.object({
  generatedDraftId: z.string().min(1),
  title: z.string().trim().min(3),
  suggestedType: z.enum(knowledgeTypes),
  submitterRole: z.enum(userRoles),
  sourceIds: z.array(z.string()).optional(),
});

export function submitGeneratedDraftBoundary(input: unknown) {
  const parsed = generatedDraftSubmissionSchema.safeParse(input);

  if (!parsed.success) {
    return err("VALIDATION_ERROR", "Generated draft submission input is malformed.");
  }

  const draft = generatedDraftFixtures.find((item) => item.id === parsed.data.generatedDraftId);

  if (!draft) {
    return err("GENERATED_DRAFT_NOT_FOUND", "The generated draft was not found.");
  }

  return ok(
    submitGeneratedDraftForReview({
      draft,
      title: parsed.data.title,
      suggestedType: parsed.data.suggestedType,
      submitterRole: parsed.data.submitterRole,
      sourceIds: parsed.data.sourceIds,
    }),
  );
}
