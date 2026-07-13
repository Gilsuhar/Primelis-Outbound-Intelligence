import "server-only";

import { requireCurrentUser, requireRole } from "@/lib/auth/server";

export async function withAuthenticatedCreator(input: unknown) {
  const actor = await requireCurrentUser();
  return {
    actor,
    input:
      typeof input === "object" && input !== null
        ? { ...input, creatorId: actor.id }
        : { creatorId: actor.id },
  };
}

export async function withAuthenticatedReviewActor(input: unknown) {
  const actor = await requireRole("KNOWLEDGE_ADMIN");
  return {
    actor,
    input:
      typeof input === "object" && input !== null
        ? { ...input, actorId: actor.id, creatorId: actor.id }
        : { actorId: actor.id, creatorId: actor.id },
  };
}
