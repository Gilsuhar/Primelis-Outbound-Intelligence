import type { QueueStore } from "./store";
import { initialQueue, parseQueue, type QueueState } from "./contracts";
/** Test-only transactional store. Not imported by any application route. */
export class MemoryQueueStore implements QueueStore {
  private rows = new Map<string, QueueState>();
  private tail: Promise<unknown> = Promise.resolve();
  async read(actor: string) {
    await this.tail;
    return structuredClone(this.rows.get(actor) ?? initialQueue());
  }
  async change<T>(actor: string, mutate: (state: QueueState) => T): Promise<T> {
    const next = this.tail.then(() => {
      const state = structuredClone(this.rows.get(actor) ?? initialQueue());
      const result = mutate(state);
      this.rows.set(actor, parseQueue(state));
      return structuredClone(result);
    });
    this.tail = next.catch(() => {});
    return next;
  }
}
export const pilotTestEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  COMPANY_PILOT_ENABLED: "true",
  COMPANY_PILOT_MODE: "SIMULATED",
  VERCEL_ENV: "preview",
  NEXT_PUBLIC_VERCEL_ENV: "preview",
  VERCEL_PROJECT_ID: "prj_fixture",
  COMPANY_PILOT_VERCEL_PROJECT_ID: "prj_fixture",
  COMPANY_PILOT_ORIGIN: "https://fixture-pilot.vercel.app",
  VERCEL_URL: "fixture-pilot.vercel.app",
  COMPANY_PILOT_OPERATOR_ID: "fixture-operator",
  COMPANY_PILOT_SUPABASE_REF: "abcdefghijklmnopqrst",
  NEXT_PUBLIC_PREVIEW_SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
  NEXT_PUBLIC_PREVIEW_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  NEXT_PUBLIC_PREVIEW_SUPABASE_PUBLISHABLE_KEY: "fictional-publishable-fixture",
  PREVIEW_DATABASE_URL:
    "postgresql://company_pilot_app@db.abcdefghijklmnopqrst.supabase.co/postgres?sslmode=require&sslaccept=strict",
  COMPANY_PILOT_DATABASE_ROLE: "company_pilot_app",
  COMPANY_PILOT_AI_ENABLED: "false",
  COMPANY_PILOT_DAILY_BUDGET_USD: "1",
  COMPANY_PILOT_MONTHLY_BUDGET_USD: "5",
  COMPANY_PILOT_MAX_CONCURRENT_CALLS: "1",
  COMPANY_PILOT_MAX_RETRIES: "0",
  COMPANY_PILOT_SCHEDULE_ENABLED: "true",
  WORKFORCE_DAILY_ENABLED: "false",
  COMPANY_PILOT_WORKER_SECRET: "fictional-worker-token-for-offline-tests-only",
};
