import { afterEach, describe, expect, it, vi } from "vitest";
import { enqueueDraftBatch } from "./worker";
import type { IntegrationStore, StoredIntegration } from "@/server/integrations/store";
import { initialState } from "@/server/integrations/contracts";
import {
  MemoryEvidenceStore,
  collectedContact,
  collectionNow,
} from "@/test/sales-agent-collection-fixtures";
import type { WorkforceRun } from "@/features/agent-workforce/gate-a-contracts";
import type { DraftStudioEngine } from "./engine";
afterEach(() => vi.unstubAllEnvs());
async function setup() {
  vi.stubEnv("INTEGRATION_OPERATOR_USER_ID", "operator");
  vi.stubEnv("VERCEL_ENV", "preview");
  const evidence = new MemoryEvidenceStore();
  await evidence.save(
    "operator",
    Array.from({ length: 7 }, (_, i) => ({
      version: 1 as const,
      contact: { ...collectedContact, hubspotRecordId: String(i + 1) },
      observations: [],
      provenanceAtCollection: [],
      blockers: [],
      providers: [],
      collectedAt: collectionNow.toISOString(),
    })),
  );
  const row: StoredIntegration = {
    version: 1,
    secret: null,
    state: { ...initialState("HUBSPOT"), watermark: "unchanged-CRM-checkpoint" },
  };
  const integrations: IntegrationStore = {
    get: async () => row,
    claim: async () => true,
    release: async () => {},
    change: async (_actor, _provider, callback) => (await callback(row)).value,
  };
  const prepareContact = vi.fn(
    async (_actor: string, id: string) => ({ id: `draft-${id}` }) as WorkforceRun,
  );
  const engine = { prepareContact } as unknown as DraftStudioEngine;
  return { evidence, row, integrations, engine, prepareContact };
}
describe("incremental automatic draft preparation batches", () => {
  it("checkpoints small batches and resumes without modifying CRM synchronization state", async () => {
    const ctx = await setup();
    const first = await enqueueDraftBatch("operator", ctx);
    expect(first).toHaveLength(5);
    expect(ctx.row.state.draftIntake?.cursor).toBe("5");
    const second = await enqueueDraftBatch("operator", ctx);
    expect(second?.map((r) => r.contactId)).toEqual(["6", "7"]);
    expect(ctx.row.state.draftIntake?.cursor).toBeNull();
    expect(ctx.row.state.watermark).toBe("unchanged-CRM-checkpoint");
  });
  it("keeps blocked prospects explicit and continues unrelated eligible records", async () => {
    const ctx = await setup();
    ctx.prepareContact.mockRejectedValueOnce(new Error("DRAFT_ELIGIBILITY_HOLD"));
    const records = await enqueueDraftBatch("operator", ctx);
    expect(records?.[0]).toEqual({ contactId: "1", blocked: true });
    expect(records?.[1].runId).toBe("draft-2");
  });
  it("refuses Production and non-operator work before reading persistent data", async () => {
    const ctx = await setup();
    await enqueueDraftBatch("other", ctx);
    vi.stubEnv("VERCEL_ENV", "production");
    await enqueueDraftBatch("operator", ctx);
    expect(ctx.prepareContact).not.toHaveBeenCalled();
  });
});
