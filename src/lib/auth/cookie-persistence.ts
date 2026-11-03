import type { CookieOptions } from "@supabase/ssr";

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
      cookieStore.set(name, value, cookieOptions);
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
