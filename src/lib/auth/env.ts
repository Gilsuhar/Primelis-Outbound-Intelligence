export type SupabaseAuthConfig = {
  url: string;
  anonKey: string;
};

function nonEmpty(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function getSupabaseAuthConfig(env: NodeJS.ProcessEnv = process.env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return nonEmpty(url) && nonEmpty(anonKey) ? { url, anonKey } : null;
}

export function getAppUrl(env: NodeJS.ProcessEnv = process.env) {
  return nonEmpty(env.NEXT_PUBLIC_APP_URL) ? env.NEXT_PUBLIC_APP_URL : undefined;
}
