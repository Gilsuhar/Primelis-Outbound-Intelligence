const fail = code => { throw new Error("PREVIEW_ACTIVATION_" + code); };
export const credentialAttestation = "unique-random-32-bytes-retained";

// The full runtime URL is staged once in the protected environment, retained by the
// owner, and later copied to branch-scoped Vercel Preview under separate approval.
// Activation consumes the result only in its private prompt adapter; acceptance
// discards it after validation. Never serialize the returned bytes.
export function restrictedRuntimeCredential(env) {
  try {
    if (env.PREVIEW_RUNTIME_CREDENTIAL_ATTESTATION !== credentialAttestation) fail("CREDENTIAL_INPUT");
    const raw = env.PREVIEW_RUNTIME_DATABASE_URL;
    if (typeof raw !== "string" || /[\s\x00-\x1f\x7f]/.test(raw)) fail("CREDENTIAL_INPUT");
    const url = new URL(raw);
    const password = decodeURIComponent(url.password);
    if (url.protocol !== "postgresql:" || url.hostname !== "aws-1-us-west-2.pooler.supabase.com" || url.port !== "5432" ||
        url.username !== "recycler_preview_app.txfxfrlhtvzwgluhnbpw" || url.pathname !== "/postgres" || url.hash ||
        url.searchParams.get("sslmode") !== "require" || url.searchParams.get("sslaccept") !== "strict" ||
        url.searchParams.get("connection_limit") !== "1" ||
        [...url.searchParams.keys()].sort().join(",") !== "connection_limit,sslaccept,sslmode" ||
        !/^[A-Za-z0-9_-]{43}$/.test(password) || url.password !== password ||
        Buffer.from(password, "base64url").length !== 32 || Buffer.from(password, "base64url").toString("base64url") !== password) fail("CREDENTIAL_INPUT");
    return password;
  } catch { fail("CREDENTIAL_INPUT"); }
}

export function runtimeCredential(env) {
  const password = restrictedRuntimeCredential(env);
  try { if (password === decodeURIComponent(new URL(env.PREVIEW_SETUP_DATABASE_URL).password)) fail("CREDENTIAL_INPUT"); }
  catch { fail("CREDENTIAL_INPUT"); }
  return password;
}
