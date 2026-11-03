/** Edge-compatible fail-closed pilot configuration. Never returns credentials. */
export function companyPilotConfig(env: NodeJS.ProcessEnv = process.env) {
  const fail = () => {
    throw new Error("PILOT_CONFIGURATION_REQUIRED");
  };
  const ref = env.COMPANY_PILOT_SUPABASE_REF;
  const origin = env.COMPANY_PILOT_ORIGIN;
  const actor = env.COMPANY_PILOT_OPERATOR_ID;
  if (
    env.COMPANY_PILOT_ENABLED !== "true" ||
    env.COMPANY_PILOT_MODE !== "SIMULATED" ||
    env.VERCEL_ENV !== "preview" ||
    env.NEXT_PUBLIC_VERCEL_ENV !== "preview" ||
    !env.VERCEL_PROJECT_ID ||
    env.VERCEL_PROJECT_ID !== env.COMPANY_PILOT_VERCEL_PROJECT_ID ||
    !actor ||
    actor === "local-development-agent-workforce" ||
    !ref ||
    !/^[a-z0-9]{20}$/.test(ref) ||
    ["mfxqiyidmdppvdzeboke", "ofxqdwpyqbvskrcfpdmx"].includes(ref) ||
    env.NEXT_PUBLIC_PREVIEW_SUPABASE_PROJECT_REF !== ref ||
    env.NEXT_PUBLIC_PREVIEW_SUPABASE_URL !== `https://${ref}.supabase.co` ||
    !env.NEXT_PUBLIC_PREVIEW_SUPABASE_PUBLISHABLE_KEY ||
    env.WORKFORCE_DAILY_ENABLED !== "false" ||
    env.LOCAL_DEV_LOGIN === "true" ||
    env.LOCAL_COMPANY_AI_ENABLED === "true" ||
    env.COMPANY_PILOT_AI_ENABLED !== "false" ||
    env.COMPANY_PILOT_DAILY_BUDGET_USD !== "1" ||
    env.COMPANY_PILOT_MONTHLY_BUDGET_USD !== "5" ||
    env.COMPANY_PILOT_MAX_CONCURRENT_CALLS !== "1" ||
    env.COMPANY_PILOT_MAX_RETRIES !== "0" ||
    !["true", "false"].includes(env.COMPANY_PILOT_SCHEDULE_ENABLED ?? "") ||
    env.COMPANY_PILOT_DATABASE_ROLE !== "company_pilot_app"
  )
    fail();
  // Reject inherited credentials instead of merely assuming dormant integrations stay dormant.
  if (
    Object.keys(env).some(
      (key) =>
        env[key] &&
        /^(DATABASE_URL|DIRECT_URL|OPENAI_API_KEY|LOCAL_COMPANY_OPENAI_API_KEY|INTEGRATION_WORKER_SECRET|INTEGRATION_OPERATOR_USER_ID|SUPABASE_SERVICE_ROLE_KEY|HUBSPOT_.*|OUTREACH_.*|GETLEADS_.*)$/.test(
          key,
        ),
    )
  )
    fail();
  try {
    const url = new URL(origin ?? "");
    if (
      url.origin !== origin ||
      url.protocol !== "https:" ||
      !/^[a-z0-9-]+\.vercel\.app$/.test(url.hostname) ||
      ![env.VERCEL_URL, env.VERCEL_BRANCH_URL].includes(url.hostname)
    )
      fail();
    const db = new URL(env.PREVIEW_DATABASE_URL ?? "");
    const user = decodeURIComponent(db.username);
    if (
      !["postgres:", "postgresql:"].includes(db.protocol) ||
      db.pathname !== "/postgres" ||
      db.hash ||
      db.searchParams.get("sslmode") !== "require" ||
      db.searchParams.get("sslaccept") !== "strict" ||
      !(
        (db.hostname === `db.${ref}.supabase.co` && user === "company_pilot_app") ||
        (/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(db.hostname) &&
          user === `company_pilot_app.${ref}`)
      ) ||
      [...db.searchParams.keys()].some(
        (key) =>
          !["sslmode", "sslaccept", "pgbouncer", "connection_limit", "pool_timeout"].includes(
            key,
          ) || db.searchParams.getAll(key).length !== 1,
      )
    )
      fail();
  } catch {
    fail();
  }
  return {
    actor: actor!,
    origin: origin!,
    ref: ref!,
    mode: "SIMULATED" as const,
    schedule: env.COMPANY_PILOT_SCHEDULE_ENABLED === "true",
  };
}
export function pilotPathAllowed(path: string, method: string) {
  if (path === "/local-login") return false;
  if (path.startsWith("/api/"))
    return (
      (path === "/api/sales-agent/company-queue" && ["GET", "POST", "DELETE"].includes(method)) ||
      (path === "/api/sales-agent/company-queue/worker" && method === "POST")
    );
  // Other application server actions cannot write/draft/send in the fixture pilot.
  return ["GET", "HEAD"].includes(method) || path === "/login" || path.startsWith("/auth/");
}
