import "server-only";
import { localDevelopmentConfig, localDevelopmentUser } from "@/lib/auth/local-development";
import { dailyConfigSchema } from "@/features/agent-workforce/daily/contracts";
import { openAiPricing, webSearchCost } from "../daily/budget";
import { normalizeOpenAiModel } from "@/server/services/ai-provider";

export function requireLocalCompanyAccess(actor: string, env: NodeJS.ProcessEnv = process.env) {
  if (
    !localDevelopmentConfig(env) ||
    actor !== localDevelopmentUser.id ||
    env.INTEGRATION_OPERATOR_USER_ID !== actor ||
    env.WORKFORCE_DAILY_ENABLED !== "false"
  )
    throw new Error("LOCAL_COMPANY_ONLY");
}

/** No credentials are returned to the browser; absent/empty limits never select defaults. */
export function localCompanyAiConfig(actor: string, env: NodeJS.ProcessEnv = process.env) {
  requireLocalCompanyAccess(actor, env);
  if (env.LOCAL_COMPANY_AI_ENABLED !== "true") throw new Error("COMPANY_AI_DISABLED");
  const required = [
    "LOCAL_COMPANY_DAILY_BUDGET_USD",
    "LOCAL_COMPANY_MONTHLY_BUDGET_USD",
    "LOCAL_COMPANY_MAX_CONCURRENT_CALLS",
    "LOCAL_COMPANY_MAX_RETRIES",
    "LOCAL_COMPANY_OPENAI_MODEL",
    "LOCAL_COMPANY_OPENAI_API_KEY",
    "LOCAL_COMPANY_INPUT_USD_PER_MILLION",
    "LOCAL_COMPANY_OUTPUT_USD_PER_MILLION",
    "LOCAL_COMPANY_WEB_SEARCH_REQUEST_USD",
  ];
  if (required.some((key) => !env[key]?.trim())) throw new Error("COMPANY_AI_CONFIG_REQUIRED");
  const daily = Number(env.LOCAL_COMPANY_DAILY_BUDGET_USD);
  const monthly = Number(env.LOCAL_COMPANY_MONTHLY_BUDGET_USD);
  const concurrent = Number(env.LOCAL_COMPANY_MAX_CONCURRENT_CALLS);
  const retries = Number(env.LOCAL_COMPANY_MAX_RETRIES);
  if (
    daily !== 1 ||
    monthly !== 5 ||
    concurrent !== 1 ||
    !Number.isInteger(retries) ||
    retries !== 0
  )
    throw new Error("COMPANY_AI_INVALID_LIMITS");
  const model = env.LOCAL_COMPANY_OPENAI_MODEL!.trim();
  // Controlled test policy: this snapshot's documented context bound and pricing
  // are reviewed together. Do not silently substitute a model with different limits.
  if (model !== "gpt-5.4-mini-2026-03-17" || normalizeOpenAiModel(model) !== model)
    throw new Error("COMPANY_AI_CONFIG_REQUIRED");
  const providerEnv: NodeJS.ProcessEnv = {
    NODE_ENV: env.NODE_ENV,
    AI_PROVIDER: "openai",
    OPENAI_API_KEY: env.LOCAL_COMPANY_OPENAI_API_KEY,
    OPENAI_MODEL: model,
    OPENAI_RESEARCH_MODEL: model,
    OPENAI_INPUT_USD_PER_MILLION: env.LOCAL_COMPANY_INPUT_USD_PER_MILLION,
    OPENAI_OUTPUT_USD_PER_MILLION: env.LOCAL_COMPANY_OUTPUT_USD_PER_MILLION,
    WORKFORCE_WEB_SEARCH_REQUEST_USD: env.LOCAL_COMPANY_WEB_SEARCH_REQUEST_USD,
  };
  const rates = openAiPricing(model, providerEnv);
  if (rates.input < 0.75 || rates.output < 4.5 || webSearchCost(providerEnv) < 0.01)
    throw new Error("COMPANY_AI_CONFIG_REQUIRED");
  const budget = dailyConfigSchema.parse({
    enabled: false,
    time: "09:00",
    timezone: "Asia/Jerusalem",
    dailyBudgetUsd: daily,
    monthlyBudgetUsd: monthly,
    maxConcurrentCalls: concurrent,
    maxRetries: retries,
    maxContacts: 1,
  });
  return { providerEnv, budget, modelOptions: { discoveryInputTokenCeiling: 400_000 } };
}
