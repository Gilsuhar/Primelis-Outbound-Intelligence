import "server-only";
import { createHash } from "node:crypto";
import {
  runSchema,
  type WorkforceRun,
  type WorkforceIntake,
} from "@/features/agent-workforce/gate-a-contracts";
import type { MinimalPrismaClient } from "@/lib/prisma";
export const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export interface WorkforceStore {
  create(actor: string, key: string, input: WorkforceIntake, now: Date): Promise<WorkforceRun>;
  get(actor: string, id: string): Promise<WorkforceRun | null>;
  list(actor: string): Promise<WorkforceRun[]>;
  pendingResearch?(actor: string): Promise<WorkforceRun[]>;
  change(actor: string, expectedVersion: number, run: WorkforceRun): Promise<boolean>;
}
export function initialRun(
  actor: string,
  key: string,
  input: WorkforceIntake,
  now: Date,
): WorkforceRun {
  const id = "workforce-" + digest({ actor, key });
  return {
    id,
    version: 1,
    intake: input,
    inputHash: digest(input),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    status: "RUNNING",
    stage: "KNOWLEDGE",
    leaseUntil: null,
    events: [],
    knowledge: [],
    research: {
      accountDomain: input.companyDomain,
      prospectId: id,
      researchedAt: now.toISOString(),
      sources: [],
      facts: [],
      gaps: [],
      assumptions: [],
    },
    brandSearch: {
      status: "INCOMPLETE",
      findings: [],
      gaps: ["No authorized SERP capture source is connected"],
    },
    strategy: null,
    sequence: null,
    critic: null,
    revisionAttempts: 0,
    eligibility: {
      status: "HOLD",
      reasons: ["Eligibility has not been checked"],
      blockDrafting: false,
    },
    issues: [],
    usage: [],
    approved: false,
    canSend: false,
    canEnroll: false,
    contentHash: null,
  };
}
export class PrismaWorkforceStore implements WorkforceStore {
  constructor(
    private readonly client?: MinimalPrismaClient,
    private readonly researchLocked = false,
  ) {}
  private async db() {
    if (this.client) return this.client;
    if (!process.env.DATABASE_URL) throw new Error("WORKFORCE_DATABASE_UNAVAILABLE");
    return (await import("@/lib/prisma")).prisma;
  }
  async create(actor: string, key: string, input: WorkforceIntake, now: Date) {
    const run = initialRun(actor, key, input, now);
    const db = await this.db();
    await db.$executeRaw`
      INSERT INTO "GeneratedDraft" (id,"userId",workflow,"inputSnapshot","draftContent","retrievedKnowledgeIds","sourceIds","providerName","draftStatus","updatedAt")
      VALUES (${run.id},${actor},'AGENT_WORKFORCE',${JSON.stringify(input)}::jsonb,${JSON.stringify(run)},'{}','{}','openai','DRAFT',NOW())
      ON CONFLICT (id) DO NOTHING
    `;
    const saved = await this.get(actor, run.id);
    if (!saved || saved.inputHash !== run.inputHash) throw new Error("IDEMPOTENCY_CONFLICT");
    return saved;
  }
  async get(actor: string, id: string) {
    const rows = await (
      await this.db()
    ).$queryRaw<
      { draftContent: string }[]
    >`SELECT "draftContent" FROM "GeneratedDraft" WHERE id=${id} AND "userId"=${actor} AND workflow='AGENT_WORKFORCE' LIMIT 1`;
    return rows[0] ? runSchema.parse(JSON.parse(rows[0].draftContent)) : null;
  }
  async list(actor: string) {
    const rows = await (
      await this.db()
    ).$queryRaw<
      { draftContent: string }[]
    >`SELECT "draftContent" FROM "GeneratedDraft" WHERE "userId"=${actor} AND workflow='AGENT_WORKFORCE' ORDER BY "updatedAt" DESC LIMIT 25`;
    return rows.flatMap((row) => {
      try {
        const r = runSchema.safeParse(JSON.parse(row.draftContent));
        return r.success ? [r.data] : [];
      } catch {
        return [];
      }
    });
  }
  async pendingResearch(actor: string) {
    const rows = await (
      await this.db()
    ).$queryRaw<{ draftContent: string }[]>`
      SELECT "draftContent" FROM "GeneratedDraft" WHERE "userId"=${actor} AND workflow='AGENT_WORKFORCE'
      AND "draftContent"::jsonb->'prospectResearch'->>'status' IN ('RUNNING','PARTIAL')
      AND EXISTS (
        SELECT 1 FROM jsonb_each("draftContent"::jsonb->'prospectResearch'->'stages') AS stage
        WHERE stage.value->>'status' IN ('WAITING','RUNNING') OR
          (stage.value->>'status'='FAILED' AND (stage.value->>'attempts')::integer<3
           AND (stage.value->>'retryAt' IS NULL OR (stage.value->>'retryAt')::timestamptz<=clock_timestamp()))
      )
      ORDER BY "updatedAt" ASC LIMIT 100`;
    return rows.flatMap((row) => {
      try {
        const parsed = runSchema.safeParse(JSON.parse(row.draftContent));
        return parsed.success ? [parsed.data] : [];
      } catch {
        return [];
      }
    });
  }
  async change(actor: string, expectedVersion: number, run: WorkforceRun): Promise<boolean> {
    runSchema.parse(run);
    if (run.version !== expectedVersion + 1) throw new Error("INVALID_VERSION");
    if (run.prospectResearch && run.leaseUntil && !this.researchLocked) {
      const db = await this.db();
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`research:${actor}`}, 0))`;
        const live = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM "GeneratedDraft" WHERE "userId"=${actor} AND workflow='AGENT_WORKFORCE'
          AND id<>${run.id} AND "draftContent"::jsonb ? 'prospectResearch'
          AND ("draftContent"::jsonb->>'leaseUntil')::timestamptz > clock_timestamp() LIMIT 1`;
        if (live.length) return false;
        return new PrismaWorkforceStore(tx, true).change(actor, expectedVersion, run);
      });
    }
    const changed = await (
      await this.db()
    ).$executeRaw`
      UPDATE "GeneratedDraft" SET "draftContent"=${JSON.stringify(run)},"retrievedKnowledgeIds"=${run.knowledge.map((k) => k.id)}::text[],"sourceIds"=${run.research.sources.map((s) => s.id)}::text[],"updatedAt"=clock_timestamp()
      WHERE id=${run.id} AND "userId"=${actor} AND workflow='AGENT_WORKFORCE'
        AND ("draftContent"::jsonb->>'version')::integer=${expectedVersion}
    `;
    return changed === 1;
  }
}
