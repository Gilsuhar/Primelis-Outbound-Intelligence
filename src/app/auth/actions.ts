"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getSupabaseAuthConfig } from "@/lib/auth/env";
import { createSupabaseServerClient, getRequestOrigin } from "@/lib/auth/server";

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

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase?.auth.signOut();
  redirect("/login");
}
