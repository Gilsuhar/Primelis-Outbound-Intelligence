import "server-only";
import type { IntegrationProvider } from "./contracts";
import { IntegrationSync } from "./sync";
/** Durable state survives function termination; a secured scheduler or manual resume drains more units. */
export async function drainSync(actor: string, provider: IntegrationProvider) {
  if (process.env.VERCEL_ENV === "production") return;
  const sync = new IntegrationSync(actor),
    deadline = Date.now() + 20000;
  for (let units = 0; units < 8 && Date.now() < deadline; units++) {
    if (!(await sync.step(provider))) break;
  }
  if (provider === "HUBSPOT") {
    // Independent failure must never change a successful CRM checkpoint.
    try {
      const { enqueueResearchBatch } =
        await import("@/server/agent-workforce/prospect-research/intake");
      await enqueueResearchBatch(actor);
    } catch {
      /* Research persistence/configuration is diagnosed separately. */
    }
  }
}
