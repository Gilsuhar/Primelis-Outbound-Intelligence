import "server-only";
import type { MinimalPrismaClient } from "@/lib/prisma";
import { digest } from "../store";
import { initialQueue, parseQueue, type QueueState } from "./contracts";
import type { QueueStore } from "./store";

/** Internal persistence primitive. Each entry point MUST supply its own authorization policy.
 * Application callers continue to use PrismaQueueStore, whose Preview guard is unchanged. */
export class PostgresQueuePersistence implements QueueStore {
  constructor(private readonly authorizedClient: (actor: string) => Promise<MinimalPrismaClient>) {}
  private id(actor: string) {
    return "company-queue-" + digest(actor);
  }
  private async load(db: MinimalPrismaClient, actor: string) {
    const rows = await db.$queryRaw<{ draftContent: string }[]>`
      SELECT "draftContent" FROM "GeneratedDraft" WHERE id=${this.id(actor)}
      AND "userId"=${actor} AND workflow='COMPANY_QUEUE_V1' LIMIT 1`;
    return rows[0] ? parseQueue(JSON.parse(rows[0].draftContent)) : initialQueue();
  }
  async read(actor: string) {
    return this.load(await this.authorizedClient(actor), actor);
  }
  async change<T>(actor: string, mutate: (state: QueueState) => T): Promise<T> {
    const db = await this.authorizedClient(actor);
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${this.id(actor)},0))`;
      const state = await this.load(tx, actor);
      const result = mutate(state);
      if (result instanceof Promise) throw new Error("ASYNC_QUEUE_TRANSACTION");
      const content = JSON.stringify(parseQueue(state));
      const saved = await tx.$executeRaw`
        INSERT INTO "GeneratedDraft" (id,"userId",workflow,"draftContent","retrievedKnowledgeIds","sourceIds","draftStatus","updatedAt")
        VALUES (${this.id(actor)},${actor},'COMPANY_QUEUE_V1',${content},'{}','{}','DRAFT',NOW())
        ON CONFLICT (id) DO UPDATE SET "draftContent"=EXCLUDED."draftContent","updatedAt"=NOW()
        WHERE "GeneratedDraft"."userId"=${actor} AND "GeneratedDraft".workflow='COMPANY_QUEUE_V1'`;
      if (saved !== 1) throw new Error("QUEUE_WRITE_CONFLICT");
      return structuredClone(result);
    });
  }
}
