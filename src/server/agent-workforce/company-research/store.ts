import "server-only";
import { z } from "zod";
import type { MinimalPrismaClient } from "@/lib/prisma";
import {
  companyRunSchema,
  type CompanyRun,
} from "@/features/agent-workforce/company-research/contracts";
import { initialDailyState, type DailyState } from "@/features/agent-workforce/daily/contracts";
import { DailyStore } from "../daily/state";
import { digest } from "../store";
import { requireLocalCompanyAccess } from "./config";

export interface CompanyStore {
  get(actor: string, id: string): Promise<CompanyRun | null>;
  list(actor: string): Promise<CompanyRun[]>;
  create(actor: string, run: CompanyRun): Promise<boolean>;
  finish(actor: string, run: CompanyRun): Promise<void>;
}
async function database(actor: string, client?: MinimalPrismaClient) {
  requireLocalCompanyAccess(actor);
  return client ?? (await import("@/lib/prisma")).prisma;
}
/** Separate workflow: these records cannot be found by prospect/drafting workers. */
export class PrismaCompanyStore implements CompanyStore {
  constructor(private readonly client?: MinimalPrismaClient) {}
  async get(actor: string, id: string) {
    const db = await database(actor, this.client);
    const rows = await db.$queryRaw<{ draftContent: string }[]>`
      SELECT "draftContent" FROM "GeneratedDraft" WHERE id=${id} AND "userId"=${actor}
      AND workflow='COMPANY_RESEARCH_V1' LIMIT 1`;
    return rows[0] ? companyRunSchema.parse(JSON.parse(rows[0].draftContent)) : null;
  }
  async list(actor: string) {
    const db = await database(actor, this.client);
    const rows = await db.$queryRaw<{ draftContent: string }[]>`
      SELECT "draftContent" FROM "GeneratedDraft" WHERE "userId"=${actor}
      AND workflow='COMPANY_RESEARCH_V1' ORDER BY "createdAt" DESC LIMIT 25`;
    return rows.map((row) => companyRunSchema.parse(JSON.parse(row.draftContent)));
  }
  async create(actor: string, run: CompanyRun) {
    companyRunSchema.parse(run);
    const db = await database(actor, this.client);
    return (
      (await db.$executeRaw`
      INSERT INTO "GeneratedDraft" (id,"userId",workflow,"inputSnapshot","draftContent","retrievedKnowledgeIds","sourceIds","providerName","draftStatus","updatedAt")
      VALUES (${run.id},${actor},'COMPANY_RESEARCH_V1',${JSON.stringify(run.input)}::jsonb,${JSON.stringify(run)},'{}','{}','openai','DRAFT',NOW())
      ON CONFLICT (id) DO NOTHING`) === 1
    );
  }
  async finish(actor: string, run: CompanyRun) {
    companyRunSchema.parse(run);
    if (run.status === "RUNNING") throw new Error("INVALID_COMPANY_STATUS");
    const db = await database(actor, this.client);
    const changed = await db.$executeRaw`
      UPDATE "GeneratedDraft" SET "draftContent"=${JSON.stringify(run)},
      "sourceIds"=${run.research.sources.map((s) => s.id)}::text[],"updatedAt"=NOW()
      WHERE id=${run.id} AND "userId"=${actor} AND workflow='COMPANY_RESEARCH_V1'
      AND "draftContent"::jsonb->>'status'='RUNNING'`;
    if (changed !== 1) throw new Error("VERSION_CONFLICT");
  }
}

const count = z.number().finite().nonnegative();
const ledgerSchema = z
  .object({
    version: z.literal(1),
    runs: z.array(z.never()),
    lastWorkerAt: z.null(),
    days: z.record(
      z.object({
        estimatedUsd: count,
        uncertainRequests: count,
        requests: z.object({
          OPENAI: count,
          VERIFICATION: count,
          SERP: count,
          RESEARCH: count.optional(),
        }),
        models: z.record(z.object({ requests: count, inputTokens: count, outputTokens: count })),
        researchAttempts: z.record(count),
      }),
    ),
    months: z.record(count),
    pending: z.record(
      z.object({
        day: z.string(),
        month: z.string(),
        reservedUsd: count,
        until: z.string().datetime(),
        provider: z.enum(["OPENAI", "VERIFICATION", "SERP", "RESEARCH"]),
        model: z.string().optional(),
        runId: z.string().optional(),
      }),
    ),
  })
  .strict();

/** Reuse reservation accounting, with a local ledger rather than an integration row. */
export class LocalCompanyBudgetStore extends DailyStore {
  constructor(private readonly client?: MinimalPrismaClient) {
    super();
  }
  private id(actor: string) {
    return "company-budget-" + digest(actor);
  }
  override async get(actor: string): Promise<DailyState> {
    const db = await database(actor, this.client);
    const rows = await db.$queryRaw<{ draftContent: string }[]>`
      SELECT "draftContent" FROM "GeneratedDraft" WHERE id=${this.id(actor)} AND "userId"=${actor}
      AND workflow='LOCAL_COMPANY_AI_BUDGET' LIMIT 1`;
    return rows[0] ? ledgerSchema.parse(JSON.parse(rows[0].draftContent)) : initialDailyState();
  }
  override async change<T>(actor: string, mutate: (state: DailyState) => T): Promise<T> {
    const db = await database(actor, this.client);
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${this.id(actor)},0))`;
      const state = await new LocalCompanyBudgetStore(tx).get(actor);
      const result = mutate(state);
      ledgerSchema.parse(state);
      const saved = await tx.$executeRaw`
        INSERT INTO "GeneratedDraft" (id,"userId",workflow,"draftContent","retrievedKnowledgeIds","sourceIds","draftStatus","updatedAt")
        VALUES (${this.id(actor)},${actor},'LOCAL_COMPANY_AI_BUDGET',${JSON.stringify(state)},'{}','{}','DRAFT',NOW())
        ON CONFLICT (id) DO UPDATE SET "draftContent"=EXCLUDED."draftContent","updatedAt"=NOW()
        WHERE "GeneratedDraft"."userId"=${actor} AND "GeneratedDraft".workflow='LOCAL_COMPANY_AI_BUDGET'`;
      if (saved !== 1) throw new Error("COMPANY_BUDGET_UNAVAILABLE");
      return result;
    });
  }
}
