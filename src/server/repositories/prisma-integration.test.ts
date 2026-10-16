// @vitest-environment node
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { loadApprovedProductKnowledge } from "@/server/agent-workforce/knowledge-agent";
import { PrismaClient } from "@prisma/client";
import type { MinimalPrismaClient } from "@/lib/prisma";
import { PrismaWorkforceStore } from "@/server/agent-workforce/store";
import { PrismaEvidenceStore } from "@/server/sales-agent/evidence-store";
import { PrismaIntegrationStore } from "@/server/integrations/store";
import { DailyStore, dailyConfig } from "@/server/agent-workforce/daily/state";
import { DailyEngine } from "@/server/agent-workforce/daily/engine";
import { reserveInState } from "@/server/agent-workforce/daily/budget";
import { newResearch } from "@/server/agent-workforce/prospect-research/engine";
import { collectedContact } from "@/test/sales-agent-collection-fixtures";
import { workforceIntake, testNow } from "@/test/workforce-fixtures";
const url = process.env.TEST_DATABASE_URL;
let db: PrismaClient;
let client: MinimalPrismaClient;
const actor = `audit-fixture-${Date.now()}`;
describe.skipIf(!url)("real Prisma/PostgreSQL stores — isolated fixture database only", () => {
  beforeAll(async () => {
    const target = new URL(url!);
    if (
      target.protocol !== "postgresql:" ||
      target.hostname !== "localhost" ||
      !target.pathname.startsWith("/signal_audit") ||
      !target.searchParams.get("host")?.startsWith("/workspace/work/audit-pg-socket")
    )
      throw new Error(
        "TEST_DATABASE_URL must target the isolated local audit Unix socket; remote/Production databases are refused",
      );
    db = new PrismaClient({ datasources: { db: { url } } });
    client = db as unknown as MinimalPrismaClient;
    await db.$executeRaw`INSERT INTO "User" (id,email,"updatedAt") VALUES (${actor},${`${actor}@example.invalid`},NOW())`;
  });
  afterAll(async () => {
    await db?.$disconnect();
  });
  it("persists evidence and generated runs without cross-user leakage and rejects stale versions", async () => {
    const evidence = new PrismaEvidenceStore(client),
      runs = new PrismaWorkforceStore(client);
    await evidence.save(actor, [
      {
        version: 1,
        contact: collectedContact,
        observations: [],
        provenanceAtCollection: [],
        blockers: [],
        providers: [],
        collectedAt: testNow.toISOString(),
      },
    ]);
    expect(await evidence.find(actor, "42")).toBeTruthy();
    expect(await evidence.find("another-user", "42")).toBeNull();
    const run = await runs.create(actor, "fixture-prisma-0001", workforceIntake, testNow);
    expect(await runs.get("another-user", run.id)).toBeNull();
    const version = run.version;
    run.version++;
    expect(await runs.change(actor, version, run)).toBe(true);
    expect(await runs.change(actor, version, run)).toBe(false);
  });
  it("loads only approved externally usable product wording through the real SQL source joins", async () => {
    const source = actor + "-source",
      restricted = actor + "-restricted",
      product = actor + "-product",
      hidden = actor + "-hidden";
    await db.$executeRaw`INSERT INTO "SourceDocument" (id,title,"sourceType","approvalStatus","externalUrl","updatedAt") VALUES (${source},'Fictional public source','WEBSITE','APPROVED','https://example.invalid/product',NOW())`;
    await db.$executeRaw`INSERT INTO "SourceDocument" (id,title,"sourceType","approvalStatus","usageRestrictions","updatedAt") VALUES (${restricted},'Fictional confidential source','WEBSITE','APPROVED','Confidential internal only',NOW())`;
    for (const id of [product, hidden])
      await db.$executeRaw`INSERT INTO "KnowledgeItem" (id,type,title,"approvalStatus","approvedWording","productScope",channels,"updatedAt") VALUES (${id},'PRODUCT_TRUTH','Fictional Signal capability','APPROVED','Signal monitors branded search conditions.','Signal',ARRAY['EMAIL']::"Channel"[],NOW())`;
    await db.$executeRaw`INSERT INTO "_KnowledgeItemSources" ("A","B") VALUES (${product},${source}),(${hidden},${restricted})`;
    const records = await loadApprovedProductKnowledge(client);
    expect(records.find((r) => r.id === product)?.sourceIds).toEqual([source]);
    expect(records.some((r) => r.id === hidden)).toBe(false);
  });
  it("serializes concurrent budget reservations in real transactions", async () => {
    const store = new DailyStore(new PrismaIntegrationStore(client)),
      now = new Date(),
      config = { ...dailyConfig(), dailyBudgetUsd: 1, maxConcurrentCalls: 5 };
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        store.change(actor, (s) => reserveInState(s, { actor }, config, now, "SERP", 0.7)),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(Object.values((await store.get(actor)).days)[0].estimatedUsd).toBeCloseTo(0.7);
  });
  it("prevents two simultaneous daily jobs across separate real store instances", async () => {
    const a = new DailyEngine(new DailyStore(new PrismaIntegrationStore(client))),
      b = new DailyEngine(new DailyStore(new PrismaIntegrationStore(client)));
    const [left, right] = await Promise.all([
      a.start(actor, "fixture-daily-first", "MANUAL"),
      b.start(actor, "fixture-daily-second", "MANUAL"),
    ]);
    expect(left.id).toBe(right.id);
  });
  it("enforces the operator-wide research/draft lease in PostgreSQL", async () => {
    const store = new PrismaWorkforceStore(client),
      a = await store.create(actor, "lease-fixture-0001", workforceIntake, new Date()),
      b = await store.create(actor, "lease-fixture-0002", workforceIntake, new Date());
    for (const run of [a, b]) {
      run.prospectResearch = newResearch("0".repeat(64), new Date());
      run.leaseUntil = new Date(Date.now() + 110000).toISOString();
      run.version++;
    }
    const results = await Promise.all([
      store.change(actor, a.version - 1, a),
      store.change(actor, b.version - 1, b),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});
