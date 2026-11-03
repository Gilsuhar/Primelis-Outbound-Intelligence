import "server-only";
import type { MinimalPrismaClient } from "@/lib/prisma";
import type { QueueState } from "./contracts";
import { requirePilotConfig } from "./auth";
import { PostgresQueuePersistence } from "./postgres-store";

export interface QueueStore {
  read(actor: string): Promise<QueueState>;
  change<T>(actor: string, mutate: (state: QueueState) => T): Promise<T>;
}
/** One bounded actor queue, separate from company history, drafts and CRM ledgers.
 * Callbacks are synchronous; no provider I/O is permitted inside the transaction. */
export class PrismaQueueStore extends PostgresQueuePersistence {
  constructor(client?: MinimalPrismaClient) {
    super(async (actor) => {
      const config = requirePilotConfig();
      if (actor !== config.actor) throw new Error("PILOT_FORBIDDEN");
      return client ?? (await import("@/lib/prisma")).prisma;
    });
  }
}
