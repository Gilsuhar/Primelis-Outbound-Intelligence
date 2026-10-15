import { describe, expect, it, vi } from "vitest";
import { PrismaWorkforceStore, initialRun } from "./store";
import { testNow, workforceIntake } from "@/test/workforce-fixtures";
import type { MinimalPrismaClient } from "@/lib/prisma";
function fixtureDb() {
  const rows = new Map<string, { actor: string; content: string }>();
  const execute = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join("?");
    if (sql.includes('INSERT INTO "GeneratedDraft"')) {
      const [id, actor, , content] = values;
      if (!rows.has(String(id)))
        rows.set(String(id), { actor: String(actor), content: String(content) });
      return 1;
    }
    if (sql.includes('UPDATE "GeneratedDraft"')) {
      const [content, , , id, actor, expected] = values;
      const current = rows.get(String(id));
      if (current && current.actor === actor && JSON.parse(current.content).version === expected) {
        rows.set(String(id), { actor: String(actor), content: String(content) });
        return 1;
      }
      return 0;
    }
    throw new Error("Unexpected mutation");
  });
  const query = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join("?");
    if (sql.includes("WHERE id=")) {
      const row = rows.get(String(values[0]));
      return row && row.actor === values[1] ? [{ draftContent: row.content }] : [];
    }
    return [...rows.values()]
      .filter((r) => r.actor === values[0])
      .map((r) => ({ draftContent: r.content }));
  });
  return {
    client: { $executeRaw: execute, $queryRaw: query } as unknown as MinimalPrismaClient,
    execute,
    query,
    rows,
  };
}
describe("existing database-backed run storage", () => {
  it("uses one actor-scoped idempotent GeneratedDraft row and preserves JSON outputs", async () => {
    const db = fixtureDb();
    const store = new PrismaWorkforceStore(db.client);
    const run = await store.create("actor", "request-00000001", workforceIntake, testNow);
    expect((await store.create("actor", "request-00000001", workforceIntake, testNow)).id).toBe(
      run.id,
    );
    expect(db.rows.size).toBe(1);
    expect(await store.get("other", run.id)).toBeNull();
    expect(await store.list("other")).toEqual([]);
    expect((await store.list("actor"))[0]).toEqual(run);
  });
  it("uses compare-and-set versions for atomic stage claims and rejects stale updates", async () => {
    const db = fixtureDb();
    const store = new PrismaWorkforceStore(db.client);
    const run = await store.create("actor", "request-00000001", workforceIntake, testNow);
    const claimed = { ...run, version: 2, leaseUntil: "2026-10-15T18:01:00Z" };
    expect(await store.change("actor", 1, claimed)).toBe(true);
    expect(await store.change("actor", 1, claimed)).toBe(false);
    expect(await store.change("other", 1, claimed)).toBe(false);
    expect((await store.get("actor", run.id))?.leaseUntil).toBe(claimed.leaseUntil);
    expect(
      db.execute.mock.calls.every(
        ([sql]) => !/Outreach|HubSpot|SuppressionRecord|KnowledgeItem/.test(sql.join("")),
      ),
    ).toBe(true);
  });
  it("rejects idempotency-key reuse with another prospect and never inserts fixtures implicitly", async () => {
    const db = fixtureDb();
    const store = new PrismaWorkforceStore(db.client);
    await store.create("actor", "request-00000001", workforceIntake, testNow);
    await expect(
      store.create(
        "actor",
        "request-00000001",
        { ...workforceIntake, prospectName: "Other Person" },
        testNow,
      ),
    ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    expect(initialRun("actor", "request-00000001", workforceIntake, testNow)).toMatchObject({
      approved: false,
      canSend: false,
      canEnroll: false,
      sequence: null,
    });
  });
});
