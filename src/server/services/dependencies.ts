import { getPersistenceAdapter } from "@/server/repositories/adapter-factory";
import type { PersistenceRepositories } from "@/server/repositories/types";

export type ServiceDependencies = {
  repositories?: PersistenceRepositories;
};

export function resolvePersistenceRepositories(dependencies?: ServiceDependencies) {
  return dependencies?.repositories ?? getPersistenceAdapter();
}
