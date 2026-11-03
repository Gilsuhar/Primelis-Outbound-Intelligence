// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MinimalPrismaClient } from "@/lib/prisma";
import { LocalCompanyBudgetStore, PrismaCompanyStore } from "./store";
import { fictionalCompanyEnv } from "./test-fixtures";
import { reserveProvider, withBudgetContext } from "../daily/budget";
import { localCompanyAiConfig } from "./config";
const actor = fictionalCompanyEnv.INTEGRATION_OPERATOR_USER_ID;
beforeEach(() => {
  for (const [key, value] of Object.entries(fictionalCompanyEnv)) vi.stubEnv(key, value);
});
afterEach(() => vi.unstubAllEnvs());
function databaseFixture() {
  let saved: string | undefined;
  const sql: { query: string; values: unknown[] }[] = [];
  const db = {
    $transaction: async <T>(work: (client: MinimalPrismaClient) => Promise<T>) =>
      work(db as unknown as MinimalPrismaClient),
    $queryRaw: vi.fn(async (parts: TemplateStringsArray, ...values: unknown[]) => {
      const query = parts.join("?");
      sql.push({ query, values });
      return query.includes('SELECT "draftContent"') && saved ? [{ draftContent: saved }] : [];
    }),
    $executeRaw: vi.fn(async (parts: TemplateStringsArray, ...values: unknown[]) => {
      const query = parts.join("?");
      sql.push({ query, values });
      if (query.includes("LOCAL_COMPANY_AI_BUDGET")) saved = values[2] as string;
      return 1;
    }),
  };
  return {
    client: db as unknown as MinimalPrismaClient,
    sql,
    db,
    corrupt: () => {
      saved = '{"version":1}';
    },
  };
}
it("reuses persistent reservations across store instances under a PostgreSQL advisory lock", async () => {
  const fixture = databaseFixture(),
    config = localCompanyAiConfig(actor).budget;
  const first = new LocalCompanyBudgetStore(fixture.client);
  const reservation = await withBudgetContext({ actor, config, store: first }, () =>
    reserveProvider("OPENAI", 1),
  );
  const second = new LocalCompanyBudgetStore(fixture.client);
  expect(Object.keys((await second.get(actor)).pending)).toHaveLength(1);
  await withBudgetContext({ actor, config, store: second }, async () => {
    await expect(reserveProvider("OPENAI", 1)).rejects.toThrow("PROVIDER_CONCURRENCY");
  });
  await reservation.finish();
  expect(Object.keys((await second.get(actor)).pending)).toHaveLength(0);
  expect(Object.values((await second.get(actor)).days)[0].estimatedUsd).toBe(1);
  expect(fixture.sql.some((item) => item.query.includes("pg_advisory_xact_lock"))).toBe(true);
  expect(fixture.sql.every((item) => !item.query.includes("Integration"))).toBe(true);
});
it("fails closed on a corrupt ledger instead of resetting spending", async () => {
  const fixture = databaseFixture();
  fixture.corrupt();
  await expect(new LocalCompanyBudgetStore(fixture.client).get(actor)).rejects.toThrow();
  expect(fixture.db.$executeRaw).not.toHaveBeenCalled();
});
it("scopes company queries to the actor and a separate workflow, with no prospect records", async () => {
  const fixture = databaseFixture(),
    store = new PrismaCompanyStore(fixture.client);
  expect(await store.list(actor)).toEqual([]);
  expect(await store.get(actor, "fictional-run")).toBeNull();
  for (const statement of fixture.sql) {
    expect(statement.query).toContain("workflow='COMPANY_RESEARCH_V1'");
    expect(statement.query).toContain('"userId"=?');
    expect(statement.values).toContain(actor);
    expect(statement.query).not.toContain("AGENT_WORKFORCE");
  }
  await expect(store.list("other")).rejects.toThrow("LOCAL_COMPANY_ONLY");
});
it("round-trips optional audits in existing JSON without schema changes, including legacy reads", async () => {
  const fixture = databaseFixture(),
    store = new PrismaCompanyStore(fixture.client);
  const at = "2026-10-18T17:58:53.990Z";
  const run = {
    version: 1 as const,
    id: "offline-audit-store",
    input: { companyName: "Fixture Company", companyDomain: "fixture.example" },
    createdAt: at,
    updatedAt: at,
    status: "INCOMPLETE" as const,
    research: {
      accountDomain: "fixture.example",
      prospectId: "offline-audit-store",
      researchedAt: at,
      sources: [],
      facts: [],
      gaps: [],
      assumptions: [],
    },
    issues: [],
    usage: [],
    approved: false as const,
    canSend: false as const,
    canEnroll: false as const,
    groundingAudit: {
      version: 1 as const,
      status: "UNAVAILABLE" as const,
      identityMatches: null,
      reasonCodes: ["REVIEW_UNAVAILABLE" as const],
      candidates: [],
    },
  };
  await store.finish(actor, run);
  expect(
    fixture.sql.some((s) =>
      s.values.some((v) => typeof v === "string" && v.includes('"groundingAudit"')),
    ),
  ).toBe(true);
  fixture.db.$queryRaw.mockResolvedValue([{ draftContent: JSON.stringify(run) }]);
  expect((await store.get(actor, run.id))?.groundingAudit).toEqual(run.groundingAudit);
  const legacy = { ...run };
  delete (legacy as Partial<typeof run>).groundingAudit;
  fixture.db.$queryRaw.mockResolvedValue([{ draftContent: JSON.stringify(legacy) }]);
  expect((await store.get(actor, run.id))?.groundingAudit).toBeUndefined();
});
