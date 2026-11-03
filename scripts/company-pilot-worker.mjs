import { assertPreviewOperation } from "../src/lib/preview-policy.mjs";
assertPreviewOperation("worker");
/** Dedicated fixture dispatcher. No database, AI provider or integration credentials required. */
import { setTimeout as delay } from "node:timers/promises";
const env = process.env;
let target;
try {
  target = new URL(env.COMPANY_PILOT_ORIGIN ?? "");
} catch {
  /* Fail closed below. */
}
const secret = env.COMPANY_PILOT_WORKER_SECRET;
if (
  env.COMPANY_PILOT_ENABLED !== "true" ||
  env.COMPANY_PILOT_MODE !== "SIMULATED" ||
  env.COMPANY_PILOT_AI_ENABLED !== "false" ||
  env.COMPANY_PILOT_DAILY_BUDGET_USD !== "1" ||
  env.COMPANY_PILOT_MONTHLY_BUDGET_USD !== "5" ||
  env.COMPANY_PILOT_MAX_CONCURRENT_CALLS !== "1" ||
  env.COMPANY_PILOT_MAX_RETRIES !== "0" ||
  !target ||
  target.origin !== env.COMPANY_PILOT_ORIGIN ||
  target.protocol !== "https:" ||
  !/^[a-z0-9-]+\.vercel\.app$/.test(target.hostname) ||
  !secret ||
  secret.length < 32 ||
  Object.keys(env).some(
    (key) =>
      env[key] &&
      /^(DATABASE_URL|PREVIEW_DATABASE_URL|OPENAI_API_KEY|LOCAL_COMPANY_OPENAI_API_KEY|INTEGRATION_WORKER_SECRET|HUBSPOT_.*|OUTREACH_.*)$/.test(
        key,
      ),
  )
) {
  console.error("Company fixture worker configuration rejected; values withheld.");
  process.exit(1);
}
let stopping = false,
  failures = 0;
const stop = () => {
  stopping = true;
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
do {
  try {
    const response = await fetch(new URL("/api/sales-agent/company-queue/worker", target), {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(125000),
      headers: {
        authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
        ...(env.VERCEL_AUTOMATION_BYPASS_SECRET
          ? { "x-vercel-protection-bypass": env.VERCEL_AUTOMATION_BYPASS_SECRET }
          : {}),
      },
      body: "{}",
    });
    if (!response.ok) throw new Error("WAKE_REJECTED");
    const body = await response.json();
    if (body.ok !== true || body.mode !== "SIMULATED" || body.providerRequests !== 0)
      throw new Error("WAKE_INVALID");
    failures = 0;
    console.log("Fixture worker wake completed; inspect persisted review queue.");
  } catch {
    failures++;
    console.error("Company worker wake failed; details withheld. No provider retry is requested.");
  }
  if (process.argv.includes("--once")) {
    if (failures) process.exitCode = 1;
    break;
  }
  if (!stopping) await delay(Math.min(300000, 15000 * 2 ** Math.min(failures, 5)));
} while (!stopping);
