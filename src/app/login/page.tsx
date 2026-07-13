import { redirect } from "next/navigation";

import { getCurrentUser, getSupabaseAuthUser } from "@/lib/auth/server";
import { resolveLoginScreenState } from "@/lib/private-preview-auth";

import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const [applicationUser, supabaseUser] = await Promise.all([
    getCurrentUser(),
    getSupabaseAuthUser(),
  ]);
  const state = resolveLoginScreenState({
    hasSupabaseAuthUser: Boolean(supabaseUser),
    hasApplicationUser: Boolean(applicationUser),
  });

  if (state === "SIGNED_IN") redirect("/");

  return <LoginForm accessPending={state === "ACCESS_PENDING"} />;
}
