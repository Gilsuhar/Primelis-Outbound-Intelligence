import {
  resolvePersistenceRepositories,
  type ServiceDependencies,
} from "@/server/services/dependencies";
import { ok } from "./result";

export async function retrieveApprovedKnowledge(dependencies?: ServiceDependencies) {
  const repositories = resolvePersistenceRepositories(dependencies);

  return ok(await repositories.knowledge.getApprovedKnowledge());
}

export async function retrieveApprovedClaims(dependencies?: ServiceDependencies) {
  const repositories = resolvePersistenceRepositories(dependencies);

  return ok(await repositories.claims.getApprovedClaims());
}

export async function retrieveApprovedCaseStudies(dependencies?: ServiceDependencies) {
  const repositories = resolvePersistenceRepositories(dependencies);

  return ok(await repositories.caseStudies.getApprovedCaseStudies());
}
