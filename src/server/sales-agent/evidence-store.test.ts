import { describe, expect, it, vi } from "vitest";
import { PrismaEvidenceStore, type EvidenceSnapshot } from "./evidence-store";
import type { MinimalPrismaClient } from "@/lib/prisma";
import {
  collectedContact,
  collectionNow,
  verifiedObservations,
} from "@/test/sales-agent-collection-fixtures";
import { normalizeCollectedEvidence } from "@/features/sales-agent/evidence";

function fixtureDatabase() {
  const prospects = new Map<string, string>();
  const sources: { prospectId: string; label: string; content: string }[] = [];
  const query = vi.fn(async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const sql = strings.join("?");
    if (sql.includes("pg_advisory_xact_lock")) return [{ locked: 1 }];
    if (sql.includes("SELECT p.id")) {
      const match = sources.find(
        (source) => source.label === params[1] && prospects.get(source.prospectId) === params[0],
      );
      return match ? [{ id: match.prospectId }] : [];
    }
    if (sql.includes("SELECT DISTINCT")) {
      const latest = new Map<string, string>();
      sources
        .filter((source) => prospects.get(source.prospectId) === params[0])
        .forEach((source) => latest.set(source.label, source.content));
      return [...latest.values()].map((rawContent) => ({ rawContent }));
    }
    return [];
  });
  const execute = vi.fn(async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const sql = strings.join("?");
    if (sql.includes('INSERT INTO "Prospect"')) prospects.set(String(params[0]), String(params[1]));
    if (sql.includes('INSERT INTO "ProspectSource"'))
      sources.push({
        prospectId: String(params[1]),
        content: String(params[2]),
        label: String(params[3]),
      });
    return 1;
  });
  const client = {
    $queryRaw: query,
    $executeRaw: execute,
    $transaction: vi.fn(async (work: (tx: unknown) => Promise<void>) => work(client)),
  };
  return {
    client: client as unknown as MinimalPrismaClient,
    query,
    execute,
    prospects,
    sources,
    transaction: client.$transaction,
  };
}
const snapshot = (): EvidenceSnapshot => ({
  version: 1,
  contact: collectedContact,
  observations: verifiedObservations,
  provenanceAtCollection: normalizeCollectedEvidence(
    collectedContact,
    verifiedObservations,
    collectionNow,
  ).provenance,
  blockers: [],
  providers: [],
  collectedAt: collectionNow.toISOString(),
});

describe("Prisma evidence storage boundary", () => {
  it("keeps repeated intake on one user-scoped prospect and appends traceable snapshots", async () => {
    const db = fixtureDatabase();
    const store = new PrismaEvidenceStore(db.client);
    await store.save("actor-a", [snapshot()]);
    await store.save("actor-a", [snapshot()]);
    expect(db.prospects.size).toBe(1);
    expect(db.sources).toHaveLength(2);
    expect(await store.list("actor-a")).toHaveLength(1);
    const saved = (await store.list("actor-a"))[0];
    expect(saved).toMatchObject({
      provenanceAtCollection: expect.arrayContaining([
        expect.objectContaining({
          freshness: "FRESH",
          accepted: true,
          expiresAt: "2026-11-14T08:00:00.000Z",
        }),
      ]),
    });
    expect(db.transaction).toHaveBeenCalledTimes(2);
    expect(
      db.query.mock.calls.some(([sql]) => sql.join("").includes("pg_advisory_xact_lock")),
    ).toBe(true);
    expect(
      db.execute.mock.calls.every(([sql]) =>
        /INSERT INTO "Prospect(?:Source)?"/.test(sql.join("")),
      ),
    ).toBe(true);
  });
  it("isolates the same HubSpot identity between application users", async () => {
    const db = fixtureDatabase();
    const store = new PrismaEvidenceStore(db.client);
    await store.save("actor-a", [snapshot()]);
    expect(await store.list("actor-b")).toEqual([]);
    await store.save("actor-b", [snapshot()]);
    expect(db.prospects.size).toBe(2);
    expect(await store.list("actor-b")).toHaveLength(1);
  });
  it("passes actor IDs as SQL parameters rather than query text", async () => {
    const db = fixtureDatabase();
    const store = new PrismaEvidenceStore(db.client);
    const actor = "actor' OR true --";
    await store.list(actor);
    const [strings, ...params] = db.query.mock.calls[0];
    expect(strings.join("")).not.toContain(actor);
    expect(params).toContain(actor);
  });
  it("edits latest actor-scoped evidence under the collection lock, without changing suppression or another user", async () => {
    const db = fixtureDatabase();
    const store = new PrismaEvidenceStore(db.client);
    await store.save("actor-a", [snapshot()]);
    const blocked = snapshot();
    blocked.observations = [
      ...blocked.observations,
      { ...blocked.observations[0], field: "unsubscribed", value: true, provider: "OUTREACH" },
    ];
    await store.save("actor-a", [blocked]);
    expect(await store.edit("actor-b", "42", () => snapshot())).toBe(false);
    const { draftResearchSchema } = await import("@/features/sales-agent/draft-engine");
    const entry = draftResearchSchema.parse({
      id: "42:COMPANY_FACT",
      contactId: "42",
      companyDomain: "example.com",
      kind: "COMPANY_FACT",
      text: "Fictional source-backed research to preserve across intake.",
      sourceUrl: "https://example.com/test",
      observedAt: collectionNow.toISOString(),
      verifiedAt: collectionNow.toISOString(),
      manuallyVerified: true,
    });
    expect(
      await store.edit("actor-a", "42", (raw) => ({
        ...(raw as EvidenceSnapshot),
        research: [entry],
      })),
    ).toBe(true);
    const [edited] = (await store.list("actor-a")) as EvidenceSnapshot[];
    expect(edited.observations).toEqual(blocked.observations);
    expect(edited.research).toEqual([entry]);
    expect(await store.list("actor-b")).toEqual([]);
    expect(
      db.query.mock.calls.filter(([sql]) => sql.join("").includes("pg_advisory_xact_lock")),
    ).toHaveLength(4);
    expect(
      db.execute.mock.calls
        .filter(([sql]) => sql.join("").includes('INSERT INTO "ProspectSource"'))
        .every(([sql]) => sql.join("").includes("clock_timestamp()")),
    ).toBe(true);
    await store.save("actor-a", [snapshot()]);
    expect(((await store.list("actor-a")) as EvidenceSnapshot[])[0].research).toEqual([entry]);
    const changedCompany = snapshot();
    changedCompany.contact = { ...changedCompany.contact, companyDomain: "new.example" };
    await store.save("actor-a", [changedCompany]);
    expect(((await store.list("actor-a")) as EvidenceSnapshot[])[0].research).toEqual([]);
  });
});
