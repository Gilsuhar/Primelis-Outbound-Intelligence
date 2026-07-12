import { getPersistenceAdapter } from "@/server/repositories/adapter-factory";

import { ok } from "./result";

export async function retrieveApprovedKnowledge() {
  const repositories = getPersistenceAdapter();

  return ok(await repositories.knowledge.getApprovedKnowledge());
}

export async function retrieveApprovedClaims() {
  const repositories = getPersistenceAdapter();

  return ok(await repositories.claims.getApprovedClaims());
}

export async function retrieveApprovedCaseStudies() {
  const repositories = getPersistenceAdapter();

  return ok(await repositories.caseStudies.getApprovedCaseStudies());
}
