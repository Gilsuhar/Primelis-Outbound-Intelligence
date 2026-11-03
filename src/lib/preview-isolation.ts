import { companyPilotConfig } from "./company-pilot-isolation";
import { approvedPreviewIdentity, isPreviewRestricted } from "./preview-policy.mjs";
/** Binding validation, not proof of database grants (audited separately). No URLs in errors. */
export function configuredDatabaseUrl(env: NodeJS.ProcessEnv = process.env) {
  if (isPreviewRestricted(env)) {
    try {
      const ref = approvedPreviewIdentity(env);
      const raw = env.PREVIEW_DATABASE_URL;
      if (!raw || env.DATABASE_URL || env.DIRECT_URL) throw new Error();
      const url = new URL(raw);
      const role = env.PREVIEW_APPROVED_DATABASE_ROLE;
      const endpoint = env.PREVIEW_APPROVED_DATABASE_ENDPOINT;
      const direct = url.hostname === `db.${ref}.supabase.co`;
      if (
        role !== "recycler_preview_app" ||
        !["postgres:", "postgresql:"].includes(url.protocol) ||
        !endpoint ||
        url.host !== endpoint ||
        (!direct && !/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname)) ||
        !["5432", "6543"].includes(url.port) ||
        decodeURIComponent(url.username) !== (direct ? role : `${role}.${ref}`) ||
        !url.password ||
        url.pathname !== "/postgres" ||
        url.hash ||
        url.searchParams.get("sslmode") !== "require" ||
        url.searchParams.get("sslaccept") !== "strict" ||
        [...url.searchParams.keys()].some(
          (key) =>
            !["sslmode", "sslaccept", "pgbouncer", "connection_limit", "pool_timeout"].includes(
              key,
            ) || url.searchParams.getAll(key).length !== 1,
        ) ||
        (url.searchParams.has("pgbouncer") && url.searchParams.get("pgbouncer") !== "true") ||
        ["connection_limit", "pool_timeout"].some(
          (key) => url.searchParams.has(key) && !/^[1-9]\d{0,2}$/.test(url.searchParams.get(key)!),
        )
      )
        throw new Error();
      return raw;
    } catch {
      throw new Error("PREVIEW_DATABASE_ISOLATION_REQUIRED");
    }
  }
  if (env.COMPANY_PILOT_ENABLED === "true") {
    companyPilotConfig(env);
    return env.PREVIEW_DATABASE_URL;
  }
  return env.DATABASE_URL;
}
