// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MinimalPrismaClient } from "@/lib/prisma";
import { PrismaQueueStore } from "./store";
import { pilotTestEnv } from "./test-support";
beforeEach(() => {
  for (const [k, v] of Object.entries(pilotTestEnv)) vi.stubEnv(k, v);
});
afterEach(() => vi.unstubAllEnvs());
function database() {
  let content: string | undefined;
  const statements: { sql: string; values: unknown[] }[] = [];
  const tx = {
    $queryRaw: vi.fn(async (parts: TemplateStringsArray, ...values: unknown[]) => {
      const sql = parts.join("?");
      statements.push({ sql, values });
      return sql.includes("advisory") || !content ? [] : [{ draftContent: content }];
    }),
    $executeRaw: vi.fn(async (parts: TemplateStringsArray, ...values: unknown[]) => {
      statements.push({ sql: parts.join("?"), values });
      content = values[2] as string;
      return 1;
    }),
  };
  return {
    client: {
      ...tx,
      $transaction: async (callback: (client: unknown) => unknown) => callback(tx),
    } as unknown as MinimalPrismaClient,
    tx,
    statements,
  };
}
it("uses a scoped transaction/advisory lock and a distinct workflow, then reads persisted state through a new adapter", async () => {
  const db = database(),
    actor = pilotTestEnv.COMPANY_PILOT_OPERATOR_ID!;
  const store = new PrismaQueueStore(db.client);
  await store.change(actor, (state) => {
    state.lastWorkerAt = "2026-10-19T10:00:00Z";
  });
  expect((await new PrismaQueueStore(db.client).read(actor)).lastWorkerAt).toBe(
    "2026-10-19T10:00:00Z",
  );
  expect(db.statements[0].sql).toContain("pg_advisory_xact_lock");
  const write = db.statements.find((s) => s.sql.includes("INSERT"))!;
  expect(write.sql).toContain("COMPANY_QUEUE_V1");
  expect(write.sql).toContain('"GeneratedDraft"."userId"=?');
  expect(JSON.stringify(db.statements)).not.toMatch(/HUBSPOT|OUTREACH|IntegrationState/);
  await expect(store.read("wrong-actor")).rejects.toThrow("PILOT_FORBIDDEN");
});
it("refuses owner/workflow conflicts and invalid state rather than overwriting", async () => {
  const db = database(),
    actor = pilotTestEnv.COMPANY_PILOT_OPERATOR_ID!;
  db.tx.$executeRaw.mockResolvedValueOnce(0);
  const store = new PrismaQueueStore(db.client);
  await expect(store.change(actor, () => undefined)).rejects.toThrow("QUEUE_WRITE_CONFLICT");
  db.tx.$executeRaw.mockClear();
  await expect(
    store.change(actor, (state) => {
      state.version = 2 as 1;
    }),
  ).rejects.toThrow();
  expect(db.tx.$executeRaw).not.toHaveBeenCalled();
});
it("does not let a CI environment authorize the normal application's PostgreSQL store", async () => {
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("GITHUB_ACTIONS", "true");
  vi.stubEnv("CI_ACCEPTANCE_ENABLED", "true");
  const db = database();
  await expect(
    new PrismaQueueStore(db.client).read(pilotTestEnv.COMPANY_PILOT_OPERATOR_ID!),
  ).rejects.toThrow("PILOT_CONFIGURATION_REQUIRED");
  expect(db.statements).toEqual([]);
});
