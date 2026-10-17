/** No credentials or connection URLs are included in errors. */
export function configuredDatabaseUrl(env: NodeJS.ProcessEnv = process.env) {
  if (env.VERCEL_ENV !== "preview") return env.DATABASE_URL;
  const ref = env.NEXT_PUBLIC_PREVIEW_SUPABASE_PROJECT_REF;
  if (!ref || !/^[a-z0-9]{20}$/.test(ref) || !env.PREVIEW_DATABASE_URL)
    throw new Error("PREVIEW_DATABASE_ISOLATION_REQUIRED");
  try {
    const url = new URL(env.PREVIEW_DATABASE_URL);
    const matches =
      url.hostname === `db.${ref}.supabase.co` ||
      (url.hostname.endsWith(".pooler.supabase.com") &&
        decodeURIComponent(url.username) === `postgres.${ref}`);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !matches) throw new Error();
    return env.PREVIEW_DATABASE_URL;
  } catch {
    throw new Error("PREVIEW_DATABASE_ISOLATION_REQUIRED");
  }
}
