import { z } from "zod";

import { fixtureUsers, knowledgeSubmissionFixtures } from "@/data/fixtures/knowledge-fixtures";
import { applyStatusTransition, reviewActionTargets } from "@/features/review/status-transition";

import { err, ok } from "./result";

const transitionInputSchema = z.object({
  actorId: z.string().min(1),
  submissionId: z.string().min(1),
  action: z.enum(["APPROVE", "RESTRICT", "ARCHIVE", "REJECT", "RETURN_TO_REVIEW"]),
  reason: z.string().trim().optional(),
  internalNote: z.string().trim().optional(),
});

export function transitionReviewStatus(input: unknown) {
  const parsed = transitionInputSchema.safeParse(input);

  if (!parsed.success) {
    return err("VALIDATION_ERROR", "Review status transition input is malformed.");
  }

  const actor = fixtureUsers.find((user) => user.id === parsed.data.actorId);
  const submission = knowledgeSubmissionFixtures.find(
    (item) => item.id === parsed.data.submissionId,
  );

  if (!actor) {
    return err("ACTOR_NOT_FOUND", "The review actor was not found.");
  }

  if (!submission) {
    return err("SUBMISSION_NOT_FOUND", "The review submission was not found.");
  }

  const result = applyStatusTransition({
    actor,
    submission,
    action: parsed.data.action,
    reason: parsed.data.reason,
    internalNote: parsed.data.internalNote,
  });

  if (!result.ok) {
    return err(result.code, result.message);
  }

  return ok({
    submission: result.submission,
    nextStatus: reviewActionTargets[parsed.data.action],
  });
}
