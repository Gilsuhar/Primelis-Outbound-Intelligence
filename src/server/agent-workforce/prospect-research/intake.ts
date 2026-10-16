import "server-only";
import { PrismaIntegrationStore, type IntegrationStore } from "@/server/integrations/store";
import { ProspectResearchEngine } from "./engine";
/** Bounded persistent cursor, separate from CRM synchronization success/watermark. */
export async function enqueueResearchBatch(
  actor: string,
  deps: { integrations?: IntegrationStore; engine?: ProspectResearchEngine } = {},
) {
  const store = deps.integrations ?? new PrismaIntegrationStore();
  const engine = deps.engine ?? new ProspectResearchEngine();
  const cursor = (await store.get(actor, "HUBSPOT")).state.researchIntake?.cursor ?? null;
  try {
    const batch = await engine.enqueue(actor, { after: cursor ?? undefined, limit: 25 });
    await store.change(actor, "HUBSPOT", async (row) => {
      // Concurrent intake can enqueue duplicates safely but cannot overwrite a newer cursor.
      if ((row.state.researchIntake?.cursor ?? null) === cursor)
        row.state.researchIntake = {
          cursor: batch.next ?? null,
          checkedAt: new Date().toISOString(),
          error: null,
        };
      return { row, value: undefined };
    });
    return batch;
  } catch {
    await store.change(actor, "HUBSPOT", async (row) => {
      row.state.researchIntake = {
        cursor: row.state.researchIntake?.cursor ?? cursor,
        checkedAt: new Date().toISOString(),
        error: "Research intake unavailable; previous cursor retained",
      };
      return { row, value: undefined };
    });
    throw new Error("RESEARCH_INTAKE_UNAVAILABLE");
  }
}
