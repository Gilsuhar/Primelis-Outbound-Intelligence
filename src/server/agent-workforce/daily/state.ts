import "server-only";
import { PrismaIntegrationStore, type IntegrationStore } from "@/server/integrations/store";
import {
  dailyConfigSchema,
  initialDailyState,
  type DailyState,
} from "@/features/agent-workforce/daily/contracts";
export function dailyConfig(env: NodeJS.ProcessEnv = process.env) {
  return dailyConfigSchema.parse({
    enabled: env.WORKFORCE_DAILY_ENABLED === "true",
    time: env.WORKFORCE_DAILY_TIME ?? "09:00",
    timezone: "Asia/Jerusalem",
    dailyBudgetUsd: Number(env.WORKFORCE_DAILY_BUDGET_USD ?? 5),
    monthlyBudgetUsd: Number(env.WORKFORCE_MONTHLY_BUDGET_USD ?? 100),
    maxContacts: Number(env.WORKFORCE_MAX_CONTACTS ?? 25),
    maxConcurrentCalls: Number(env.WORKFORCE_MAX_CONCURRENT_CALLS ?? 1),
    maxRetries: Number(env.WORKFORCE_MAX_RETRIES ?? 2),
  });
}
/** Uses the existing per-operator transaction/advisory lock; no provider I/O inside it. */
export class DailyStore {
  constructor(private readonly integrations: IntegrationStore = new PrismaIntegrationStore()) {}
  async get(actor: string): Promise<DailyState> {
    return structuredClone(
      (await this.integrations.get(actor, "HUBSPOT")).state.daily ?? initialDailyState(),
    );
  }
  async change<T>(actor: string, mutate: (state: DailyState) => T): Promise<T> {
    return this.integrations.change(actor, "HUBSPOT", async (row) => {
      const state = structuredClone(row.state.daily ?? initialDailyState());
      const value = mutate(state);
      row.state.daily = state;
      return { row, value };
    });
  }
}
