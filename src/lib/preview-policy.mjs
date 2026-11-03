/** Shared by server/Edge boundaries and Node maintenance scripts. No credentials in errors. */
export function isPreviewRestricted(env = process.env) {
  const server = env.VERCEL_ENV;
  const client = env.NEXT_PUBLIC_VERCEL_ENV;
  if (server === "production" && (!client || client === "production")) return false;
  // Missing/unknown/conflicting cloud identity must never become local mode.
  return Boolean(server || client || env.VERCEL || env.VERCEL_URL || env.VERCEL_PROJECT_ID);
}

export function assertPreviewOperation(operation, env = process.env) {
  // Injected provider configuration cannot bypass the real runtime's restriction.
  if (isPreviewRestricted(process.env) || isPreviewRestricted(env))
    throw new Error(`PREVIEW_OPERATION_DENIED:${operation}`);
}

export function previewApiDenied(env = process.env) {
  return isPreviewRestricted(env)
    ? Response.json(
        {
          ok: false,
          code: "PREVIEW_OPERATION_DENIED",
          message: "Preview permits authenticated synthetic review only.",
        },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      )
    : null;
}

export function approvedPreviewIdentity(env = process.env) {
  const ref = env.PREVIEW_APPROVED_SUPABASE_PROJECT_REF;
  if (
    env.VERCEL_ENV !== "preview" ||
    (env.NEXT_PUBLIC_VERCEL_ENV && env.NEXT_PUBLIC_VERCEL_ENV !== "preview") ||
    !env.PREVIEW_APPROVED_VERCEL_PROJECT_ID ||
    env.VERCEL_PROJECT_ID !== env.PREVIEW_APPROVED_VERCEL_PROJECT_ID ||
    !env.PREVIEW_APPROVED_BRANCH ||
    env.VERCEL_GIT_COMMIT_REF !== env.PREVIEW_APPROVED_BRANCH ||
    !ref ||
    !/^[a-z0-9]{20}$/.test(ref) ||
    ["mfxqiyidmdppvdzeboke", "ofxqdwpyqbvskrcfpdmx"].includes(ref) ||
    env.NEXT_PUBLIC_PREVIEW_SUPABASE_PROJECT_REF !== ref ||
    env.NEXT_PUBLIC_PREVIEW_SUPABASE_URL !== `https://${ref}.supabase.co`
  )
    throw new Error("PREVIEW_IDENTITY_REQUIRED");
  return ref;
}
