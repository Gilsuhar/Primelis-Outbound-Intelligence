import { isPreviewRestricted } from "../preview-policy.mjs";
/** Explicit localhost-only development identity; never a Supabase authentication substitute. */
export const localDevelopmentUser = {
  id: "local-development-agent-workforce",
  email: "local-development@example.invalid",
  name: "Local Development (test database only)",
  role: "SALES_USER" as const,
};
export const localDevelopmentCookie = "primelis-local-development";
export function localDevelopmentOrigin(host: string | null) {
  return localDevelopmentHost(host)
    ? `${process.env.LOCAL_DEV_HTTPS === "true" ? "https" : "http"}://${host}`
    : null;
}
export function localDevelopmentConfig(env: NodeJS.ProcessEnv = process.env) {
  if (
    env.NODE_ENV !== "development" ||
    isPreviewRestricted(env) ||
    env.LOCAL_DEV_LOGIN !== "true" ||
    env.VERCEL ||
    env.VERCEL_ENV ||
    env.NEXT_PUBLIC_VERCEL_ENV ||
    !env.LOCAL_DEV_SESSION_TOKEN ||
    env.LOCAL_DEV_SESSION_TOKEN.length < 32
  )
    return null;
  try {
    const url = new URL(env.DATABASE_URL ?? "");
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      url.port !== "5432" ||
      url.pathname !== "/agent_workforce_test" ||
      url.search ||
      url.hash
    )
      return null;
    return { token: env.LOCAL_DEV_SESSION_TOKEN };
  } catch {
    return null;
  }
}
export function localDevelopmentHost(host: string | null) {
  return host === "127.0.0.1:3000" || host === "localhost:3000";
}
export function localDevelopmentSession(host: string | null, cookie: string | undefined) {
  const config = localDevelopmentConfig();
  return !!config && localDevelopmentHost(host) && cookie === config.token;
}
