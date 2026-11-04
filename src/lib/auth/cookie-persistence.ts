import type { CookieOptions } from "@supabase/ssr";
import { isPreviewRestricted } from "@/lib/preview-policy.mjs";

// Preview Auth is server-mediated over HTTPS; Production cookie behavior is preserved.
export function authCookieOptions(options: CookieOptions): CookieOptions {
  return isPreviewRestricted()
    ? { ...options, secure: true, httpOnly: true, sameSite: "lax", path: "/", domain: undefined }
    : options;
}

export type SupabaseCookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

type WritableCookieStore = {
  set: (name: string, value: string, options: CookieOptions) => unknown;
};

export type SupabaseCookiePersistenceOptions = {
  requireCookieWrites?: boolean;
  onPkceVerifierPersisted?: () => void;
  onCookieWriteFailure?: () => void;
};

export function persistSupabaseCookies(
  cookieStore: WritableCookieStore,
  cookiesToSet: SupabaseCookieToSet[],
  options: SupabaseCookiePersistenceOptions,
) {
  try {
    cookiesToSet.forEach(({ name, value, options: cookieOptions }) => {
      cookieStore.set(name, value, authCookieOptions(cookieOptions));
    });
    if (
      cookiesToSet.some(({ name, value }) => name.includes("-code-verifier") && value.length > 0)
    ) {
      options.onPkceVerifierPersisted?.();
    }
  } catch {
    options.onCookieWriteFailure?.();
    if (options.requireCookieWrites) {
      throw new Error("Required authentication cookie could not be persisted.");
    }
  }
}
