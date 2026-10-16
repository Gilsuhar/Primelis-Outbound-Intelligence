import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { normalizeOpenAiModel } from "@/server/services/ai-provider";
import type { DailyConfig, DailyState, UsageDay } from "@/features/agent-workforce/daily/contracts";
import { DailyStore, dailyConfig } from "./state";
import { jerusalemParts } from "./schedule";
type Provider = "OPENAI" | "VERIFICATION" | "SERP" | "RESEARCH";
type Context = {
  actor: string;
  runId?: string;
  contactId?: string;
  store?: DailyStore;
  config?: DailyConfig;
  now?: () => Date;
  blocked?: string;
};
const scope = new AsyncLocalStorage<Context>();
export const withBudgetContext = <T>(context: Context, work: () => Promise<T>) =>
  scope.run(context, work);
export class BudgetError extends Error {
  constructor(
    readonly code:
      | "DAILY_BUDGET"
      | "MONTHLY_BUDGET"
      | "PROVIDER_CONCURRENCY"
      | "PRICING_REQUIRED"
      | "REQUEST_LIMIT"
      | "CANCELLED",
  ) {
    super(code);
  }
}
const emptyDay = (): UsageDay => ({
  estimatedUsd: 0,
  requests: { OPENAI: 0, VERIFICATION: 0, SERP: 0, RESEARCH: 0 },
  uncertainRequests: 0,
  models: {},
  researchAttempts: {},
});
function trim(state: DailyState, day: string, month: string) {
  // Keep current counters even if clocks move backwards. Reservations are never refunded after a crash.
  for (const key of Object.keys(state.days).sort().slice(0, -62))
    if (key !== day && !Object.values(state.pending).some((p) => p.day === key))
      delete state.days[key];
  for (const key of Object.keys(state.months).sort().slice(0, -24))
    if (key !== month && !Object.values(state.pending).some((p) => p.month === key))
      delete state.months[key];
}
export function reserveInState(
  state: DailyState,
  context: Context,
  config: DailyConfig,
  now: Date,
  provider: Provider,
  amount: number,
  model?: string,
) {
  if (!Number.isFinite(amount) || amount <= 0) throw new BudgetError("PRICING_REQUIRED");
  if (context.runId && state.runs.find((r) => r.id === context.runId)?.status !== "RUNNING")
    throw new BudgetError("CANCELLED");
  for (const [id, pending] of Object.entries(state.pending))
    if (Date.parse(pending.until) <= now.getTime()) delete state.pending[id]; // Charge retained; timeout is not a free call.
  if (Object.keys(state.pending).length >= config.maxConcurrentCalls)
    throw new BudgetError("PROVIDER_CONCURRENCY");
  const day = jerusalemParts(now).date,
    month = day.slice(0, 7),
    usage = state.days[day] ?? emptyDay();
  if (Object.values(usage.requests).reduce((a, b) => a + b, 0) >= 2000)
    throw new BudgetError("REQUEST_LIMIT");
  if (usage.estimatedUsd + amount > config.dailyBudgetUsd + 1e-9)
    throw new BudgetError("DAILY_BUDGET");
  if ((state.months[month] ?? 0) + amount > config.monthlyBudgetUsd + 1e-9)
    throw new BudgetError("MONTHLY_BUDGET");
  usage.estimatedUsd += amount;
  usage.requests[provider] = (usage.requests[provider] ?? 0) + 1;
  usage.uncertainRequests++;
  if (model) {
    const entry = usage.models[model] ?? { requests: 0, inputTokens: 0, outputTokens: 0 };
    entry.requests++;
    usage.models[model] = entry;
  }
  const run = state.runs.find((r) => r.id === context.runId);
  if (run) run.estimatedUsd += amount;
  state.days[day] = usage;
  state.months[month] = (state.months[month] ?? 0) + amount;
  const id = randomUUID();
  state.pending[id] = {
    day,
    month,
    provider,
    model,
    runId: context.runId,
    reservedUsd: amount,
    until: new Date(now.getTime() + 120000).toISOString(),
  };
  trim(state, day, month);
  return id;
}
export function settleInState(
  state: DailyState,
  id: string,
  actual?: { estimatedUsd: number; inputTokens?: number; outputTokens?: number },
) {
  const pending = state.pending[id];
  if (!pending) return; // Already settled, or crash expiry: never double refund.
  if (actual && Number.isFinite(actual.estimatedUsd) && actual.estimatedUsd >= 0) {
    const day = state.days[pending.day];
    const delta = actual.estimatedUsd - pending.reservedUsd;
    const run = state.runs.find((r) => r.id === pending.runId);
    if (run) run.estimatedUsd = Math.max(0, run.estimatedUsd + delta);
    day.estimatedUsd = Math.max(0, day.estimatedUsd + delta);
    state.months[pending.month] = Math.max(0, state.months[pending.month] + delta);
    day.uncertainRequests = Math.max(0, day.uncertainRequests - 1);
    if (pending.model) {
      const model = day.models[pending.model] ?? { requests: 0, inputTokens: 0, outputTokens: 0 };
      model.inputTokens += actual.inputTokens ?? 0;
      model.outputTokens += actual.outputTokens ?? 0;
      day.models[pending.model] = model;
    }
  }
  delete state.pending[id];
}
/** Reserve before each actual HTTP attempt, including manual research/draft/verification paths. */
export async function reserveProvider(provider: Provider, estimatedUsd: number, model?: string) {
  const context = scope.getStore();
  const actor = context?.actor ?? process.env.INTEGRATION_OPERATOR_USER_ID;
  if (
    !actor ||
    actor !== process.env.INTEGRATION_OPERATOR_USER_ID ||
    process.env.VERCEL_ENV === "production"
  )
    throw new BudgetError("PRICING_REQUIRED");
  const active = context ?? { actor },
    store = active.store ?? new DailyStore(),
    config = active.config ?? dailyConfig();
  let id: string;
  try {
    id = await store.change(actor, (state) =>
      reserveInState(
        state,
        active,
        config,
        (active.now ?? (() => new Date()))(),
        provider,
        estimatedUsd,
        model,
      ),
    );
  } catch (error) {
    if (context && error instanceof BudgetError) context.blocked = error.code;
    throw error;
  }
  return {
    finish: (actual?: { estimatedUsd: number; inputTokens?: number; outputTokens?: number }) =>
      store.change(actor, (state) => settleInState(state, id, actual)),
  };
}
function pricingError(): never {
  const context = scope.getStore();
  if (context) context.blocked = "PRICING_REQUIRED";
  throw new BudgetError("PRICING_REQUIRED");
}
export function unitCost(
  provider: "VERIFICATION" | "SERP" | "RESEARCH",
  env: Record<string, string | undefined> = process.env,
) {
  const value = Number(
    env[
      provider === "SERP"
        ? "WORKFORCE_SERP_REQUEST_USD"
        : provider === "RESEARCH"
          ? "WORKFORCE_RESEARCH_REQUEST_USD"
          : "WORKFORCE_VERIFICATION_REQUEST_USD"
    ],
  );
  if (!Number.isFinite(value) || value <= 0) {
    pricingError();
  }
  return value;
}
export function openAiPricing(
  model: string,
  env: Record<string, string | undefined> = process.env,
) {
  let rates: { input: number; output: number } | undefined;
  try {
    rates = JSON.parse(env.WORKFORCE_MODEL_PRICES_JSON ?? "{}")[model];
  } catch {
    pricingError();
  }
  if (
    !rates &&
    model === normalizeOpenAiModel(env.OPENAI_MODEL) &&
    env.OPENAI_INPUT_USD_PER_MILLION?.trim() &&
    env.OPENAI_OUTPUT_USD_PER_MILLION?.trim()
  )
    rates = {
      input: Number(env.OPENAI_INPUT_USD_PER_MILLION),
      output: Number(env.OPENAI_OUTPUT_USD_PER_MILLION),
    };
  if (
    !rates ||
    !Number.isFinite(rates.input) ||
    !Number.isFinite(rates.output) ||
    rates.input < 0 ||
    rates.output <= 0
  ) {
    pricingError();
  }
  return rates;
}
export function webSearchCost(env: Record<string, string | undefined> = process.env) {
  const cost = Number(env.WORKFORCE_WEB_SEARCH_REQUEST_USD);
  if (!Number.isFinite(cost) || cost <= 0) {
    pricingError();
  }
  return cost;
}

export function providerAttempts(existingLimit: number) {
  const context = scope.getStore();
  return context
    ? Math.min(existingLimit, (context.config ?? dailyConfig()).maxRetries + 1)
    : existingLimit;
}
export async function recordResearchAttempt(
  actor: string,
  id: string,
  store: DailyStore,
  now: Date,
) {
  await store.change(actor, (state) => {
    const key = jerusalemParts(now).date;
    const day = state.days[key] ?? emptyDay();
    day.researchAttempts[id] = (day.researchAttempts[id] ?? 0) + 1;
    state.days[key] = day;
  });
}
