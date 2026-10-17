import React from "react";
import { redirect } from "next/navigation";
import { parseLoginError } from "@/lib/auth/login-errors";

import { getCurrentUser, getSupabaseAuthUser } from "@/lib/auth/server";
import { getSafeInternalPath, resolveLoginScreenState } from "@/lib/private-preview-auth";

import { PrivatePasswordLogin } from "./private-password-login";

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getSingleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = (await searchParams) ?? {};
  const [applicationUser, supabaseUser] = await Promise.all([
    getCurrentUser(),
    getSupabaseAuthUser(),
  ]);
  const state = resolveLoginScreenState({
    hasSupabaseAuthUser: Boolean(supabaseUser),
    hasApplicationUser: Boolean(applicationUser),
  });

  if (state === "SIGNED_IN")
    redirect(getSafeInternalPath(getSingleParam(params.next) ?? "/sales-agent"));

  return (
    <PrivatePasswordLogin
      loginError={parseLoginError(getSingleParam(params.error))}
      accessPending={state === "ACCESS_PENDING"}
      nextPath={getSafeInternalPath(getSingleParam(params.next) ?? "/sales-agent")}
    />
  );
}
