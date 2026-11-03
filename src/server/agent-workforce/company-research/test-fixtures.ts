/** Fictional offline fixtures. Never imported by operational code. */
import { localDevelopmentUser } from "@/lib/auth/local-development";
export const fictionalCompanyEnv = {
  NODE_ENV: "development",
  LOCAL_DEV_LOGIN: "true",
  LOCAL_DEV_SESSION_TOKEN: "fictional-session-32-characters-long-test-only",
  DATABASE_URL: "postgresql://fictional@localhost:5432/agent_workforce_test",
  VERCEL: "",
  VERCEL_ENV: "",
  NEXT_PUBLIC_VERCEL_ENV: "",
  INTEGRATION_OPERATOR_USER_ID: localDevelopmentUser.id,
  WORKFORCE_DAILY_ENABLED: "false",
  LOCAL_COMPANY_AI_ENABLED: "true",
  LOCAL_COMPANY_DAILY_BUDGET_USD: "1",
  LOCAL_COMPANY_MONTHLY_BUDGET_USD: "5",
  LOCAL_COMPANY_MAX_CONCURRENT_CALLS: "1",
  LOCAL_COMPANY_MAX_RETRIES: "0",
  LOCAL_COMPANY_OPENAI_MODEL: "gpt-5.4-mini-2026-03-17",
  LOCAL_COMPANY_OPENAI_API_KEY: "fictional-key-not-a-credential",
  LOCAL_COMPANY_INPUT_USD_PER_MILLION: "0.75",
  LOCAL_COMPANY_OUTPUT_USD_PER_MILLION: "4.50",
  LOCAL_COMPANY_WEB_SEARCH_REQUEST_USD: "0.01",
};
