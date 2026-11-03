import { z } from "zod";

import { fixtureUsers } from "@/data/fixtures/knowledge-fixtures";
import { reviewActionTargets, type TransitionErrorCode } from "@/features/review/status-transition";
import {
  resolvePersistenceRepositories,
  type ServiceDependencies,
} from "@/server/services/dependencies";

import { err, ok } from "./result";

const transitionInputSchema = z.object({
  actorId: z.string().min(1),
  submissionId: z.string().min(1),
  action: z.enum(["APPROVE", "RESTRICT", "ARCHIVE", "REJECT", "RETURN_TO_REVIEW"]),
  reason: z.string().trim().optional(),
  internalNote: z.string().trim().optional(),
});

function mapTransitionErrorCode(message: string): TransitionErrorCode | "TRANSITION_FAILED" {
  if (message.includes("Only knowledge admins")) {
    return "FORBIDDEN";
  }

  if (message.includes("require at least one source")) {
    return "SOURCE_REQUIRED";
  }

  if (message.includes("status transition is not allowed")) {
    return "INVALID_TRANSITION";
  }

  if (message.includes("Unknown review action")) {
    return "UNKNOWN_ACTION";
  }

  return "TRANSITION_FAILED";
}

export async function transitionReviewStatus(input: unknown, dependencies?: ServiceDependencies) {
  const parsed = transitionInputSchema.safeParse(input);

  if (!parsed.success) {
    return err("VALIDATION_ERROR", "Review status transition input is malformed.");
  }

  const actor = fixtureUsers.find((user) => user.id === parsed.data.actorId);
  if (!actor) {
    return err("ACTOR_NOT_FOUND", "The review actor was not found.");
  }

  const repositories = resolvePersistenceRepositories(dependencies);

  try {
    const submission = await repositories.reviews.transitionStatus({
      actor,
      submissionId: parsed.data.submissionId,
      action: parsed.data.action,
      reason: parsed.data.reason,
      internalNote: parsed.data.internalNote,
    });

    return ok({
      submission,
      nextStatus: reviewActionTargets[parsed.data.action],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Review transition failed.";
    return err(mapTransitionErrorCode(message), message);
  }
}
