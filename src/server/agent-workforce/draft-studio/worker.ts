import "server-only";
import { snapshotSchema } from "@/server/services/sales-agent-collection-service";
import { PrismaEvidenceStore, type EvidenceStore } from "@/server/sales-agent/evidence-store";
import { PrismaIntegrationStore, type IntegrationStore } from "@/server/integrations/store";
import { DraftStudioEngine } from "./engine";
/** No new queue/broker: use the existing operator-scoped durable cursor and versioned run store. */
export async function enqueueDraftBatch(
  actor: string,
  deps: {
    integrations?: IntegrationStore;
    evidence?: EvidenceStore;
    engine?: DraftStudioEngine;
  } = {},
) {
  if (process.env.VERCEL_ENV === "production" || actor !== process.env.INTEGRATION_OPERATOR_USER_ID)
    return;
  const integrations = deps.integrations ?? new PrismaIntegrationStore();
  const cursor = (await integrations.get(actor, "HUBSPOT")).state.draftIntake?.cursor ?? null;
  const evidence = deps.evidence ?? new PrismaEvidenceStore();
  const ids = [
    ...new Set(
      (await evidence.list(actor)).flatMap((raw) => {
        const p = snapshotSchema.safeParse(raw);
        return p.success ? [p.data.contact.hubspotRecordId] : [];
      }),
    ),
  ]
    .sort()
    .filter((id) => !cursor || id > cursor);
  const selected = ids.slice(0, 5);
  const engine = deps.engine ?? new DraftStudioEngine();
  const records: { contactId: string; runId?: string; blocked?: boolean }[] = [];
  for (const id of selected) {
    try {
      const run = await engine.prepareContact(actor, id);
      records.push({ contactId: id, runId: run.id });
    } catch {
      records.push({ contactId: id, blocked: true });
    }
  }
  await integrations.change(actor, "HUBSPOT", async (row) => {
    if ((row.state.draftIntake?.cursor ?? null) === cursor)
      row.state.draftIntake = {
        cursor: ids.length > selected.length ? selected.at(-1)! : null,
        checkedAt: new Date().toISOString(),
      };
    return { row, value: undefined };
  });
  return records;
}
export async function drainDraftStudio(actor: string, runId?: string) {
  if (process.env.VERCEL_ENV === "production" || actor !== process.env.INTEGRATION_OPERATOR_USER_ID)
    return;
  const engine = new DraftStudioEngine();
  if (runId) return engine.advance(actor, runId);
  const runs = await (engine.store.pendingDrafts?.(actor) ?? engine.store.list(actor));
  const now = Date.now();
  const run = runs
    .filter(
      (r) =>
        r.draftStudio &&
        r.status === "RUNNING" &&
        (!r.leaseUntil || Date.parse(r.leaseUntil) <= now) &&
        (!r.draftStudio.nextRetryAt || Date.parse(r.draftStudio.nextRetryAt) <= now),
    )
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))[0];
  if (run) return engine.advance(actor, run.id);
}
