/** Fictional read-only provider test persistence. No live credentials or CRM records. */
import { initialState, type IntegrationProvider } from "@/server/integrations/contracts";
import type { IntegrationStore, StoredIntegration } from "@/server/integrations/store";
export class AuditIntegrationStore implements IntegrationStore {
  rows = new Map<string, StoredIntegration>();
  leases = new Set<string>();
  async get(actor: string, provider: IntegrationProvider) {
    return structuredClone(
      this.rows.get(`${actor}:${provider}`) ?? {
        state: initialState(provider),
        version: 0,
        secret: null,
      },
    );
  }
  async change<T>(
    actor: string,
    provider: IntegrationProvider,
    update: Parameters<IntegrationStore["change"]>[2],
  ): Promise<T> {
    const { row, value } = await update(await this.get(actor, provider));
    this.rows.set(`${actor}:${provider}`, structuredClone({ ...row, version: row.version + 1 }));
    return value as T;
  }
  async claim(actor: string, provider: IntegrationProvider) {
    const key = `${actor}:${provider}`;
    if (this.leases.has(key)) return false;
    this.leases.add(key);
    return true;
  }
  async release(actor: string, provider: IntegrationProvider) {
    this.leases.delete(`${actor}:${provider}`);
  }
}
