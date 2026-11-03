/** Fictional deployment bindings only; never provisioned or used for network access. */
export function previewFixture(): NodeJS.ProcessEnv {
  const ref = "aaaaaaaaaaaaaaaaaaaa";
  return {
    NODE_ENV: "test",
    VERCEL: "1",
    VERCEL_ENV: "preview",
    NEXT_PUBLIC_VERCEL_ENV: "preview",
    VERCEL_PROJECT_ID: "prj_synthetic_preview",
    PREVIEW_APPROVED_VERCEL_PROJECT_ID: "prj_synthetic_preview",
    VERCEL_GIT_COMMIT_REF: "codex/synthetic-preview",
    PREVIEW_APPROVED_BRANCH: "codex/synthetic-preview",
    PREVIEW_APPROVED_SUPABASE_PROJECT_REF: ref,
    NEXT_PUBLIC_PREVIEW_SUPABASE_PROJECT_REF: ref,
    NEXT_PUBLIC_PREVIEW_SUPABASE_URL: `https://${ref}.supabase.co`,
    NEXT_PUBLIC_PREVIEW_SUPABASE_PUBLISHABLE_KEY: "synthetic-publishable-key",
    PREVIEW_APPROVED_DATABASE_ENDPOINT: `db.${ref}.supabase.co:5432`,
    PREVIEW_APPROVED_DATABASE_ROLE: "recycler_preview_app",
    PREVIEW_DATABASE_URL: `postgresql://recycler_preview_app:synthetic@db.${ref}.supabase.co:5432/postgres?sslmode=require&sslaccept=strict`,
  };
}
