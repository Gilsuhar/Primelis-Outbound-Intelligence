import { getPersistenceAdapter } from "@/server/repositories/adapter-factory";

import { ok } from "./result";

export async function retrieveReviewQueue() {
  const repositories = getPersistenceAdapter();

  return ok({
    submissions: await repositories.submissions.getReviewableSubmissions(),
    mode: repositories.mode,
  });
}
