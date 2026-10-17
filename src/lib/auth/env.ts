export type SupabaseAuthConfig = {
  url: string;
  anonKey: string;
};

function nonEmpty(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function getSupabaseAuthConfig(env: NodeJS.ProcessEnv = process.env) {
  const preview = env.VERCEL_ENV === "preview" || env.NEXT_PUBLIC_VERCEL_ENV === "preview";
  const url = preview ? env.NEXT_PUBLIC_PREVIEW_SUPABASE_URL : env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = preview
    ? env.NEXT_PUBLIC_PREVIEW_SUPABASE_PUBLISHABLE_KEY
    : (env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (preview) {
    const ref = env.NEXT_PUBLIC_PREVIEW_SUPABASE_PROJECT_REF;
    if (!ref || !/^[a-z0-9]{20}$/.test(ref) || url !== `https://${ref}.supabase.co`) return null;
  }

  return nonEmpty(url) && nonEmpty(anonKey) ? { url, anonKey } : null;
}

export function getAppUrl(env: NodeJS.ProcessEnv = process.env) {
  if (env.VERCEL_ENV === "preview") {
    const host = env.VERCEL_BRANCH_URL || env.VERCEL_URL;
    if (nonEmpty(host) && /^[a-z0-9][a-z0-9.-]*\.vercel\.app$/i.test(host)) {
      return `https://${host}`;
    }
    return undefined;
  }
  return nonEmpty(env.NEXT_PUBLIC_APP_URL) ? env.NEXT_PUBLIC_APP_URL : undefined;
}
