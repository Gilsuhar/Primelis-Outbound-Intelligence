"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getSupabaseAuthConfig } from "@/lib/auth/env";
import { getSafeSupabaseError, logAuthDiagnostic } from "@/lib/auth/diagnostics";
import { createSupabaseServerClient, getRequestOrigin } from "@/lib/auth/server";
import { getSafeInternalPath } from "@/lib/private-preview-auth";

type LoginState = {
  ok: boolean;
  message: string;
};

const loginSchema = z.object({
  email: z.string().trim().email(),
});

export async function requestLoginLink(
  _state: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Enter a valid invited work email.",
    };
  }

  if (!getSupabaseAuthConfig()) {
    return {
      ok: false,
      message: "Private preview authentication is not configured for this environment.",
    };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      ok: false,
      message: "Private preview authentication is not available right now.",
    };
  }

  const origin = await getRequestOrigin();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      shouldCreateUser: false,
    },
  });

  if (error) {
    return {
      ok: false,
      message: "We could not send a private preview login link for that email.",
    };
  }

  return {
    ok: true,
    message: "If this email has been invited, a private preview login link has been sent.",
  };
}

export async function continueWithGoogle(formData: FormData) {
  if (!getSupabaseAuthConfig()) {
    logAuthDiagnostic("warn", {
      operation: "google_oauth",
      stage: "initiation_configuration_invalid",
    });
    redirect("/login?error=configuration_error");
  }

  let pkceVerifierPersisted = false;
  const supabase = await createSupabaseServerClient({
    requireCookieWrites: true,
    onPkceVerifierPersisted: () => {
      pkceVerifierPersisted = true;
    },
    onCookieWriteFailure: () => {
      logAuthDiagnostic("warn", {
        operation: "google_oauth",
        stage: "initiation_pkce_cookie_write_failed",
        pkceVerifierPersisted: false,
      });
    },
  });
  if (!supabase) {
    logAuthDiagnostic("warn", {
      operation: "google_oauth",
      stage: "initiation_client_unavailable",
    });
    redirect("/login?error=configuration_error");
  }

  const origin = await getRequestOrigin();
  const intendedPath = getSafeInternalPath(formData.get("next")?.toString());
  const callbackUrl = new URL("/auth/callback", origin);
  if (intendedPath !== "/") callbackUrl.searchParams.set("next", intendedPath);

  let oauthResult;
  try {
    oauthResult = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl.toString(),
      },
    });
  } catch {
    logAuthDiagnostic("warn", {
      operation: "google_oauth",
      stage: "initiation_failed",
      pkceVerifierPersisted,
    });
    redirect("/login?error=oauth_start_failed");
  }

  const { data, error } = oauthResult;

  if (error || !data.url) {
    logAuthDiagnostic("warn", {
      operation: "google_oauth",
      stage: "initiation_failed",
      pkceVerifierPersisted,
      ...getSafeSupabaseError(error),
    });
    redirect("/login?error=oauth_start_failed");
  }

  logAuthDiagnostic("info", {
    operation: "google_oauth",
    stage: "initiation_ready",
    pkceVerifierPersisted,
  });

  redirect(data.url);
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase?.auth.signOut();
  redirect("/login");
}
