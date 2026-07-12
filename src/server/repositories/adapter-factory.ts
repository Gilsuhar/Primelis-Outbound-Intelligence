import { FixturePersistenceAdapter } from "@/server/repositories/fixture-adapter";
import { PrismaPersistenceAdapter } from "@/server/repositories/prisma-adapter";
import type { PersistenceRepositories } from "@/server/repositories/types";

export function getPersistenceAdapter(): PersistenceRepositories {
  const hasDatabase = Boolean(process.env.DATABASE_URL);

  if (hasDatabase) {
    if (process.env.NODE_ENV === "development") {
      console.info("Primelis persistence adapter: prisma");
    }
    return new PrismaPersistenceAdapter();
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is required in production. Fixture fallback is disabled.");
  }

  if (process.env.NODE_ENV === "development") {
    console.info("Primelis persistence adapter: fixture fallback");
  }

  return new FixturePersistenceAdapter();
}
