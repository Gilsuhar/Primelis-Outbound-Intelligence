import { assertPreviewOperation } from "../src/lib/preview-policy.mjs";
assertPreviewOperation("database-write");
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

// Approved profile only. No credential values are returned or sent to a provider.
export function validateCompanyProfile(env) {
  const expected = {
    LOCAL_COMPANY_DAILY_BUDGET_USD: "1",
    LOCAL_COMPANY_MONTHLY_BUDGET_USD: "5",
    LOCAL_COMPANY_MAX_CONCURRENT_CALLS: "1",
    LOCAL_COMPANY_MAX_RETRIES: "0",
    LOCAL_COMPANY_OPENAI_MODEL: "gpt-5.4-mini-2026-03-17",
    LOCAL_COMPANY_INPUT_USD_PER_MILLION: "0.75",
    LOCAL_COMPANY_OUTPUT_USD_PER_MILLION: "4.50",
    LOCAL_COMPANY_WEB_SEARCH_REQUEST_USD: "0.01",
    WORKFORCE_DAILY_ENABLED: "false",
  };
  if (Object.entries(expected).some(([key, value]) => env[key] !== value))
    throw new Error("APPROVED_PROFILE_REQUIRED");
  if (env.VERCEL || env.VERCEL_ENV || env.NEXT_PUBLIC_VERCEL_ENV)
    throw new Error("LOCAL_ONLY_REQUIRED");
  if (env.HTTP_PROXY || env.HTTPS_PROXY) throw new Error("PUBLIC_SOURCE_PROXY_UNSUPPORTED");
  return expected;
}

export async function checkLocalDatabase(env) {
  let url;
  try {
    url = new URL(env.LOCAL_PRODUCT_DATABASE_URL);
  } catch {
    throw new Error("LOCAL_DATABASE_REQUIRED");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.port !== "5432" ||
    url.pathname !== "/agent_workforce_test" ||
    url.search ||
    url.hash
  )
    throw new Error("LOCAL_DATABASE_REQUIRED");
  const db = new PrismaClient({
    datasources: { db: { url: env.LOCAL_PRODUCT_DATABASE_URL } },
    log: [],
  });
  try {
    return await db.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
        await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '7s'");
        const identity = await tx.$queryRawUnsafe("SELECT current_database() AS name");
        if (identity[0]?.name !== "agent_workforce_test")
          throw new Error("LOCAL_DATABASE_REQUIRED");
        const profile = await tx.$queryRawUnsafe(
          'SELECT count(*)::int AS count FROM "User" WHERE id=$1 AND role::text=$2',
          "local-development-agent-workforce",
          "SALES_USER",
        );
        // Select the actual columns needed by company persistence; no inserts or schema operations.
        await tx.$queryRawUnsafe(
          'SELECT id,"userId",workflow,"inputSnapshot","draftContent","retrievedKnowledgeIds","sourceIds","providerName","draftStatus","updatedAt" FROM "GeneratedDraft" LIMIT 0',
        );
        const ledgers = await tx.$queryRawUnsafe(
          'SELECT "draftContent" FROM "GeneratedDraft" WHERE "userId"=$1 AND workflow=$2 LIMIT 2',
          "local-development-agent-workforce",
          "LOCAL_COMPANY_AI_BUDGET",
        );
        if (ledgers.length > 1) throw new Error("BUDGET_LEDGER_INVALID");
        let dayUsed = 0,
          monthUsed = 0,
          pending = 0;
        if (ledgers.length) {
          let state;
          try {
            state = JSON.parse(ledgers[0].draftContent);
          } catch {
            throw new Error("BUDGET_LEDGER_INVALID");
          }
          if (state.version !== 1 || !state.days || !state.months || !state.pending)
            throw new Error("BUDGET_LEDGER_INVALID");
          const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Jerusalem",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).formatToParts(new Date());
          const part = (name) => parts.find((item) => item.type === name).value;
          const day = `${part("year")}-${part("month")}-${part("day")}`;
          dayUsed = state.days[day]?.estimatedUsd ?? 0;
          monthUsed = state.months[day.slice(0, 7)] ?? 0;
          if (
            ![dayUsed, monthUsed].every(
              (n) => typeof n === "number" && Number.isFinite(n) && n >= 0,
            )
          )
            throw new Error("BUDGET_LEDGER_INVALID");
          for (const entry of Object.values(state.pending)) {
            if (!Number.isFinite(Date.parse(entry.until))) throw new Error("BUDGET_LEDGER_INVALID");
            if (Date.parse(entry.until) > Date.now()) pending++;
          }
        }
        if (pending) throw new Error("PROVIDER_REQUEST_ALREADY_PENDING");
        if (dayUsed + 0.3181 > 1 + 1e-9 || monthUsed + 0.3181 > 5 + 1e-9)
          throw new Error("INSUFFICIENT_DISCOVERY_RESERVATION");
        return {
          database: "PASS_READ_ONLY",
          companyColumns: "PASS",
          localSalesProfile: profile[0].count === 1 ? "PRESENT" : "LOGIN_REQUIRED",
          dailyEstimatedUsd: dayUsed,
          monthlyEstimatedUsd: monthUsed,
          pendingProviderRequests: pending,
        };
      },
      { timeout: 10000, maxWait: 5000 },
    );
  } finally {
    await db.$disconnect();
  }
}

async function main() {
  try {
    validateCompanyProfile(process.env);
    const database = process.argv.includes("--profile-only")
      ? {}
      : await checkLocalDatabase(process.env);
    console.log(
      JSON.stringify({
        ok: true,
        profile: "PASS",
        ...database,
        credentialAndModelAccess: "NOT_CHECKED",
        paidRequestsMade: 0,
      }),
    );
  } catch (error) {
    const allowed = new Set([
      "APPROVED_PROFILE_REQUIRED",
      "LOCAL_ONLY_REQUIRED",
      "PUBLIC_SOURCE_PROXY_UNSUPPORTED",
      "LOCAL_DATABASE_REQUIRED",
      "BUDGET_LEDGER_INVALID",
      "PROVIDER_REQUEST_ALREADY_PENDING",
      "INSUFFICIENT_DISCOVERY_RESERVATION",
    ]);
    console.log(
      JSON.stringify({
        ok: false,
        code: allowed.has(error.message) ? error.message : "LOCAL_READ_ONLY_PREFLIGHT_FAILED",
        details: "withheld; no provider request or database write performed",
      }),
    );
    process.exitCode = 1;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main();
